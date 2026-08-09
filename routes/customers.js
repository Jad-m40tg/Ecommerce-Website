// routes/customers.js — Customer management (admin only).
// Customers are extracted from orders (no separate customer accounts).
// Grouped by email to avoid duplicates when the same person orders twice.
// "Removing" a customer hides them from the UI without deleting orders,
// so revenue/analytics calculations remain accurate.

const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

function escapeLike(str) {
  return String(str).replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// GET /api/customers — List unique customers with search and pagination.
// Groups orders by customer_email so each person appears once.
// Excludes hidden customers (soft-deleted from UI only).
router.get('/', (req, res) => {
  const { search, page = 1, limit = 20, show_hidden } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999);

  let sql = 'SELECT customer_name, customer_email, customer_phone, customer_address, customer_city, COUNT(*) as order_count, SUM(total_cents) as total_spent_cents, MIN(created_at) as first_order, MAX(created_at) as last_order FROM orders WHERE 1=1';
  let countSql = 'SELECT COUNT(DISTINCT customer_email) as count FROM orders WHERE 1=1';
  const params = [];
  const countParams = [];

  // Exclude hidden customers unless show_hidden is set
  if (!show_hidden) {
    const hideClause = ' AND customer_email NOT IN (SELECT email FROM hidden_customers)';
    sql += hideClause;
    countSql += hideClause;
  }

  if (search) {
    const safeSearch = escapeLike(search);
    const clause = ' AND (customer_name LIKE ? ESCAPE \'\\\' OR customer_email LIKE ? ESCAPE \'\\\')';
    sql += clause;
    countSql += clause;
    params.push(`%${safeSearch}%`, `%${safeSearch}%`);
    countParams.push(`%${safeSearch}%`, `%${safeSearch}%`);
  }

  sql += ' GROUP BY customer_email ORDER BY last_order DESC LIMIT ? OFFSET ?';
  params.push(safeLimit, (Number(page) - 1) * safeLimit);

  const customers = db.prepare(sql).all(...params);
  const { count } = db.prepare(countSql).get(...countParams);

  res.json({ customers, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/customers/hidden — List hidden customers (for restore UI).
router.get('/hidden', (req, res) => {
  const hidden = db.prepare(`
    SELECT h.email, h.hidden_at, COUNT(*) as order_count, SUM(o.total_cents) as total_spent_cents
    FROM hidden_customers h
    LEFT JOIN orders o ON o.customer_email = h.email
    GROUP BY h.email
    ORDER BY h.hidden_at DESC
  `).all();
  res.json({ customers: hidden });
});

// GET /api/customers/:email — Get a single customer's full profile.
router.get('/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const customer = db.prepare('SELECT customer_name, customer_email, customer_phone, customer_address, customer_city FROM orders WHERE customer_email = ? LIMIT 1').get(email);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const orders = db.prepare('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC').all(email);
  const stats = db.prepare('SELECT COUNT(*) as order_count, SUM(total_cents) as total_spent_cents FROM orders WHERE customer_email = ?').get(email);
  const hidden = db.prepare('SELECT 1 FROM hidden_customers WHERE email = ?').get(email);

  res.json({ ...customer, ...stats, orders, hidden: !!hidden });
});

// DELETE /api/customers/:email — Hide a customer from the UI.
// Does NOT delete any orders — revenue and analytics stay intact.
router.delete('/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const existing = db.prepare('SELECT COUNT(*) as count FROM orders WHERE customer_email = ?').get(email);
  if (!existing || existing.count === 0) return res.status(404).json({ error: 'Customer not found' });

  // Upsert into hidden_customers (idempotent — already hidden is fine)
  db.prepare('INSERT OR IGNORE INTO hidden_customers (email) VALUES (?)').run(email);
  res.json({ success: true, hidden: true });
});

// POST /api/customers/:email/restore — Restore a hidden customer to the UI.
router.post('/:email/restore', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const result = db.prepare('DELETE FROM hidden_customers WHERE email = ?').run(email);
  if (result.changes === 0) return res.json({ success: true, restored: false });
  res.json({ success: true, restored: true });
});

// PATCH /api/customers/:email — Update customer data across all their orders.
router.patch('/:email', (req, res) => {
  const oldEmail = decodeURIComponent(req.params.email);
  const { customer_name, customer_email, customer_phone, customer_address, customer_city } = req.body;

  const existing = db.prepare('SELECT COUNT(*) as count FROM orders WHERE customer_email = ?').get(oldEmail);
  if (!existing || existing.count === 0) return res.status(404).json({ error: 'Customer not found' });

  const updates = [];
  const values = [];

  if (customer_name !== undefined) { updates.push('customer_name = ?'); values.push(customer_name); }
  if (customer_email !== undefined && customer_email !== oldEmail) {
    const dup = db.prepare('SELECT COUNT(*) as count FROM orders WHERE customer_email = ?').get(customer_email);
    if (dup && dup.count > 0) return res.status(400).json({ error: 'Email already in use' });
    updates.push('customer_email = ?'); values.push(customer_email);
  }
  if (customer_phone !== undefined) { updates.push('customer_phone = ?'); values.push(customer_phone); }
  if (customer_address !== undefined) { updates.push('customer_address = ?'); values.push(customer_address); }
  if (customer_city !== undefined) { updates.push('customer_city = ?'); values.push(customer_city); }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(oldEmail);

  const result = db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE customer_email = ?`).run(...values);
  res.json({ success: true, updated_orders: result.changes });
});

module.exports = router;
