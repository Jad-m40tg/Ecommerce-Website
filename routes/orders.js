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
  const order = db.prepare('SELECT id, order_status, payment_status, payment_method, tracking_number, carrier, tracking_url, tracking_code, created_at, updated_at, items, total_cents FROM orders WHERE tracking_code = ?').get(code.toUpperCase());
  if (!order) return res.status(404).json({ error: 'Order not found. Please check your tracking code.' });
  res.json({ order });
});

// POST /api/orders — Create a new order (public, rate-limited). Validates items, reserves stock, optionally initiates online payment.
router.post('/', checkoutLimiter, async (req, res, next) => {
  try {
    const { customer_name, customer_email, customer_phone, customer_address, customer_city, items, notes, payment_method } = req.body;

    if (!items || items.length > MAX_ORDER_ITEMS) {
      return res.status(400).json({ error: `Too many items. Maximum ${MAX_ORDER_ITEMS} items per order` });
    }

    if (!customer_name || !customer_email || !customer_phone || !customer_address || !customer_city) {
      return res.status(400).json({ error: 'customer_name, customer_email, customer_phone, customer_address, customer_city are required' });
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

      const total_cents = subtotal_cents + delivery_fee;

      const stmt = db.prepare(`
        INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, customer_city, items, subtotal_cents, delivery_fee_cents, total_cents, payment_method, payment_status, order_status, notes, tracking_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `);
      const result = stmt.run(customer_name, customer_email, customer_phone, customer_address, customer_city,
        JSON.stringify(resolvedItems), subtotal_cents, delivery_fee, total_cents,
        payment_method || 'cash_on_delivery', orderStatus, notes || '', trackingCode);

      const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      for (const item of resolvedItems) {
        stockStmt.run(item.quantity, item.product_id);
      }

      return { id: result.lastInsertRowid, resolvedItems, subtotal_cents, total_cents };
    });

    const { id, resolvedItems, subtotal_cents, total_cents } = createOrder();

    const orderData = {
      id, customer_name, customer_email, items: resolvedItems,
      subtotal_cents, delivery_fee_cents: delivery_fee, total_cents,
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
          customerName: customer_name
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
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999);
  let sql = 'SELECT * FROM orders WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as count FROM orders WHERE 1=1';
  const params = [];
  const countParams = [];

  if (status) { sql += ' AND order_status = ?'; countSql += ' AND order_status = ?'; params.push(status); countParams.push(status); }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(safeLimit, (Number(page) - 1) * safeLimit);

  const orders = db.prepare(sql).all(...params);
  const { count } = db.prepare(countSql).get(...countParams);

  res.json({ orders, total: count, page: Number(page), limit: safeLimit });
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

  if (tracking_number !== undefined) { updates.push('tracking_number = ?'); values.push(tracking_number); }
  if (carrier !== undefined) { updates.push('carrier = ?'); values.push(carrier); }
  if (tracking_url !== undefined) { updates.push('tracking_url = ?'); values.push(tracking_url); }
  if (noest_tracking !== undefined) { updates.push('noest_tracking = ?'); values.push(noest_tracking); }
  if (noest_status !== undefined) { updates.push('noest_status = ?'); values.push(noest_status); }

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(req.params.id);
  const result = db.prepare(`UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
  if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
  res.json({ success: true });
});

module.exports = router;
