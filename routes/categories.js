// routes/categories.js — Category browsing (public) and CRUD (admin).
// Public: list all categories, get one by slug.
// Admin: create, update, delete categories.

const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ============================================================
// PUBLIC endpoints — no authentication required
// ============================================================

// GET /api/categories — Public. List all categories sorted by sort_order then name.
// Each category includes a real product_count (products join on categories.slug via products.category).
router.get('/', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, COUNT(p.id) AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category = c.slug
    WHERE (c.status = 'active' OR c.status IS NULL)
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name ASC
  `).all();
  res.json({ categories });
});

// GET /api/categories/:slug — Public. Get a single category by URL-friendly slug.
router.get('/:slug', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  res.json(cat);
});

// ============================================================
// ADMIN endpoints — authentication required from here down
// ============================================================
router.use(authenticateToken, requireAdmin);

// POST /api/categories — Admin only. Create a new category (requires name, slug auto-generated if omitted).
router.post('/', (req, res, next) => {
  const { name, slug, image, description, sort_order, status } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  // Auto-generate slug from name if not provided
  const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    db.prepare('INSERT INTO categories (name, slug, image, description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)').run(name, finalSlug, image || '', description || '', sort_order || 0, status || 'active');
    res.status(201).json({ slug: finalSlug });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Slug already exists' });
    next(e);
  }
});

// PUT /api/categories/:slug — Admin only. Update a category by slug (partial update).
router.put('/:slug', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const { name, image, description, sort_order, status } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (image !== undefined) { updates.push('image = ?'); values.push(image); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.slug);
  db.prepare('UPDATE categories SET ' + updates.join(', ') + ' WHERE slug = ?').run(...values);
  res.json({ success: true });
});

// DELETE /api/categories/:slug — Admin only. Delete a category by slug.
router.delete('/:slug', (req, res) => {
  const result = db.prepare('DELETE FROM categories WHERE slug = ?').run(req.params.slug);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
});

// POST /api/categories/:slug/products — Admin only. Assign products to a category.
router.post('/:slug/products', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const { product_ids } = req.body;
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return res.status(400).json({ error: 'product_ids must be a non-empty array' });
  }
  const ids = [...new Set(product_ids.map(Number))];
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid product id: ' + id });
    const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Product not found: ' + id });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare('UPDATE products SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (' + placeholders + ')').run(cat.slug, ...ids);
  res.json({ success: true, assigned: ids.length });
});

// DELETE /api/categories/:slug/products — Admin only. Remove products from a category.
router.delete('/:slug/products', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const { product_ids } = req.body;
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return res.status(400).json({ error: 'product_ids must be a non-empty array' });
  }
  const ids = [...new Set(product_ids.map(Number))];
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid product id: ' + id });
    const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Product not found: ' + id });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare('UPDATE products SET category = \'\', updated_at = CURRENT_TIMESTAMP WHERE id IN (' + placeholders + ') AND category = ?').run(...ids, cat.slug);
  res.json({ success: true, removed: ids.length });
});

module.exports = router;
