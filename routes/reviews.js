// routes/reviews.js — Public review system for products.
// GET /api/reviews?product_id=X — list reviews for a product
// POST /api/reviews — create a review
// DELETE /api/reviews/:id — admin only, deletes a review

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many reviews, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// GET /api/reviews?product_id=X — Public. List reviews for a product.
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

// POST /api/reviews — Public. Submit a review for a product (rating 1-5, optional comment).
router.post('/', reviewLimiter, (req, res) => {

  const { product_id, customer_name, rating, comment } = req.body;

  // Validate product_id
  if (!product_id || isNaN(parseInt(product_id, 10))) {
    return res.status(400).json({ error: 'Valid product_id is required' });
  }

  // Check product exists
  const product = db.prepare("SELECT id FROM products WHERE id = ? AND status = 'active'").get(parseInt(product_id, 10));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Validate customer_name
  if (!customer_name || typeof customer_name !== 'string' || customer_name.trim().length < 1) {
    return res.status(400).json({ error: 'Customer name is required' });
  }
  if (customer_name.length > 200) {
    return res.status(400).json({ error: 'Customer name must be 200 characters or fewer' });
  }

  // Validate rating (1-5)
  const r = parseInt(rating, 10);
  if (isNaN(r) || r < 1 || r > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  // Validate comment length
  const trimmedComment = (comment || '').trim();
  if (trimmedComment.length > 2000) {
    return res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });
  }

  const result = db.prepare(
    'INSERT INTO reviews (product_id, customer_name, rating, comment) VALUES (?, ?, ?, ?)'
  ).run(parseInt(product_id, 10), customer_name.trim(), r, trimmedComment);

  res.status(201).json({
    id: result.lastInsertRowid,
    product_id: parseInt(product_id, 10),
    customer_name: customer_name.trim(),
    rating: r,
    comment: trimmedComment
  });
});

// DELETE /api/reviews/:id — Admin only. Delete a review by ID.
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid review id' });

  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(id);
  if (!review) return res.status(404).json({ error: 'Review not found' });

  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
