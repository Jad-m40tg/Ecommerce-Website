// middleware/auth.js — Two middleware functions that protect routes.
// Used like: router.get('/secret', authenticateToken, requireAdmin, handler)

const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../config');

// authenticateToken — Checks if the request has a valid login token.
// Reads the "Authorization: Bearer <token>" header, verifies the token
// signature, and checks that it hasn't been revoked (token_version match).
// If valid, attaches the decoded user info to req.user for later use.
// If invalid/missing, returns 401 or 403 error.
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer abc123" → "abc123"
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });

    // Check if the token was revoked (admin logged out or changed password)
    const admin = db.prepare('SELECT id, token_version FROM admins WHERE id = ?').get(decoded.id);
    if (!admin || admin.token_version !== decoded.token_version) {
      return res.status(403).json({ error: 'Token revoked' });
    }

    req.user = decoded; // attach { id, role, token_version } to the request
    next(); // proceed to the next middleware or route handler
  });
}

// requireAdmin — Must be used AFTER authenticateToken.
// Checks that the authenticated user has the 'admin' role.
// Prevents regular users (if any) from accessing admin-only routes.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

module.exports = { authenticateToken, requireAdmin };
