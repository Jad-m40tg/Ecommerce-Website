const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createCheckout, getCheckout } = require('../services/payment');
const { activeSalesMap, buildOrderItems, computeTotals } = require('../services/pricing');

const router = express.Router();

const VALID_ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'refunded'];

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many checkout attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Tracking is a public endpoint keyed only by an 8-char code. The code space is
// large (36^8), but without a rate limit an attacker could still brute-force it
// to enumerate orders and read their item list / totals. Keep it tight.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many tracking requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const MAX_ORDER_ITEMS = 50;
const MAX_NAME_LEN = 200;
const MAX_EMAIL_LEN = 254;
const MAX_PHONE_LEN = 30;
const MAX_ADDRESS_LEN = 500;
const MAX_CITY_LEN = 100;
const MAX_NOTES_LEN = 1000;
const VALID_PAYMENT_METHODS = ['cash_on_delivery', 'card'];

function generateTrackingCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// True only when v is a positive whole number (accepts a number or a numeric
// string like "3", rejects "3.5", "abc", "", NaN, Infinity, and values < 1).
// Used to validate client-supplied product_id and quantity before they hit the
// DB, so stock can never be decremented by a fractional/negative/abused value.
function isPositiveInt(v) {
  if (typeof v === 'string' && v.trim() === '') return false;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 && String(n) !== 'Infinity';
}

// Accepts either an internal tracking code (8 chars A-Z/0-9) or a NOEST code
// (WPY-XX-XXXXXXXX shape). Deliberately prefix-agnostic so a future NOEST
// prefix change can never block customer tracking.
const TRACKING_CODE_PATTERN = /^([A-Z0-9]{8}|[A-Z0-9]{2,4}-[A-Z0-9]{2,4}-\d{6,10})$/i;

// GET /api/orders/track?code=XXXX — Public order tracking by tracking code.
router.get('/track', trackLimiter, (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string' || !TRACKING_CODE_PATTERN.test(code.trim())) {
    return res.status(400).json({ error: 'Please provide a valid tracking code' });
  }
  const codeU = code.trim().toUpperCase();
  // Note: `items` (the itemized line-by-line breakdown) is intentionally NOT
  // returned here — the public tracking page doesn't render it, so exposing it
  // to anyone holding the 8-char code would leak order contents. Only the
  // status/tracking fields the page actually needs are returned.
  const order = db.prepare('SELECT id, order_status, payment_status, payment_method, tracking_number, carrier, tracking_url, tracking_code, noest_tracking, noest_status, created_at, updated_at, total_cents FROM orders WHERE tracking_code = ? OR noest_tracking = ?').get(codeU, codeU);
  if (!order) return res.status(404).json({ error: 'Order not found. Please check your tracking code.' });
  // Surface the real carrier tracking code once the order is shipped
  order.tracking_code = order.noest_tracking || order.tracking_code;
  res.json({ order });
});

// Shared transaction: cancel an order and restore its stock.
// Used by the PATCH /:id admin route, the abandoned-order cleanup job, and the
// payment failure paths (webhook + status sync). Stock-aware: stock is only
// restored when the order actually had stock deducted (orders.stock_deducted=1).
//                 COD orders -> deducted at creation.
//                 paid card orders -> deducted when payment succeeded.
//                 pending/failed card orders -> never deducted -> nothing to restore.
// stock_deducted is a permanent record (never reset to 0) so that un-cancel and
// refund paths can still tell whether stock was originally taken.
// The conditional UPDATE only flips the order to cancelled if it isn't already,
// so concurrent cancels can never restore the same order's stock twice.
function cancelAndRestoreStock(orderId, order, extraUpdates, extraValues) {
  return db.transaction(() => {
    let sql = "UPDATE orders SET order_status = 'cancelled', updated_at = CURRENT_TIMESTAMP";
    const params = [];
    if (extraUpdates && extraUpdates.length) {
      sql += ', ' + extraUpdates.join(', ');
      params.push(...extraValues);
    }
    sql += " WHERE id = ? AND order_status != 'cancelled'";
    params.push(orderId);
    const result = db.prepare(sql).run(...params);
    if (result.changes === 0) return false;
    if (order.stock_deducted) {
      const items = JSON.parse(order.items);
      const stockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const item of items) {
        stockStmt.run(item.quantity, item.product_id);
      }
      console.log('[STOCK] Restored ' + items.reduce((s, i) => s + i.quantity, 0) + ' stock for order #' + orderId);
    } else {
      console.log('[STOCK] Order #' + orderId + ' had no deducted stock — nothing to restore on cancel');
    }
    return true;
  })();
}

