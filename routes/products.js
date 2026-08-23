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

function escapeLike(str) {
  return String(str).replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function normalizeDisplaySection(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const arr = [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    return JSON.stringify(arr);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const a = [...new Set(parsed.map((v) => String(v).trim()).filter(Boolean))];
          if (a.length === 0) return '';
          if (a.length === 1) return a[0];
          return JSON.stringify(a);
        }
      } catch (e) {}
    }
    if (trimmed.includes(',')) {
      const parts = [...new Set(trimmed.split(',').map((v) => v.trim()).filter(Boolean))];
      if (parts.length === 0) return '';
      if (parts.length === 1) return parts[0];
      return JSON.stringify(parts);
    }
    return trimmed;
  }
  return String(value);
}

// ============================================================
// Sales-aware pricing (STEP 4)
// Products with a currently-active sale record (now within
// [start_at, end_at]) are returned to customers with:
//   price_cents        -> sale price (what customers pay)
//   old_price_cents / compare_at_price_cents -> original price
//   on_sale            -> 1 (drives the "Sale" badge)
// Admin listings (GET /api/products) still show stored prices.
// ============================================================

function activeSalesMap() {
  const now = Date.now();
  const rows = db.prepare('SELECT product_id, original_price_cents, sale_price_cents, start_at, end_at FROM sales').all();
  const map = {};
  for (const s of rows) {
    const start = new Date(s.start_at).getTime();
    const end = new Date(s.end_at).getTime();
    if (!isNaN(start) && !isNaN(end) && now >= start && now <= end) {
      map[s.product_id] = s;
    }
  }
  return map;
}

function withSalePrice(product, saleMap) {
  const sale = saleMap && saleMap[product.id];
  if (!sale) return product;
  return Object.assign({}, product, {
    price_cents: sale.sale_price_cents,
    old_price_cents: sale.original_price_cents,
    compare_at_price_cents: sale.original_price_cents,
    on_sale: 1
  });
}

// ============================================================
// PUBLIC endpoints — no authentication required
// ============================================================

