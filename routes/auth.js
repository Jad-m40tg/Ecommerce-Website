// routes/auth.js — Admin authentication: login, verify token, logout.
// This is the ONLY way to get a JWT token. No registration endpoint exists.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { JWT_SECRET, JWT_EXPIRES } = require('../config');

const router = express.Router();

// POST /api/auth/login — Admin submits email + password, gets a token back.
// async/await used because bcrypt.compare is non-blocking (doesn't freeze
// the server while checking the password hash).
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Find the admin by email
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    // Compare plaintext password against the stored bcrypt hash
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Create a JWT token containing the admin's ID, role, and token_version
    const token = jwt.sign(
      { id: admin.id, role: admin.role, token_version: admin.token_version },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    // Remove password_hash before sending admin data to the client
    const { password_hash, ...safeAdmin } = admin;
    res.json({ token, admin: safeAdmin });
  } catch (err) {
    next(err); // pass unexpected errors to the error handler
  }
});

// GET /api/auth/me — Verify that a token is still valid and return admin info.
// Used by the frontend on page load to check if the user is still logged in.
router.get('/me', authenticateToken, (req, res) => {
  const admin = db.prepare('SELECT id, email, name, avatar, role FROM admins WHERE id = ?').get(req.user.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  res.json({ admin });
});

// POST /api/auth/logout — Invalidates the current token by bumping token_version.
// The token still exists but the version mismatch causes authenticateToken to reject it.
router.post('/logout', authenticateToken, (req, res) => {
  db.prepare('UPDATE admins SET token_version = token_version + 1 WHERE id = ?').run(req.user.id);
  res.json({ message: 'Logged out' });
});

module.exports = router;
