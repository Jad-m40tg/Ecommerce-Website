// routes/analytics.js — Analytics dashboard data (admin only).
// Provides revenue breakdowns, top products, category stats, and customer growth.
// All endpoints require admin authentication.

const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

// GET /api/analytics/overview — High-level dashboard stats.
// Returns total revenue, order count, product count, unique customer count,
// and the 5 most recent orders — all in a single query batch.
router.get('/overview', (req, res) => {
  // Optional ?days=N filters revenue/order totals to the last N days.
  // Without the param, all-time stats are returned (backward compatible).
  const days = Number(req.query.days) || 0;
  const inRange = days >= 1;
  const rangeFilter = inRange ? `created_at >= date('now', 'localtime', '-' || ${days} || ' days')` : null;

  const revenue = db.prepare("SELECT COALESCE(SUM(total_cents), 0) as total_revenue FROM orders WHERE payment_status = 'paid'" + (rangeFilter ? ' AND ' + rangeFilter : '')).get();
  const revenue30d = db.prepare("SELECT COALESCE(SUM(total_cents), 0) as revenue_30d FROM orders WHERE payment_status = 'paid'" + (rangeFilter ? ' AND ' + rangeFilter : " AND created_at >= date('now', 'localtime', '-30 days')")).get();
  const orders = db.prepare('SELECT COUNT(*) as total_orders FROM orders' + (rangeFilter ? ' WHERE ' + rangeFilter : '')).get();
  const products = db.prepare('SELECT COUNT(*) as total_products FROM products').get();
  const customers = db.prepare('SELECT COUNT(DISTINCT customer_email) as total_customers FROM orders').get();
  const recentOrders = db.prepare('SELECT id, customer_name, customer_email, total_cents, order_status, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 5').all();

  res.json({
    total_revenue_cents: revenue.total_revenue,
    revenue_30d_cents: revenue30d.revenue_30d,
    total_orders: orders.total_orders,
    total_products: products.total_products,
    total_customers: customers.total_customers,
    recent_orders: recentOrders
  });
});

// GET /api/analytics/revenue?period=daily|weekly|monthly
// Revenue grouped by time period, only counting paid orders.
// Uses SQLite's strftime() to group dates into day/week/month buckets.
router.get('/revenue', (req, res) => {
  const { period = 'daily' } = req.query;
  // Optional ?days=N selects the range: 7/30 → daily, 90 → weekly (84 days), 365 → monthly.
  const days = Number(req.query.days) || 0;

  let sql;
  if (period === 'weekly') {
    // 90D range maps to the last 12 ISO weeks (84 days); no param keeps the current default
    const weekDays = 84;
    sql = `SELECT strftime('%Y-%W', created_at, 'localtime') as period, SUM(total_cents) as revenue_cents, COUNT(*) as order_count
           FROM orders WHERE payment_status = 'paid' AND created_at >= date('now', 'localtime', '-' || ${weekDays} || ' days')
           GROUP BY period ORDER BY period`;
  } else if (period === 'monthly') {
    // Last 12 months grouped by year-month ('-12 months' keeps correct month grouping for 1Y)
    sql = `SELECT strftime('%Y-%m', created_at, 'localtime') as period, SUM(total_cents) as revenue_cents, COUNT(*) as order_count
           FROM orders WHERE payment_status = 'paid' AND created_at >= date('now', 'localtime', '-12 months')
           GROUP BY period ORDER BY period`;
  } else {
    // Daily buckets: ?days=7 → last 7 days; default (or ?days=30) → last 30 days
    const dailyDays = days >= 1 ? days : 30;
    sql = `SELECT date(created_at, 'localtime') as period, SUM(total_cents) as revenue_cents, COUNT(*) as order_count
           FROM orders WHERE payment_status = 'paid' AND created_at >= date('now', 'localtime', '-' || ${dailyDays} || ' days')
           GROUP BY period ORDER BY period`;
  }

  const data = db.prepare(sql).all();
  res.json({ period, data });
});

// GET /api/analytics/top-products?limit=10
// Finds the best-selling products by extracting items from order JSON.
// SQLite's json_each() expands the JSON items array into individual rows,
// then we group by product_id and sum quantities and revenue.
router.get('/top-products', (req, res) => {
  const { limit = 10 } = req.query;

  const data = db.prepare(`
    SELECT product_id, name, SUM(quantity) as total_quantity, SUM(price_cents * quantity) as total_revenue_cents
    FROM (
      SELECT json_extract(value, '$.product_id') as product_id,
             json_extract(value, '$.name') as name,
             json_extract(value, '$.price_cents') as price_cents,
             json_extract(value, '$.quantity') as quantity
      FROM orders, json_each(orders.items)
      WHERE orders.payment_status = 'paid'
    )
    GROUP BY product_id
    ORDER BY total_revenue_cents DESC
    LIMIT ?
  `).all(Number(limit));

  res.json({ data });
});

// GET /api/analytics/categories — Category breakdown.
// Two datasets:
//   1. Product count per category (how many products in each category)
//   2. Sales per category (how many units sold and revenue, from order items)
// Uses json_each() to unpack order items, then JOINs with products to get category.
router.get('/categories', (req, res) => {
  const data = db.prepare(`
    SELECT category, COUNT(*) as product_count
    FROM products
    GROUP BY category
    ORDER BY product_count DESC
  `).all();

  const sales = db.prepare(`
    SELECT p.category, SUM(json_extract(j.value, '$.quantity')) as total_sold, SUM(json_extract(j.value, '$.price_cents') * json_extract(j.value, '$.quantity')) as total_revenue_cents
    FROM orders o, json_each(o.items) j
    JOIN products p ON p.id = json_extract(j.value, '$.product_id')
    WHERE o.payment_status = 'paid'
    GROUP BY p.category
    ORDER BY total_revenue_cents DESC
  `).all();

  res.json({ categories: data, sales });
});

// GET /api/analytics/customer-growth — Monthly new customer count.
// Counts distinct customer emails per month. A "new customer" is someone
// whose first order was placed in that month (subquery excludes people
// who ordered before that month). Returns last 12 months.
router.get('/customer-growth', (req, res) => {
  const data = db.prepare(`
    WITH first_orders AS (
      SELECT customer_email, MIN(created_at) as first_order_date
      FROM orders
      GROUP BY customer_email
    )
    SELECT strftime('%Y-%m', first_order_date) as month, COUNT(*) as new_customers
    FROM first_orders
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all();

  // Reverse so oldest month is first (chronological order for charts)
  res.json({ data: data.reverse() });
});

module.exports = router;