// GET /api/products/browse/featured — Returns featured active products with pagination.
router.get('/browse/featured', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999);
  const offset = (Number(page) - 1) * safeLimit;
  const saleMap = activeSalesMap();
  const products = db.prepare("SELECT *, (SELECT COALESCE(ROUND(AVG(rating),1),0) FROM reviews WHERE product_id = products.id) AS rating, (SELECT COUNT(*) FROM reviews WHERE product_id = products.id) AS reviews FROM products WHERE status = 'active' AND featured = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?").all(safeLimit, offset)
    .map((p) => withSalePrice(p, saleMap));
  const { count } = db.prepare("SELECT COUNT(*) as count FROM products WHERE status = 'active' AND featured = 1").get();
  res.json({ products, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/products/browse/on-sale — Returns on-sale active products with pagination.
// Now strictly sales-table driven — legacy on_sale column is ignored to prevent hardcoded sales.
router.get('/browse/on-sale', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999);
  const offset = (Number(page) - 1) * safeLimit;
  const saleMap = activeSalesMap();
  const saleIds = Object.keys(saleMap).map(Number);
  if (saleIds.length === 0) {
    return res.json({ products: [], total: 0, page: Number(page), limit: safeLimit });
  }
  const where = "status = 'active' AND id IN (" + saleIds.map(() => '?').join(',') + ")";
  const params = [...saleIds];
  const products = db.prepare(`SELECT *, (SELECT COALESCE(ROUND(AVG(rating),1),0) FROM reviews WHERE product_id = products.id) AS rating, (SELECT COUNT(*) FROM reviews WHERE product_id = products.id) AS reviews FROM products WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, safeLimit, offset)
    .map((p) => withSalePrice(p, saleMap));
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM products WHERE ${where}`).get(...params);
  res.json({ products, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/products/browse — Browse products with optional filters, search, and pagination.
// Query params: ?category=bedroom&search=sofa&sort=price_asc&page=1&limit=20
// Builds SQL dynamically based on which filters are provided.
router.get('/browse', (req, res) => {
  const { category, search, sort, page = 1, limit = 20, display_section } = req.query;
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 9999); // cap at 100
  let sql = "SELECT *, (SELECT COALESCE(ROUND(AVG(rating),1),0) FROM reviews WHERE product_id = products.id) AS rating, (SELECT COUNT(*) FROM reviews WHERE product_id = products.id) AS reviews FROM products WHERE status = 'active'";
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
    const safeSearch = escapeLike(search);
    sql += ' AND (name LIKE ? ESCAPE \'\\\' OR description LIKE ? ESCAPE \'\\\')';
    countSql += ' AND (name LIKE ? ESCAPE \'\\\' OR description LIKE ? ESCAPE \'\\\')';
    params.push(`%${safeSearch}%`, `%${safeSearch}%`);
    countParams.push(`%${safeSearch}%`, `%${safeSearch}%`);
  }
  // Add display_section filter if provided (supports legacy single value and new JSON-array storage)
  if (display_section) {
    const safeDs = String(display_section).trim();
    sql += " AND (display_section = ? OR display_section LIKE ? ESCAPE '\\')";
    countSql += " AND (display_section = ? OR display_section LIKE ? ESCAPE '\\')";
    const likePattern = '%"' + escapeLike(safeDs) + '"%';
    params.push(safeDs, likePattern);
    countParams.push(safeDs, likePattern);
  }

  // Add sorting and pagination
  const orderClause = SORT_MAP[sort] || PUBLIC_SORT;
  sql += ` ORDER BY ${orderClause} LIMIT ? OFFSET ?`;
  params.push(safeLimit, (Number(page) - 1) * safeLimit);

  const saleMap = activeSalesMap();
  const products = db.prepare(sql).all(...params).map((p) => withSalePrice(p, saleMap));
  const { count } = db.prepare(countSql).get(...countParams);

  res.json({ products, total: count, page: Number(page), limit: safeLimit });
});

// GET /api/products/browse/:id — Get a single product by ID (must be active)
router.get('/browse/:id', (req, res) => {
  const product = db.prepare("SELECT *, (SELECT COALESCE(ROUND(AVG(rating),1),0) FROM reviews WHERE product_id = products.id) AS rating, (SELECT COUNT(*) FROM reviews WHERE product_id = products.id) AS reviews FROM products WHERE id = ? AND status = 'active'").get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(withSalePrice(product, activeSalesMap()));
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
  if (search) { const s = escapeLike(search); sql += ' AND (name LIKE ? ESCAPE \'\\\' OR sku LIKE ? ESCAPE \'\\\')'; countSql += ' AND (name LIKE ? ESCAPE \'\\\' OR sku LIKE ? ESCAPE \'\\\')'; params.push(`%${s}%`, `%${s}%`); countParams.push(`%${s}%`, `%${s}%`); }

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
  const { name, description, price_cents, old_price_cents, category, brand, sku, stock, colors, sizes, tags, images, specifications, shipping_info, returns_info, featured, on_sale, status, display_section, free_delivery, warranty_months, new_arrival_days, new_arrival_until } = req.body;
  if (!name || price_cents === undefined) return res.status(400).json({ error: 'name, price_cents required' });
  if (typeof price_cents !== 'number' || price_cents < 0) return res.status(400).json({ error: 'price_cents must be a non-negative number' });
  if (stock !== undefined && (typeof stock !== 'number' || stock < 0)) return res.status(400).json({ error: 'stock must be a non-negative number' });
  if (warranty_months !== undefined && warranty_months !== null && (typeof warranty_months !== 'number' || !Number.isInteger(warranty_months) || warranty_months < 0)) return res.status(400).json({ error: 'warranty_months must be a non-negative integer or null' });
  // Validate new_arrival_days: integer 0..90, default 3
  let arrivalDays = new_arrival_days;
  if (arrivalDays === undefined || arrivalDays === null || arrivalDays === '') arrivalDays = 3;
  arrivalDays = Number(arrivalDays);
  if (!Number.isInteger(arrivalDays) || arrivalDays < 0 || arrivalDays > 90) return res.status(400).json({ error: 'new_arrival_days must be an integer between 0 and 90' });
  // Compute new_arrival_until if not explicitly provided
  let arrivalUntil = new_arrival_until || null;
  if (arrivalDays > 0 && !arrivalUntil) {
    arrivalUntil = new Date(Date.now() + arrivalDays * 86400000).toISOString();
  } else if (arrivalDays === 0) {
    arrivalUntil = null;
  } else if (arrivalUntil) {
    const t = new Date(arrivalUntil).getTime();
    if (isNaN(t)) return res.status(400).json({ error: 'new_arrival_until must be a valid ISO date string' });
    // normalize to ISO
    arrivalUntil = new Date(t).toISOString();
  }

  const stmt = db.prepare(`
    INSERT INTO products (name, description, price_cents, old_price_cents, category, brand, sku, stock, colors, sizes, tags, images, specifications, shipping_info, returns_info, featured, on_sale, status, display_section, free_delivery, warranty_months, new_arrival_days, new_arrival_until)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  try {
    const normalizedDisplaySection = normalizeDisplaySection(display_section);
    // Array/object fields (colors, sizes, tags, images, specifications) are stored as JSON strings in SQLite
    const result = stmt.run(name, description || '', price_cents, old_price_cents || null, category || '', brand || '', sku || null, stock || 0,
      JSON.stringify(colors || []), JSON.stringify(sizes || []), JSON.stringify(tags || []), JSON.stringify(images || []), JSON.stringify(specifications || []),
      shipping_info || '', returns_info || '',
      featured ? 1 : 0, on_sale ? 1 : 0, status || 'active', normalizedDisplaySection !== undefined ? normalizedDisplaySection : '',
      free_delivery ? 1 : 0, warranty_months == null ? null : warranty_months, arrivalDays, arrivalUntil);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'SKU already exists' });
    next(e); // pass to error handler instead of crashing
  }
});

// PUT /api/products/:id — Update an existing product.
// Only updates fields that are included in the request body (partial update).
router.put('/:id', (req, res, next) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const fields = ['name', 'description', 'price_cents', 'old_price_cents', 'category', 'brand', 'sku', 'stock', 'colors', 'sizes', 'tags', 'images', 'specifications', 'shipping_info', 'returns_info', 'featured', 'on_sale', 'status', 'display_section', 'free_delivery', 'warranty_months', 'new_arrival_days', 'new_arrival_until'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      // Validate numeric fields on update
      if (field === 'price_cents') {
        const v = req.body[field];
        if (typeof v !== 'number' || v < 0) return res.status(400).json({ error: 'price_cents must be a non-negative number' });
      }
      if (field === 'old_price_cents') {
        const v = req.body[field];
        if (v !== null && (typeof v !== 'number' || v < 0)) return res.status(400).json({ error: 'old_price_cents must be a non-negative number or null' });
      }
      if (field === 'stock') {
        const v = req.body[field];
        if (typeof v !== 'number' || v < 0 || !Number.isInteger(v)) return res.status(400).json({ error: 'stock must be a non-negative integer' });
      }
      if (field === 'warranty_months') {
        const v = req.body[field];
        if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 0)) return res.status(400).json({ error: 'warranty_months must be a non-negative integer or null' });
      }
      if (field === 'status') {
        const allowed = ['active', 'draft'];
        if (!allowed.includes(req.body[field])) return res.status(400).json({ error: 'status must be active or draft' });
      }
      if (field === 'new_arrival_days') {
        const v = req.body[field];
        if (v === null || v === '') return res.status(400).json({ error: 'new_arrival_days must be an integer between 0 and 90' });
        const num = Number(v);
        if (!Number.isInteger(num) || num < 0 || num > 90) return res.status(400).json({ error: 'new_arrival_days must be an integer between 0 and 90' });
      }
      if (field === 'new_arrival_until') {
        const v = req.body[field];
        if (v !== null && v !== '' ) {
          const t = new Date(v).getTime();
          if (isNaN(t)) return res.status(400).json({ error: 'new_arrival_until must be a valid ISO date string or null' });
        }
      }
      updates.push(`${field} = ?`);
      // Array/object fields need to be stringified before saving
      if (['colors', 'sizes', 'tags', 'images', 'specifications'].includes(field)) {
        values.push(JSON.stringify(req.body[field]));
      } else if (field === 'display_section') {
        const norm = normalizeDisplaySection(req.body[field]);
        values.push(norm !== undefined ? norm : '');
      } else if (field === 'free_delivery') {
        values.push(req.body[field] ? 1 : 0);
      } else if (field === 'warranty_months') {
        values.push(req.body[field] == null ? null : req.body[field]);
      } else if (field === 'new_arrival_days') {
        values.push(Number(req.body[field]));
      } else if (field === 'new_arrival_until') {
        const v = req.body[field];
        if (v === null || v === '') values.push(null);
        else values.push(new Date(v).toISOString());
      } else if (field === 'sku' && !String(req.body[field] || '').trim()) {
        // Empty SKU must be NULL, not '', so the UNIQUE constraint allows multiple products without one.
        values.push(null);
      } else {
        values.push(req.body[field]);
      }
    }
  }
  // Auto-manage new_arrival_until when new_arrival_days is updated but until is not explicitly provided
  const hasDays = req.body.new_arrival_days !== undefined;
  const hasUntil = req.body.new_arrival_until !== undefined;
  if (hasDays && !hasUntil) {
    const days = Number(req.body.new_arrival_days);
    if (days === 0) {
      updates.push('new_arrival_until = ?');
      values.push(null);
    } else if (days > 0) {
      updates.push('new_arrival_until = ?');
      values.push(new Date(Date.now() + days * 86400000).toISOString());
    }
  }
  // If days is 0 but client also sent an explicit until, force until to null (disabled)
  if (hasDays && hasUntil && Number(req.body.new_arrival_days) === 0) {
    const idx = updates.indexOf('new_arrival_until = ?');
    if (idx !== -1) values[idx] = null;
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  try {
    db.prepare(`UPDATE products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'SKU already exists' });
    return next(e);
  }
  res.json({ success: true });
});

// DELETE /api/products/:id — Delete a product permanently.
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true });
});

module.exports = router;
