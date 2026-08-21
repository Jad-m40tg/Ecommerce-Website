// routes/sales.js — Sales / deals management (admin) + public active sales.
// A sale record links a product to a sale price + original price over a date range.
// A sale is "active" when now is within [start_at, end_at].
// Dates are stored as the local datetime string from <input type="datetime-local">
// and compared via JS Date (both sides parse as local time).

const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper: is a sale row live at the given epoch ms?
function isLiveAt(row, ms) {
  const start = new Date(row.start_at).getTime();
  const end = new Date(row.end_at).getTime();
  if (isNaN(start) || isNaN(end)) return false;
  return ms >= start && ms <= end;
}

function withActiveFlag(row, now) {
  return Object.assign({}, row, { active: isLiveAt(row, now) });
}

function parseDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Format a Date as the local YYYY-MM-DDTHH:mm string used by
// <input type="datetime-local"> so edit pre-fill round-trips cleanly.
function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// ============================================================
// PUBLIC endpoint — no authentication required
// ============================================================

// GET /api/sales/active — Active sales for the storefront banner,
// soonest end date first (the featured sale is the first item).
router.get('/active', (req, res) => {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT s.*, p.name AS product_name, p.category AS product_category, p.images AS product_images
    FROM sales s
    LEFT JOIN products p ON p.id = s.product_id
  `).all();
  const active = rows
    .filter((r) => isLiveAt(r, now))
    .sort((a, b) => new Date(a.end_at).getTime() - new Date(b.end_at).getTime());
  res.json({ sales: active });
});

// ============================================================
// ADMIN endpoints — authentication required from here down
// ============================================================
router.use(authenticateToken, requireAdmin);

// GET /api/sales — List all sales (newest first) with product info.
router.get('/', (req, res) => {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT s.*, p.name AS product_name, p.status AS product_status
    FROM sales s
    LEFT JOIN products p ON p.id = s.product_id
    ORDER BY s.created_at DESC
  `).all();
  res.json({ sales: rows.map((r) => withActiveFlag(r, now)) });
});