// Shared transaction: refund an order and restore its stock.
// Used by the admin PATCH /:id route when payment_status is set to 'refunded'.
// Idempotent + atomic like cancelAndRestoreStock: the conditional UPDATE only
// flips to refunded when the order isn't already refunded and hasn't been
// cancelled (a cancellation already restored the stock), so repeated or
// concurrent refund calls can never restore the same order's stock twice.
// Stock-aware: only restores if the order had stock deducted (so refunding an
// order that lost stock (never deducted) won't inflate inventory).
function refundAndRestoreStock(orderId, order, extraUpdates, extraValues) {
  return db.transaction(() => {
    let sql = "UPDATE orders SET payment_status = 'refunded', updated_at = CURRENT_TIMESTAMP";
    const params = [];
    if (extraUpdates && extraUpdates.length) {
      sql += ', ' + extraUpdates.join(', ');
      params.push(...extraValues);
    }
    sql += " WHERE id = ? AND order_status != 'cancelled' AND payment_status != 'refunded'";
    params.push(orderId);
    const result = db.prepare(sql).run(...params);
    if (result.changes === 0) return false;
    if (order.stock_deducted) {
      const items = JSON.parse(order.items);
      const stockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const item of items) {
        stockStmt.run(item.quantity, item.product_id);
      }
      console.log('[STOCK] Refund restored ' + items.reduce((s, i) => s + i.quantity, 0) + ' stock for order #' + orderId);
    } else {
      console.log('[STOCK] Order #' + orderId + ' had no deducted stock — nothing to restore on refund');
    }
    return true;
  })();
}

// Shared transaction: deduct stock once an order's payment is confirmed paid.
// Used by the payment-success paths (webhook, status sync, cleanup). Only
// deducts if the order hasn't had stock deducted yet, so webhook + poll + cleanup
// racing to mark the same order paid can never double-deduct.
function deductStockForPaidOrder(orderId, order) {
  return db.transaction(() => {
    const updated = db.prepare(
      "UPDATE orders SET stock_deducted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock_deducted = 0"
    ).run(orderId);
    if (updated.changes === 0) return false;
    const items = JSON.parse(order.items);
    const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    for (const item of items) {
      stockStmt.run(item.quantity, item.product_id);
    }
    console.log('[STOCK] Deducted ' + items.reduce((s, i) => s + i.quantity, 0) + ' stock for paid order #' + orderId);
    return true;
  })();
}

// Builds the idempotent duplicate response for a retried checkout (same nonce).
// Shared by the nonce pre-check and the UNIQUE-constraint race fallback.
async function duplicateOrderResponse(existingOrder) {
  const response = {
    order: {
      id: existingOrder.id,
      order_status: existingOrder.order_status,
      payment_status: existingOrder.payment_status,
      tracking_code: existingOrder.tracking_code
    },
    tracking_code: existingOrder.tracking_code,
    duplicate: true
  };
  if (existingOrder.payment_reference) {
    try {
      const checkout = await getCheckout(existingOrder.payment_reference);
      if (checkout && checkout.checkout_url) {
        response.payment_url = checkout.checkout_url;
      }
    } catch (e) {
      console.error('Chargily getCheckout failed:', e.message);
    }
  }
  return response;
}

