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
  const { product_id, original_price_cents, sale_price_cents, start_at, end_at } = req.body;

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
    INSERT INTO sales (product_id, original_price_cents, sale_price_cents, start_at, end_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(product_id, original_price_cents, sale_price_cents, start_at, end_at);

  res.status(201).json({ id: result.lastInsertRowid, success: true });
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
  `).run(nextProductId, nextOrig, nextSale, nextStart.toISOString(), nextEnd.toISOString(), nextBanner || '', existing.id);

  res.json({ success: true });
});

// DELETE /api/sales/:id — Remove a sale record.
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Sale not found' });
  res.json({ success: true });
});

module.exports = router;
