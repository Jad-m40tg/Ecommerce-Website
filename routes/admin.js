// routes/admin.js — Admin profile management: view/update profile, change password.
// ALL routes here require authentication + admin role (set at the top).

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { JWT_SECRET, JWT_EXPIRES } = require('../config');

const router = express.Router();
// Every route in this file requires login + admin role
router.use(authenticateToken, requireAdmin);

// GET /api/admin/me — Return the logged-in admin's profile (no password hash).
router.get('/me', (req, res) => {
  const admin = db.prepare('SELECT id, email, name, avatar, role FROM admins WHERE id = ?').get(req.user.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  res.json({ admin });
});

// PUT /api/admin/me — Update admin name, email, or avatar (partial update).
router.put('/me', (req, res) => {
  const { name, email, avatar } = req.body;
  const updates = [];
  const values = [];

  // Build the UPDATE query dynamically based on which fields were sent
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (email !== undefined) { updates.push('email = ?'); values.push(email); }
  if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.user.id);
  db.prepare(`UPDATE admins SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // Return the updated profile
  const admin = db.prepare('SELECT id, email, name, avatar, role FROM admins WHERE id = ?').get(req.user.id);
  res.json({ admin });
});

// PUT /api/admin/password — Change admin password (requires current password, revokes other sessions).
router.put('/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'current_password and new_password required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const admin = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.user.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  const valid = await bcrypt.compare(current_password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(new_password, 10);
  db.prepare('UPDATE admins SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(hash, req.user.id);

  // The token_version bump revokes every previously-issued token. Re-issue a
  // fresh token carrying the NEW token_version so the current admin stays
  // logged in while all other (pre-change) sessions are invalidated.
  const token = jwt.sign(
    { id: req.user.id, role: req.user.role, token_version: req.user.token_version + 1 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.json({ success: true, token });
});

module.exports = router;