// POST /api/orders — Create a new order (public, rate-limited). Validates items, reserves stock, optionally initiates online payment.
router.post('/', checkoutLimiter, async (req, res, next) => {
  try {
    const { customer_name, customer_email, customer_phone, customer_address, customer_city, items, notes, payment_method, promo_code, nonce } = req.body;

    const PROMOS = {
      BOUL10:   { pct: 0.10 },
      WELCOME5: { pct: 0.05 }
    };
    const appliedPromo = promo_code && PROMOS[promo_code.toUpperCase()] ? { code: promo_code.toUpperCase(), pct: PROMOS[promo_code.toUpperCase()].pct } : null;

    if (!items || items.length > MAX_ORDER_ITEMS) {
      return res.status(400).json({ error: `Too many items. Maximum ${MAX_ORDER_ITEMS} items per order` });
    }

    if (!customer_name || !customer_email || !customer_phone || !customer_address || !customer_city) {
      return res.status(400).json({ error: 'customer_name, customer_email, customer_phone, customer_address, customer_city are required' });
    }

    // Enforce length limits
    if (customer_name.length > MAX_NAME_LEN) return res.status(400).json({ error: `customer_name must be ${MAX_NAME_LEN} characters or fewer` });
    if (customer_email.length > MAX_EMAIL_LEN) return res.status(400).json({ error: `customer_email must be ${MAX_EMAIL_LEN} characters or fewer` });
    if (customer_phone.length > MAX_PHONE_LEN) return res.status(400).json({ error: `customer_phone must be ${MAX_PHONE_LEN} characters or fewer` });
    if (customer_address.length > MAX_ADDRESS_LEN) return res.status(400).json({ error: `customer_address must be ${MAX_ADDRESS_LEN} characters or fewer` });
    if (customer_city.length > MAX_CITY_LEN) return res.status(400).json({ error: `customer_city must be ${MAX_CITY_LEN} characters or fewer` });
    if (notes && notes.length > MAX_NOTES_LEN) return res.status(400).json({ error: `notes must be ${MAX_NOTES_LEN} characters or fewer` });

    // Reject non-string customer fields (arrays/objects/numbers would otherwise
    // pass the length checks and be written straight into the DB as malformed data).
    for (const field of ['customer_name', 'customer_email', 'customer_phone', 'customer_address', 'customer_city']) {
      if (typeof req.body[field] !== 'string') {
        return res.status(400).json({ error: `${field} must be a string` });
      }
    }
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string' });
    }

    // Optional idempotency key — retrying a checkout with the same nonce
    // returns the existing order instead of creating a duplicate.
    if (nonce !== undefined && (typeof nonce !== 'string' || nonce.length > 100)) {
      return res.status(400).json({ error: 'nonce must be a string of 100 characters or fewer' });
    }

    // If a nonce was provided and an order for it already exists, return the
    // existing order (no new Chargily checkout, no new stock deduction).
    // The UNIQUE index on orders(nonce) makes a second insert impossible anyway.
    const existingNonceOrder = nonce ? db.prepare('SELECT id, payment_status, payment_reference, order_status, tracking_code FROM orders WHERE nonce = ?').get(nonce) : null;
    if (existingNonceOrder) {
      return res.status(200).json(await duplicateOrderResponse(existingNonceOrder));
    }

    // Validate payment method
    const validPayMethod = payment_method && VALID_PAYMENT_METHODS.includes(payment_method);
    if (payment_method && !validPayMethod) {
      return res.status(400).json({ error: `Invalid payment method. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!items || !items.length) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ error: 'Each item must be an object' });
      }
      // product_id must be a positive integer string/number; quantity must be a
      // positive integer. Rejecting fractional/NaN/negative values prevents a
      // client from driving fractional or negative stock deductions.
      if (!isPositiveInt(item.product_id)) {
        return res.status(400).json({ error: 'Each item must have a valid integer product_id' });
      }
      if (!isPositiveInt(item.quantity)) {
        return res.status(400).json({ error: 'Each item must have an integer quantity >= 1' });
      }
    }

    const feeRow = db.prepare("SELECT value FROM settings WHERE key = 'delivery_fee_cents'").get();
    const delivery_fee = feeRow ? Number(feeRow.value) : 0;
    const thresholdRow = db.prepare("SELECT value FROM settings WHERE key = 'free_delivery_threshold_cents'").get();
    const free_delivery_threshold = thresholdRow ? Number(thresholdRow.value) : 999999;

    const isOnlinePayment = payment_method && payment_method !== 'cash_on_delivery';
    const trackingCode = generateTrackingCode();
    const orderStatus = isOnlinePayment ? 'processing' : 'pending';

    const createOrder = db.transaction(() => {
      // One timestamp for the whole order — every line item is priced
      // against the same sale-active snapshot (services/pricing.js).
      const now = Date.now();
      const saleMap = activeSalesMap(now);
      const { resolvedItems, subtotal_cents } = buildOrderItems({
        items,
        dbGetProduct: (id) => db.prepare("SELECT id, name, price_cents, stock, status, colors, sizes FROM products WHERE id = ? AND status = 'active'").get(id),
        saleMap
      });

      const { discount_cents, shipping_cents, total_cents: rawTotal } = computeTotals({
        subtotal_cents,
        appliedPromo,
        deliveryFeeCents: delivery_fee,
        freeDeliveryThresholdCents: free_delivery_threshold
      });

      // Round the final total to a whole number of dinars (multiple of 100
      // cents) so the exact amount stored in the DB always equals the exact
      // amount sent to the Chargily/DZD gateway — a non-round cent total (e.g.
      // 9605c = 96.05 DA) could not otherwise be represented as a whole-DA
      // charge, causing a silent discrepancy between what is charged and the
      // order's recorded total.
      const total_cents = Math.round(rawTotal / 100) * 100;

      const stmt = db.prepare(`
        INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, customer_city, items, subtotal_cents, delivery_fee_cents, total_cents, payment_method, payment_status, order_status, notes, tracking_code, nonce, stock_deducted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(customer_name, customer_email, customer_phone, customer_address, customer_city,
        JSON.stringify(resolvedItems), subtotal_cents, shipping_cents, total_cents,
        payment_method || 'cash_on_delivery', orderStatus, notes || '', trackingCode, nonce || null,
        // Cash-on-delivery commits the sale immediately (stock leaves the shelf
        // at order time). Online (card) payments do NOT deduct stock yet — it is
        // released on the shelf until the payment is actually confirmed paid.
        isOnlinePayment ? 0 : 1);

      // Only cash-on-delivery deducts stock at creation. Online payments defer
      // the deduction until payments.js / the cleanup confirm the payment is
      // 'paid' (via webhook or status sync). So an abandoned/failed card checkout
      // never removes stock from the shelf.
      if (!isOnlinePayment) {
        const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
        for (const item of resolvedItems) {
          stockStmt.run(item.quantity, item.product_id);
        }
      }

      return { id: result.lastInsertRowid, resolvedItems, subtotal_cents, actual_shipping: shipping_cents, total_cents };
    });

    const { id, resolvedItems, subtotal_cents, actual_shipping, total_cents } = createOrder();

    const orderData = {
      id, customer_name, customer_email, items: resolvedItems,
      subtotal_cents, delivery_fee_cents: actual_shipping, total_cents,
      payment_method: payment_method || 'cash_on_delivery',
      payment_status: 'pending', order_status: orderStatus,
      tracking_code: trackingCode
    };

    if (isOnlinePayment) {
      const dzdAmount = Math.round(total_cents / 100);
      try {
        const checkout = await createCheckout({
          amount: dzdAmount,
          orderId: id,
          customerEmail: customer_email,
          customerName: customer_name,
          // Callback URLs must point back to whatever origin the customer is
          // actually browsing (localhost, LAN IP, or ngrok tunnel). Deriving
          // from the request keeps Chargily's success/failure redirect working
          // in every case. trust proxy is set, so req.protocol is https behind
          // an ngrok/HTTPS reverse proxy.
          baseUrl: req.protocol + '://' + req.get('host')
        });

        db.prepare("UPDATE orders SET payment_reference = ? WHERE id = ?").run(checkout.id, id);

        return res.status(201).json({
          order: orderData,
          payment_url: checkout.checkout_url,
          tracking_code: trackingCode
        });
      } catch (payErr) {
        console.error('Chargily checkout creation failed:', payErr);
        return res.status(201).json({
          order: orderData,
          error: 'Payment gateway unavailable. Your order was saved. Please try again.',
          tracking_code: trackingCode
        });
      }
    }

    res.status(201).json({ order: orderData, tracking_code: trackingCode });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && nonce) {
      // Race: a concurrent request with the same nonce won the insert.
      const existing = db.prepare('SELECT id, payment_status, payment_reference, order_status, tracking_code FROM orders WHERE nonce = ?').get(nonce);
      if (existing) return res.status(200).json(await duplicateOrderResponse(existing));
    }
    if (err.message && err.message.startsWith('Insufficient stock')) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message && err.message.startsWith('Product')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.use(authenticateToken, requireAdmin);

// GET /api/orders — List all orders (admin only). Supports status filter and pagination.
router.get('/', (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999);
  let sql = 'SELECT * FROM orders WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as count FROM orders WHERE 1=1';
  const params = [];
  const countParams = [];

  if (status) { sql += ' AND order_status = ?'; countSql += ' AND order_status = ?'; params.push(status); countParams.push(status); }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(safeLimit, (safePage - 1) * safeLimit);

  const orders = db.prepare(sql).all(...params);
  const { count } = db.prepare(countSql).get(...countParams);

  res.json({ orders, total: count, page: safePage, limit: safeLimit });
});

// GET /api/orders/:id — Get a single order by ID (admin only).
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// PATCH /api/orders/:id — Update order status, payment status, or tracking info (admin only).
router.patch('/:id', (req, res) => {
  const { status, payment_status, tracking_number, carrier, tracking_url, noest_tracking, noest_status } = req.body;

  const order = db.prepare('SELECT order_status, items, stock_deducted FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const updates = [];
  const values = [];

  if (status) {
    if (!VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid order status. Must be one of: ${VALID_ORDER_STATUSES.join(', ')}` });
    }
    updates.push('order_status = ?');
    values.push(status);
  }

  if (payment_status) {
    if (!VALID_PAYMENT_STATUSES.includes(payment_status)) {
      return res.status(400).json({ error: `Invalid payment status. Must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}` });
    }
    updates.push('payment_status = ?');
    values.push(payment_status);
    if (payment_status === 'paid') {
      updates.push('paid_at = CURRENT_TIMESTAMP');
    }
  }

  if (tracking_number !== undefined) { updates.push('tracking_number = ?'); values.push(String(tracking_number).slice(0, 200)); }
  if (carrier !== undefined) { updates.push('carrier = ?'); values.push(String(carrier).slice(0, 100)); }
  if (tracking_url !== undefined) { updates.push('tracking_url = ?'); values.push(String(tracking_url).slice(0, 500)); }
  if (noest_tracking !== undefined) { updates.push('noest_tracking = ?'); values.push(String(noest_tracking).slice(0, 100)); }
  if (noest_status !== undefined) { updates.push('noest_status = ?'); values.push(String(noest_status).slice(0, 50)); }

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(req.params.id);

  // Wrap status change + stock restoration in a transaction for atomicity
  if (status === 'cancelled' && order.order_status !== 'cancelled') {
    // Build extra updates (everything except order_status) for the cancel transaction
    const extraUpdates = [];
    const extraValues = [];
    if (payment_status) {
      extraUpdates.push('payment_status = ?');
      extraValues.push(payment_status);
      if (payment_status === 'paid') extraUpdates.push('paid_at = CURRENT_TIMESTAMP');
    }
    if (tracking_number !== undefined) { extraUpdates.push('tracking_number = ?'); extraValues.push(String(tracking_number).slice(0, 200)); }
    if (carrier !== undefined) { extraUpdates.push('carrier = ?'); extraValues.push(String(carrier).slice(0, 100)); }
    if (tracking_url !== undefined) { extraUpdates.push('tracking_url = ?'); extraValues.push(String(tracking_url).slice(0, 500)); }
    if (noest_tracking !== undefined) { extraUpdates.push('noest_tracking = ?'); extraValues.push(String(noest_tracking).slice(0, 100)); }
    if (noest_status !== undefined) { extraUpdates.push('noest_status = ?'); extraValues.push(String(noest_status).slice(0, 50)); }
    try {
      cancelAndRestoreStock(req.params.id, order, extraUpdates, extraValues);
    } catch (e) {
      console.error('[STOCK] Failed to restore stock for order #' + req.params.id, e);
      return res.status(500).json({ error: 'Failed to update order' });
    }
  } else if (status && status !== 'cancelled' && order.order_status === 'cancelled') {
    const unCancelAndUpdate = db.transaction(() => {
      // Only re-deduct / stock-check when this order originally had stock taken.
      // A cancelled-but-never-paid card order never deducted stock, so un-cancelling
      // it must NOT remove stock from the shelf.
      if (order.stock_deducted) {
        const items = JSON.parse(order.items);
        const stockCheckStmt = db.prepare('SELECT id, name, stock FROM products WHERE id = ?');
        for (const item of items) {
          const product = stockCheckStmt.get(item.product_id);
          if (!product || product.stock < item.quantity) {
            const productName = product ? product.name : `#${item.product_id}`;
            throw new Error(`INSUFFICIENT_STOCK:${productName}`);
          }
        }
      }
      const result = db.prepare(`UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
      if (result.changes === 0) throw new Error('NOT_FOUND');
      if (order.stock_deducted) {
        const items = JSON.parse(order.items);
        const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
        for (const item of items) {
          stockStmt.run(item.quantity, item.product_id);
        }
        console.log(`[STOCK] Re-deducted ${items.reduce((s, i) => s + i.quantity, 0)} stock for un-cancelled order #${req.params.id}`);
      }
    });
    try {
      unCancelAndUpdate();
    } catch (e) {
      if (e.message === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found' });
      if (e.message && e.message.startsWith('INSUFFICIENT_STOCK:')) {
        const productName = e.message.split(':')[1];
        return res.status(400).json({ error: `Cannot un-cancel: insufficient stock for ${productName}` });
      }
      console.error('[STOCK] Failed to re-deduct stock for order #' + req.params.id, e);
      return res.status(500).json({ error: 'Failed to update order' });
    }
  } else if (
    payment_status === 'refunded' &&
    order.order_status !== 'cancelled' &&
    !(status === 'cancelled')
  ) {
    // Refund flow: another transactional stock restoration path. Skips orders
    // that are already cancelled (the cancel path above already restored their
    // stock) and requests that cancel in the same call. The conditional UPDATE
    // inside also refuses already-refunded orders, so a repeated refund can
    // never double-restore stock.
    const extraUpdates = [];
    const extraValues = [];
    if (status) {
      if (!VALID_ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid order status. Must be one of: ${VALID_ORDER_STATUSES.join(', ')}` });
      }
      extraUpdates.push('order_status = ?');
      extraValues.push(status);
    }
    if (tracking_number !== undefined) { extraUpdates.push('tracking_number = ?'); extraValues.push(String(tracking_number).slice(0, 200)); }
    if (carrier !== undefined) { extraUpdates.push('carrier = ?'); extraValues.push(String(carrier).slice(0, 100)); }
    if (tracking_url !== undefined) { extraUpdates.push('tracking_url = ?'); extraValues.push(String(tracking_url).slice(0, 500)); }
    if (noest_tracking !== undefined) { extraUpdates.push('noest_tracking = ?'); extraValues.push(String(noest_tracking).slice(0, 100)); }
    if (noest_status !== undefined) { extraUpdates.push('noest_status = ?'); extraValues.push(String(noest_status).slice(0, 50)); }
    try {
      refundAndRestoreStock(req.params.id, order, extraUpdates, extraValues);
    } catch (e) {
      console.error('[STOCK] Failed to restore stock on refund for order #' + req.params.id, e);
      return res.status(500).json({ error: 'Failed to update order' });
    }
  } else {
    const result = db.prepare(`UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
    // If the admin is manually marking a never-deducted order as paid (e.g. a
    // card payment confirmed offline), deduct its stock now. Idempotent.
    if (payment_status === 'paid' && !order.stock_deducted) {
      const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      if (fresh) deductStockForPaidOrder(req.params.id, fresh);
    }
  }

  res.json({ success: true });
});

router.cancelAndRestoreStock = cancelAndRestoreStock;
router.refundAndRestoreStock = refundAndRestoreStock;
router.deductStockForPaidOrder = deductStockForPaidOrder;
module.exports = router;
