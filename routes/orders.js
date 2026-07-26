// routes/orders.js — Customer checkout (public) and order management (admin).
// Public: POST / creates a new order and decrements stock.
// Admin: GET / lists orders, GET /:id views one, PATCH /:id updates status.

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'refunded'];

// Rate limiter for checkout: max 20 requests per 15 min per IP
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many checkout attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Max items allowed in a single order
const MAX_ORDER_ITEMS = 50;

// ============================================================
// PUBLIC endpoint — no authentication required
// ============================================================

// POST /api/orders — Customer checkout.
// 1. Validates customer info and email format
// 2. Loops through items, checks each product exists, is active, and has enough stock
// 3. Calculates subtotal + delivery fee from database (never trusts client prices)
// 4. Creates the order AND decrements stock inside a transaction (atomic operation)
//    This prevents race conditions where two simultaneous checkouts both succeed
//    even though there's only enough stock for one.
router.post('/', checkoutLimiter, (req, res, next) => {
  try {
    const { customer_name, customer_email, customer_phone, customer_address, customer_city, items, notes } = req.body;

    // Limit total number of items in a single order
    if (!items || items.length > MAX_ORDER_ITEMS) {
      return res.status(400).json({ error: `Too many items. Maximum ${MAX_ORDER_ITEMS} items per order` });
    }

    // Validate required fields
    if (!customer_name || !customer_email || !customer_phone || !customer_address || !customer_city) {
      return res.status(400).json({ error: 'customer_name, customer_email, customer_phone, customer_address, customer_city are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!items || !items.length) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Validate each item has product_id and quantity BEFORE the transaction
    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity < 1) {
        return res.status(400).json({ error: 'Each item must have product_id and quantity >= 1' });
      }
    }

    // Get delivery fee from settings (configured in admin panel)
    const feeRow = db.prepare("SELECT value FROM settings WHERE key = 'delivery_fee_cents'").get();
    const delivery_fee = feeRow ? Number(feeRow.value) : 0;

    // Wrap everything in a transaction with IMMEDIATE locking.
    // This ensures stock validation + decrement is atomic — no two concurrent
    // checkouts can both read the same stock and both succeed.
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
        INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, customer_city, items, subtotal_cents, delivery_fee_cents, total_cents, payment_status, order_status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?)
      `);
      const result = stmt.run(customer_name, customer_email, customer_phone, customer_address, customer_city,
        JSON.stringify(resolvedItems), subtotal_cents, delivery_fee, total_cents, notes || '');

      // Decrease stock for each ordered product
      const stockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      for (const item of resolvedItems) {
        stockStmt.run(item.quantity, item.product_id);
      }

      return { id: result.lastInsertRowid, resolvedItems, subtotal_cents, total_cents };
    });

    const { id, resolvedItems, subtotal_cents, total_cents } = createOrder();

    res.status(201).json({
      order: { id, customer_name, customer_email, items: resolvedItems, subtotal_cents, delivery_fee_cents: delivery_fee, total_cents, payment_status: 'pending', order_status: 'pending' }
    });
  } catch (err) {
    // Convert transaction errors to proper 400 responses
    if (err.message && err.message.startsWith('Insufficient stock')) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message && err.message.startsWith('Product')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ============================================================
// ADMIN endpoints — authentication required from here down
// ============================================================
router.use(authenticateToken, requireAdmin);

// GET /api/orders — List all orders with optional status filter and pagination.
router.get('/', (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
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

// GET /api/orders/:id — Get a single order with full details
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// PATCH /api/orders/:id — Update an order's status (e.g. pending → shipped).
// Only accepts values from the VALID_ORDER_STATUSES whitelist.
router.patch('/:id', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });

  if (!VALID_ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_ORDER_STATUSES.join(', ')}` });
  }

  const result = db.prepare('UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });
  res.json({ success: true });
});

module.exports = router;
