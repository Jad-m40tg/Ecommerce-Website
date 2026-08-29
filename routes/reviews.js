// routes/reviews.js — Public review system for products.
// GET /api/reviews?product_id=X — list reviews for a product
// GET /api/reviews/product_id=X&email=... — list, marking which reviews are the requester's own
// POST /api/reviews — create a review
// PATCH /api/reviews/:id — admin only or own (by email) within 12h, edit a review
// DELETE /api/reviews/:id — admin only or own (by email) within 12h, deletes a review

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many reviews, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// GET /api/reviews?product_id=X — Public. List reviews for a product.
// Optional ?email= of the requester so the server can mark which reviews are theirs
// (is_mine) and whether they are past the 12h edit/delete window (is_expired).
// The raw customer_email of other users is never returned.
router.get('/', (req, res) => {
  const { product_id, email } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id is required' });

  const id = parseInt(product_id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid product_id' });

  const emailQuery = typeof email === 'string' ? email.trim().toLowerCase() : '';

  const rows = db.prepare(
    'SELECT id, product_id, customer_name, rating, comment, created_at, customer_email FROM reviews WHERE product_id = ? ORDER BY created_at DESC'
  ).all(id);

  const reviews = rows.map((r) => {
    const isMine = emailQuery.length > 0 && r.customer_email && r.customer_email.trim().toLowerCase() === emailQuery;
    const isExpired = !!r.created_at && r.created_at < db.prepare("SELECT datetime('now','-12 hours') AS t").get().t;
    return {
      id: r.id,
      product_id: r.product_id,
      customer_name: r.customer_name,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      is_mine: isMine,
      is_expired: isExpired
    };
  });

  res.json({ reviews, total: reviews.length });
});

// GET /api/reviews/recent — Public. Newest reviews across all products (homepage testimonials).
router.get('/recent', (req, res) => {
  const reviews = db.prepare(
    `SELECT r.id, r.product_id, p.name AS product_name, r.customer_name, r.rating, r.comment, r.created_at
     FROM reviews r
     JOIN products p ON p.id = r.product_id
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT 12`
  ).all();
  res.json({ reviews, total: reviews.length });
});

// POST /api/reviews — Public. Submit a review for a product (rating 1-5, optional comment).
router.post('/', reviewLimiter, (req, res) => {

  const { product_id, customer_name, customer_email, rating, comment } = req.body;

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

  // Validate customer_email (used to enforce one review per customer per product)
  const customerEmail = typeof customer_email === 'string' ? customer_email.trim() : '';
  if (!customerEmail) {
    return res.status(400).json({ error: 'Customer email is required' });
  }
  if (customerEmail.length > 254) {
    return res.status(400).json({ error: 'Customer email must be 254 characters or fewer' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
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

  let result;
  try {
    result = db.prepare(
      'INSERT INTO reviews (product_id, customer_name, rating, comment, customer_email) VALUES (?, ?, ?, ?, ?)'
    ).run(parseInt(product_id, 10), customer_name.trim(), r, trimmedComment, customerEmail);
  } catch (err) {
    // Unique index on (product_id, customer_email) — one review per customer per product
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE'))) {
      return res.status(400).json({ error: 'You have already reviewed this product' });
    }
    throw err;
  }

  res.status(201).json({
    id: result.lastInsertRowid,
    product_id: parseInt(product_id, 10),
    customer_name: customer_name.trim(),
    rating: r,
    comment: trimmedComment
  });
});

// Resolve requester as admin (valid token + admin role) or an author email.
// Returns { admin: bool, email: string|null }.
function resolveRequester(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return { admin: false, email: '' };
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../config');
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = db.prepare('SELECT id, role, token_version FROM admins WHERE id = ?').get(decoded.id);
    if (admin && admin.role === 'admin' && admin.token_version === decoded.token_version) {
      return { admin: true, email: '' };
    }
  } catch (e) {
    // invalid token — fall through to author check
  }
  return { admin: false, email: '' };
}

// Authorize a review/delete request. Returns { ok, code, payload }.
// Admins always pass. Authors must match email (case-insensitive, trimmed) and be within 12h.
function authorizeReviewAction(req, review) {
  const requester = resolveRequester(req);
  if (requester.admin) return { ok: true };

  const email =
    (req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '') ||
    (typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '');
  if (!email) return { ok: false, status: 403, message: 'You can only delete your own review within 12 hours of posting' };

  const reviewEmail = review.customer_email ? String(review.customer_email).trim().toLowerCase() : '';
  if (email !== reviewEmail) {
    return { ok: false, status: 403, message: 'You can only delete your own review within 12 hours of posting' };
  }

  const cutoff = db.prepare("SELECT datetime('now','-12 hours') AS t").get().t;
  if (!review.created_at || review.created_at < cutoff) {
    return { ok: false, status: 403, message: 'You can only delete your own review within 12 hours of posting' };
  }

  return { ok: true };
}

// PATCH /api/reviews/:id — Admin, or the author (by email) within 12h. Edit a review.
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid review id' });

  const review = db.prepare('SELECT id, customer_email, created_at, customer_name FROM reviews WHERE id = ?').get(id);
  if (!review) return res.status(404).json({ error: 'Review not found' });

  const authz = authorizeReviewAction(req, review);
  if (!authz.ok) return res.status(authz.status).json({ error: authz.message });

  // Validate comment (optional but must be valid if provided)
  let comment;
  if (req.body && req.body.comment !== undefined && req.body.comment !== null) {
    if (typeof req.body.comment !== 'string') return res.status(400).json({ error: 'Comment must be a string' });
    comment = req.body.comment.trim();
    if (comment.length === 0) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (comment.length > 2000) return res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });
  }

  // Validate rating (optional but must be valid if provided)
  let rating;
  if (req.body && req.body.rating !== undefined && req.body.rating !== null && req.body.rating !== '') {
    const r = parseInt(req.body.rating, 10);
    if (isNaN(r) || r < 1 || r > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    rating = r;
  }

  if (rating !== undefined && comment !== undefined) {
    db.prepare('UPDATE reviews SET rating = ?, comment = ? WHERE id = ?').run(rating, comment, id);
  } else if (rating !== undefined) {
    db.prepare('UPDATE reviews SET rating = ? WHERE id = ?').run(rating, id);
  } else if (comment !== undefined) {
    db.prepare('UPDATE reviews SET comment = ? WHERE id = ?').run(comment, id);
  } else {
    return res.status(400).json({ error: 'Nothing to update (provide comment or rating)' });
  }

  const updated = db.prepare(
    'SELECT id, product_id, customer_name, rating, comment, created_at FROM reviews WHERE id = ?'
  ).get(id);
  res.json(updated);
});

// DELETE /api/reviews/:id — Admin, or the author (by email) within 12h. Delete a review by ID.
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid review id' });

  const review = db.prepare('SELECT id, customer_email, created_at FROM reviews WHERE id = ?').get(id);
  if (!review) return res.status(404).json({ error: 'Review not found' });

  const authz = authorizeReviewAction(req, review);
  if (!authz.ok) return res.status(authz.status).json({ error: authz.message });

  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
