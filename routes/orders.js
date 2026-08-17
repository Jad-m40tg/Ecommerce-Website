const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createCheckout } = require('../services/payment');

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

// GET /api/orders/track?code=XXXX — Public order tracking by tracking code.
router.get('/track', (req, res) => {
  const { code } = req.query;
  if (!code || code.length < 4) {
    return res.status(400).json({ error: 'Please provide a valid tracking code' });
  }
  const codeU = code.toUpperCase();
  const order = db.prepare('SELECT id, order_status, payment_status, payment_method, tracking_number, carrier, tracking_url, tracking_code, noest_tracking, noest_status, created_at, updated_at, items, total_cents FROM orders WHERE tracking_code = ? OR noest_tracking = ?').get(codeU, codeU);
  if (!order) return res.status(404).json({ error: 'Order not found. Please check your tracking code.' });
  // Surface the real carrier tracking code once the order is shipped
  order.tracking_code = order.noest_tracking || order.tracking_code;
  res.json({ order });
});

// Shared transaction: cancel an order and restore its stock.
// Used by both the PATCH /:id admin route and the abandoned-order cleanup job.
// extraUpdates/extraValues allow additional SET clauses (e.g. carrier) alongside the cancel.
function cancelAndRestoreStock(orderId, order, extraUpdates, extraValues) {
  db.transaction(() => {
    let sql = "UPDATE orders SET order_status = 'cancelled', updated_at = CURRENT_TIMESTAMP";
    const params = [];
    if (extraUpdates && extraUpdates.length) {
      sql += ', ' + extraUpdates.join(', ');
      params.push(...extraValues);
    }
    sql += ' WHERE id = ?';
    params.push(orderId);
    db.prepare(sql).run(...params);
    const items = JSON.parse(order.items);
    const stockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    for (const item of items) {
      stockStmt.run(item.quantity, item.product_id);
    }
    console.log('[STOCK] Restored ' + items.reduce((s, i) => s + i.quantity, 0) + ' stock for order #' + orderId);
  })();
}

// POST /api/orders — Create a new order (public, rate-limited). Validates items, reserves stock, optionally initiates online payment.
router.post('/', checkoutLimiter, async (req, res, next) => {
  try {
    const { customer_name, customer_email, customer_phone, customer_address, customer_city, items, notes, payment_method, promo_code } = req.body;

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
      if (!item.product_id || !item.quantity || item.quantity < 1) {
        return res.status(400).json({ error: 'Each item must have product_id and quantity >= 1' });
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
      let subtotal_cents = 0;
      const resolvedItems = [];

      for (const item of items) {
        const product = db.prepare("SELECT id, name, price_cents, stock, status FROM products WHERE id = ? AND status = 'active'").get(item.product_id);
        if (!product) throw new Error(`Product ${item.product_id} not found or inactive`);
        if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

        subtotal_cents += product.price_cents * item.quantity;
        resolvedItems.push({ product_id: product.id, name: product.name, price_cents: product.price_cents, quantity: item.quantity });
      }

      const discount_cents = appliedPromo ? Math.round(subtotal_cents * appliedPromo.pct) : 0;
      const actual_shipping = subtotal_cents >= free_delivery_threshold ? 0 : delivery_fee;
      const total_cents = subtotal_cents - discount_cents + actual_shipping;

      const stmt = db.prepare(`
        INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, customer_city, items, subtotal_cents, delivery_fee_cents, total_cents, payment_method, payment_status, order_status, notes, tracking_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `);
      const result = stmt.run(customer_name, customer_email, customer_phone, customer_address, customer_city,
        JSON.stringify(resolvedItems), subtotal_cents, actual_shipping, total_cents,
        payment_method || 'cash_on_delivery', orderStatus, notes || '', trackingCode);

      const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      for (const item of resolvedItems) {
        stockStmt.run(item.quantity, item.product_id);
      }

      return { id: result.lastInsertRowid, resolvedItems, subtotal_cents, actual_shipping, total_cents };
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

  const order = db.prepare('SELECT order_status, items FROM orders WHERE id = ?').get(req.params.id);
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
      const items = JSON.parse(order.items);
      const stockCheckStmt = db.prepare('SELECT id, name, stock FROM products WHERE id = ?');
      for (const item of items) {
        const product = stockCheckStmt.get(item.product_id);
        if (!product || product.stock < item.quantity) {
          const productName = product ? product.name : `#${item.product_id}`;
          throw new Error(`INSUFFICIENT_STOCK:${productName}`);
        }
      }
      const result = db.prepare(`UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
      if (result.changes === 0) throw new Error('NOT_FOUND');
      const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      for (const item of items) {
        stockStmt.run(item.quantity, item.product_id);
      }
      console.log(`[STOCK] Re-deducted ${items.reduce((s, i) => s + i.quantity, 0)} stock for un-cancelled order #${req.params.id}`);
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
  } else {
    const result = db.prepare(`UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
  }

  res.json({ success: true });
});

router.cancelAndRestoreStock = cancelAndRestoreStock;
module.exports = router;
