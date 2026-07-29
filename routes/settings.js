// routes/settings.js — Store settings (name, currency, delivery fee, etc.).
// Public GET returns only safe keys; admin GET returns everything.
// Admin PUT updates settings.

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { JWT_SECRET } = require('../config');

const router = express.Router();

// These keys are safe to show to anyone (customers see them on the storefront)
const PUBLIC_KEYS = ['store_name', 'store_tagline', 'currency', 'language', 'delivery_fee_cents', 'free_delivery_threshold_cents', 'contact_email', 'contact_phone', 'store_address', 'reviews'];

// Whitelist of keys that admins are allowed to update.
// Prevents accidentally injecting or overwriting unintended configuration.
const ALLOWED_SETTINGS_KEYS = ['store_name', 'store_tagline', 'currency', 'delivery_fee_cents', 'free_delivery_threshold_cents', 'contact_email', 'contact_phone', 'store_address', 'language'];

// Helper: checks if the request has a valid admin token (without rejecting it).
// Used to decide whether to return all settings or just the public ones.
function isAdminRequest(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = db.prepare('SELECT token_version FROM admins WHERE id = ?').get(decoded.id);
    return admin && admin.token_version === decoded.token_version;
  } catch {
    return false;
  }
}

// GET /api/settings — Returns store settings.
// Admin: sees ALL settings (including internal ones like SMTP config).
// Customer: sees only the PUBLIC_KEYS listed above.
router.get('/', (req, res) => {
  const settings = isAdminRequest(req)
    ? db.prepare('SELECT key, value FROM settings').all()
    : db.prepare('SELECT key, value FROM settings WHERE key IN (' + PUBLIC_KEYS.map(() => '?').join(',') + ')').all(...PUBLIC_KEYS);

  // Parse JSON values where possible, return raw strings otherwise
  const result = {};
  for (const s of settings) {
    try { result[s.key] = JSON.parse(s.value); } catch { result[s.key] = s.value; }
  }
  res.json(result);
});

// PUT /api/settings — Update one or more settings (admin only).
// Accepts an object like { "store_name": "New Name", "currency": "EUR" }
// and saves each key-value pair. Uses INSERT OR REPLACE so it works
// for both creating new settings and updating existing ones.
router.put('/', authenticateToken, requireAdmin, (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  let updated = 0;
  for (const [key, value] of Object.entries(req.body)) {
    if (!ALLOWED_SETTINGS_KEYS.includes(key)) continue; // skip unknown keys
    stmt.run(key, JSON.stringify(value));
    updated++;
  }
  if (updated === 0) return res.status(400).json({ error: 'No valid settings to update' });
  res.json({ success: true, updated });
});

module.exports = router;
