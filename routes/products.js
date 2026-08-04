// routes/products.js — Product browsing (public) and CRUD management (admin).
// Public endpoints: /browse, /browse/featured, /browse/on-sale, /browse/:id
// Admin endpoints: full CRUD with authentication required

const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Maps frontend sort options to actual SQL ORDER BY clauses
const SORT_MAP = {
  'price_asc': 'price_cents ASC',
  'price_desc': 'price_cents DESC',
  'name_asc': 'name ASC',
  'name_desc': 'name DESC',
  'newest': 'created_at DESC',
  'oldest': 'created_at ASC'
};

const PUBLIC_SORT = "created_at DESC"; // default sort for customers

// ============================================================
// PUBLIC endpoints — no authentication required
// ============================================================

// GET /api/products/browse/featured — Returns featured active products with pagination.
router.get('/browse/featured', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999);
  const offset = (Number(page) - 1) * safeLimit;
  const products = db.prepare("SELECT * FROM products WHERE status = 'active' AND featured = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?").all(safeLimit, offset);
  const { count } = db.prepare("SELECT COUNT(*) as count FROM products WHERE status = 'active' AND featured = 1").get();
  res.json({ products, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/products/browse/on-sale — Returns on-sale active products with pagination.
router.get('/browse/on-sale', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999);
  const offset = (Number(page) - 1) * safeLimit;
  const products = db.prepare("SELECT * FROM products WHERE status = 'active' AND on_sale = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?").all(safeLimit, offset);
  const { count } = db.prepare("SELECT COUNT(*) as count FROM products WHERE status = 'active' AND on_sale = 1").get();
  res.json({ products, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/products/browse — Browse products with optional filters, search, and pagination.
// Query params: ?category=bedroom&search=sofa&sort=price_asc&page=1&limit=20
// Builds SQL dynamically based on which filters are provided.
router.get('/browse', (req, res) => {
  const { category, search, sort, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999); // cap at 100
  let sql = "SELECT * FROM products WHERE status = 'active'";
  let countSql = "SELECT COUNT(*) as count FROM products WHERE status = 'active'";
  const params = [];
  const countParams = [];

  // Add category filter if provided
  if (category) {
    sql += ' AND category = ?';
    countSql += ' AND category = ?';
    params.push(category);
    countParams.push(category);
  }
  // Add search filter (matches product name or description)
  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    countSql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
    countParams.push(`%${search}%`, `%${search}%`);
  }

  // Add sorting and pagination
  const orderClause = SORT_MAP[sort] || PUBLIC_SORT;
  sql += ` ORDER BY ${orderClause} LIMIT ? OFFSET ?`;
  params.push(safeLimit, (Number(page) - 1) * safeLimit);

  const products = db.prepare(sql).all(...params);
  const { count } = db.prepare(countSql).get(...countParams);

  res.json({ products, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/products/browse/:id — Get a single product by ID (must be active)
router.get('/browse/:id', (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND status = 'active'").get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// ============================================================
// ADMIN endpoints — authentication required from here down
// ============================================================
router.use(authenticateToken, requireAdmin);

// GET /api/products — List ALL products (including drafts) with filters and pagination.
// Admin version shows everything, not just active products.
router.get('/', (req, res) => {
  const { category, status, search, sort, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999);
  let sql = 'SELECT * FROM products WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as count FROM products WHERE 1=1';
  const params = [];
  const countParams = [];

  if (category) { sql += ' AND category = ?'; countSql += ' AND category = ?'; params.push(category); countParams.push(category); }
  if (status) { sql += ' AND status = ?'; countSql += ' AND status = ?'; params.push(status); countParams.push(status); }
  if (search) { sql += ' AND (name LIKE ? OR sku LIKE ?)'; countSql += ' AND (name LIKE ? OR sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); countParams.push(`%${search}%`, `%${search}%`); }

  const orderClause = SORT_MAP[sort] || 'created_at DESC';
  sql += ` ORDER BY ${orderClause} LIMIT ? OFFSET ?`;
  params.push(safeLimit, (Number(page) - 1) * safeLimit);

  const products = db.prepare(sql).all(...params);
  const { count } = db.prepare(countSql).get(...countParams);

  res.json({ products, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/products/:id — Get a single product by ID (any status, admin view)
router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// POST /api/products — Create a new product.
// Database auto-generates the ID (client cannot supply one).
// Validates that price is a non-negative number.
router.post('/', (req, res, next) => {
  const { name, description, price_cents, old_price_cents, category, brand, sku, stock, colors, sizes, tags, images, specifications, shipping_info, returns_info, featured, on_sale, status } = req.body;
  if (!name || price_cents === undefined) return res.status(400).json({ error: 'name, price_cents required' });
  if (typeof price_cents !== 'number' || price_cents < 0) return res.status(400).json({ error: 'price_cents must be a non-negative number' });
  if (stock !== undefined && (typeof stock !== 'number' || stock < 0)) return res.status(400).json({ error: 'stock must be a non-negative number' });

  const stmt = db.prepare(`
    INSERT INTO products (name, description, price_cents, old_price_cents, category, brand, sku, stock, colors, sizes, tags, images, specifications, shipping_info, returns_info, featured, on_sale, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  try {
    // Array/object fields (colors, sizes, tags, images, specifications) are stored as JSON strings in SQLite
    const result = stmt.run(name, description || '', price_cents, old_price_cents || null, category || '', brand || '', sku || null, stock || 0,
      JSON.stringify(colors || []), JSON.stringify(sizes || []), JSON.stringify(tags || []), JSON.stringify(images || []), JSON.stringify(specifications || []),
      shipping_info || '', returns_info || '',
      featured ? 1 : 0, on_sale ? 1 : 0, status || 'active');
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'SKU already exists' });
    next(e); // pass to error handler instead of crashing
  }
});

// PUT /api/products/:id — Update an existing product.
// Only updates fields that are included in the request body (partial update).
router.put('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const fields = ['name', 'description', 'price_cents', 'old_price_cents', 'category', 'brand', 'sku', 'stock', 'colors', 'sizes', 'tags', 'images', 'specifications', 'shipping_info', 'returns_info', 'featured', 'on_sale', 'status'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      // Array/object fields need to be stringified before saving
      if (['colors', 'sizes', 'tags', 'images', 'specifications'].includes(field)) {
        values.push(JSON.stringify(req.body[field]));
      } else {
        values.push(req.body[field]);
      }
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// DELETE /api/products/:id — Delete a product permanently.
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true });
});

module.exports = router;
