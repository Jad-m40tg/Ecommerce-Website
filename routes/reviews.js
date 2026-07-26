// routes/reviews.js — Public review system for products.
// GET /api/reviews?product_id=X — list reviews for a product
// POST /api/reviews — create a review (rate limited: 5 per IP per hour)
// DELETE /api/reviews/:id — admin only, deletes a review

const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// In-memory rate limit tracker: { ip: [timestamp, ...] }
const reviewRateLimit = {};
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip) {
  const now = Date.now();
  if (!reviewRateLimit[ip]) reviewRateLimit[ip] = [];
  // Remove timestamps outside the window
  reviewRateLimit[ip] = reviewRateLimit[ip].filter(t => now - t < RATE_LIMIT_WINDOW);
  // Clean up empty entries to prevent memory leak
  if (reviewRateLimit[ip].length === 0) {
    delete reviewRateLimit[ip];
    reviewRateLimit[ip] = [];
  }
  if (reviewRateLimit[ip].length >= RATE_LIMIT_MAX) return true;
  reviewRateLimit[ip].push(now);
  return false;
}

// GET /api/reviews?product_id=X — public
router.get('/', (req, res) => {
  const { product_id } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id is required' });

  const id = parseInt(product_id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product_id' });

  const reviews = db.prepare(
    'SELECT id, product_id, customer_name, rating, comment, created_at FROM reviews WHERE product_id = ? ORDER BY created_at DESC'
  ).all(id);

  res.json({ reviews, total: reviews.length });
});

// POST /api/reviews — public, rate limited
router.post('/', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many reviews. Please try again later.' });
  }

  const { product_id, customer_name, rating, comment } = req.body;

  // Validate product_id
  if (!product_id || isNaN(parseInt(product_id, 10))) {
    return res.status(400).json({ error: 'Valid product_id is required' });
  }

  // Validate customer_name
  if (!customer_name || typeof customer_name !== 'string' || customer_name.trim().length < 1) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  // Validate rating (1-5)
  const r = parseInt(rating, 10);
  if (isNaN(r) || r < 1 || r > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  const result = db.prepare(
    'INSERT INTO reviews (product_id, customer_name, rating, comment) VALUES (?, ?, ?, ?)'
  ).run(parseInt(product_id, 10), customer_name.trim(), r, (comment || '').trim());

  res.status(201).json({
    id: result.lastInsertRowid,
    product_id: parseInt(product_id, 10),
    customer_name: customer_name.trim(),
    rating: r,
    comment: (comment || '').trim()
  });
});

// DELETE /api/reviews/:id — admin only
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid review id' });

  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(id);
  if (!review) return res.status(404).json({ error: 'Review not found' });

  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