// GET /api/sales/candidates — Products eligible for a new sale:
// status = 'active' AND no sale that is still live or upcoming (end_at >= now).
// Feeds the "Add Product to Sale" dropdown.
router.get('/candidates', (req, res) => {
  const now = Date.now();
  const products = db.prepare("SELECT id, name, price_cents FROM products WHERE status = 'active'").all();
  const sales = db.prepare('SELECT product_id, start_at, end_at FROM sales').all();
  const blocked = new Set();
  for (const s of sales) {
    const end = new Date(s.end_at).getTime();
    if (!isNaN(end) && end >= now) blocked.add(s.product_id);
  }
  const candidates = products
    .filter((p) => !blocked.has(p.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  res.json({ products: candidates });
});

// POST /api/sales — Create a sale for a single product (Manual Price mode).
router.post('/', (req, res) => {
  const { product_id, original_price_cents, sale_price_cents, start_at, end_at, banner_image_url } = req.body;

  if (!product_id) return res.status(400).json({ error: 'product_id is required' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.status !== 'active') return res.status(400).json({ error: 'Only active products can be put on sale' });

  if (!Number.isInteger(original_price_cents) || original_price_cents <= 0) {
    return res.status(400).json({ error: 'original_price_cents must be a positive integer' });
  }
  if (!Number.isInteger(sale_price_cents) || sale_price_cents <= 0) {
    return res.status(400).json({ error: 'sale_price_cents must be a positive integer' });
  }
  if (sale_price_cents >= original_price_cents) {
    return res.status(400).json({ error: 'Sale price must be lower than the original price' });
  }

  const start = parseDate(start_at);
  const end = parseDate(end_at);
  if (!start || !end) return res.status(400).json({ error: 'Valid start_at and end_at are required' });
  if (end.getTime() <= start.getTime()) return res.status(400).json({ error: 'End date must be after start date' });

  // Reject overlapping sale records for the same product.
  const existing = db.prepare('SELECT id, start_at, end_at FROM sales WHERE product_id = ?').all(product_id);
  const overlaps = existing.some((s) => {
    const sStart = new Date(s.start_at).getTime();
    const sEnd = new Date(s.end_at).getTime();
    return start.getTime() <= sEnd && end.getTime() >= sStart;
  });
  if (overlaps) return res.status(409).json({ error: 'Product already has a sale in this date range' });

  const result = db.prepare(`
    INSERT INTO sales (product_id, original_price_cents, sale_price_cents, start_at, end_at, banner_image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(product_id, original_price_cents, sale_price_cents, start_at, end_at, banner_image_url || '');

  res.status(201).json({ id: result.lastInsertRowid, success: true });
});

// POST /api/sales/bulk — Percentage Discount mode: create one sale per product.
// new_price = round(original × (1 − discount_pct/100)), rounded to the nearest
// 10 DA (1000 cents). If that rounding makes the price invalid (>= original or
// <= 0), falls back to the nearest whole DA (100 cents).
router.post('/bulk', (req, res) => {
  const { product_ids, discount_pct, start_at, end_at, banner_image_url } = req.body;

  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return res.status(400).json({ error: 'product_ids must be a non-empty array' });
  }
  if (!Number.isFinite(discount_pct) || discount_pct <= 0 || discount_pct >= 100) {
    return res.status(400).json({ error: 'discount_pct must be between 0 and 100' });
  }

  const start = parseDate(start_at);
  const end = parseDate(end_at);
  if (!start || !end) return res.status(400).json({ error: 'Valid start_at and end_at are required' });
  if (end.getTime() <= start.getTime()) return res.status(400).json({ error: 'End date must be after start date' });

  const ids = [...new Set(product_ids)];
  const products = [];
  for (const id of ids) {
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });
    const p = db.prepare('SELECT id, name, price_cents, status FROM products WHERE id = ?').get(id);
    if (!p) return res.status(404).json({ error: 'Product not found: ' + id });
    if (p.status !== 'active') return res.status(400).json({ error: 'Product is not active: ' + p.name });
    products.push(p);
  }

  // Reject if any product already has a sale overlapping this range.
  const conflicts = [];
  for (const p of products) {
    const existing = db.prepare('SELECT start_at, end_at FROM sales WHERE product_id = ?').all(p.id);
    const overlaps = existing.some((s) => {
      const sStart = new Date(s.start_at).getTime();
      const sEnd = new Date(s.end_at).getTime();
      return start.getTime() <= sEnd && end.getTime() >= sStart;
    });
    if (overlaps) conflicts.push(p.name);
  }
  if (conflicts.length) {
    return res.status(409).json({ error: 'Already on sale in this range: ' + conflicts.join(', ') });
  }

  function computeSaleCents(priceCents, pct) {
    const raw = Math.round(priceCents * (1 - pct / 100));
    let sale = Math.round(raw / 1000) * 1000; // nearest 10 DA
    if (sale >= priceCents || sale <= 0) sale = Math.round(raw / 100) * 100; // fallback: nearest whole DA
    return sale;
  }

  const insert = db.prepare(`
    INSERT INTO sales (product_id, original_price_cents, sale_price_cents, start_at, end_at, banner_image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const created = [];
  const tx = db.transaction(() => {
    for (const p of products) {
      const sale = computeSaleCents(p.price_cents, discount_pct);
      if (sale <= 0 || sale >= p.price_cents) continue;
      const r = insert.run(p.id, p.price_cents, sale, start_at, end_at, banner_image_url || '');
      created.push({ id: r.lastInsertRowid, product_id: p.id, sale_price_cents: sale });
    }
  });
  tx();

  if (created.length === 0) return res.status(400).json({ error: 'No valid sale prices could be computed' });
  res.status(201).json({ success: true, created });
});

// PUT /api/sales/:id — Update a sale (editing flow). Allows changing product too.
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Sale not found' });

  const { product_id, original_price_cents, sale_price_cents, start_at, end_at, banner_image_url } = req.body;
  const nextProductId = product_id !== undefined ? product_id : existing.product_id;

  if (!Number.isInteger(nextProductId)) return res.status(400).json({ error: 'product_id is required' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(nextProductId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.status !== 'active') return res.status(400).json({ error: 'Only active products can be put on sale' });

  const nextOrig = original_price_cents !== undefined ? original_price_cents : existing.original_price_cents;
  const nextSale = sale_price_cents !== undefined ? sale_price_cents : existing.sale_price_cents;
  if (!Number.isInteger(nextOrig) || nextOrig <= 0) return res.status(400).json({ error: 'original_price_cents must be a positive integer' });
  if (!Number.isInteger(nextSale) || nextSale <= 0) return res.status(400).json({ error: 'sale_price_cents must be a positive integer' });
  if (nextSale >= nextOrig) return res.status(400).json({ error: 'Sale price must be lower than the original price' });

  const nextStart = start_at !== undefined ? parseDate(start_at) : new Date(existing.start_at);
  const nextEnd = end_at !== undefined ? parseDate(end_at) : new Date(existing.end_at);
  if (!nextStart || !nextEnd) return res.status(400).json({ error: 'Valid start_at and end_at are required' });
  if (nextEnd.getTime() <= nextStart.getTime()) return res.status(400).json({ error: 'End date must be after start date' });

  // Reject overlapping sale records for the product, excluding this sale itself.
  const others = db.prepare('SELECT id, start_at, end_at FROM sales WHERE product_id = ? AND id != ?').all(nextProductId, existing.id);
  const overlaps = others.some((s) => {
    const sStart = new Date(s.start_at).getTime();
    const sEnd = new Date(s.end_at).getTime();
    return nextStart.getTime() <= sEnd && nextEnd.getTime() >= sStart;
  });
  if (overlaps) return res.status(409).json({ error: 'Product already has a sale in this date range' });

  const nextBanner = banner_image_url !== undefined ? banner_image_url : existing.banner_image_url;
  db.prepare(`
    UPDATE sales
    SET product_id = ?, original_price_cents = ?, sale_price_cents = ?,
        start_at = ?, end_at = ?, banner_image_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextProductId, nextOrig, nextSale, toLocalInput(nextStart), toLocalInput(nextEnd), nextBanner || '', existing.id);

  const updated = db.prepare(`
    SELECT s.*, p.name AS product_name, p.status AS product_status
    FROM sales s
    LEFT JOIN products p ON p.id = s.product_id
    WHERE s.id = ?
  `).get(existing.id);

  res.json({ success: true, sale: withActiveFlag(updated, Date.now()) });
});

// DELETE /api/sales/:id — Remove a sale record.
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Sale not found' });
  res.json({ success: true });
});

module.exports = router;
