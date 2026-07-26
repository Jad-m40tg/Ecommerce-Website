// routes/customers.js — Customer management (admin only).
// Customers are extracted from orders (no separate customer accounts).
// Grouped by email to avoid duplicates when the same person orders twice.

const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

// GET /api/customers — List unique customers with search and pagination.
// Groups orders by customer_email so each person appears once.
// Calculates order_count and total_spent from all their orders.
router.get('/', (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);

  // Main query: group orders by email, aggregate stats
  let sql = 'SELECT customer_name, customer_email, customer_phone, customer_address, customer_city, COUNT(*) as order_count, SUM(total_cents) as total_spent_cents, MIN(created_at) as first_order, MAX(created_at) as last_order FROM orders WHERE 1=1';
  let countSql = 'SELECT COUNT(DISTINCT customer_email) as count FROM orders WHERE 1=1';
  const params = [];
  const countParams = [];

  // Optional search filter (matches name or email)
  if (search) {
    const clause = ' AND (customer_name LIKE ? OR customer_email LIKE ?)';
    sql += clause;
    countSql += clause;
    params.push(`%${search}%`, `%${search}%`);
    countParams.push(`%${search}%`, `%${search}%`);
  }

  sql += ' GROUP BY customer_email ORDER BY last_order DESC LIMIT ? OFFSET ?';
  params.push(safeLimit, (Number(page) - 1) * safeLimit);

  const customers = db.prepare(sql).all(...params);
  const { count } = db.prepare(countSql).get(...countParams);

  res.json({ customers, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/customers/:email — Get a single customer's full profile.
// Returns their info, all their orders, and lifetime stats (total orders + spending).
// The email is URL-encoded in the URL, so we decode it first.
router.get('/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const customer = db.prepare('SELECT customer_name, customer_email, customer_phone, customer_address, customer_city FROM orders WHERE customer_email = ? LIMIT 1').get(email);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  // Get all orders for this customer
  const orders = db.prepare('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC').all(email);
  // Get lifetime stats
  const stats = db.prepare('SELECT COUNT(*) as order_count, SUM(total_cents) as total_spent_cents FROM orders WHERE customer_email = ?').get(email);

  res.json({ ...customer, ...stats, orders });
});

module.exports = router;
