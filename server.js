// server.js — Express 5 application entry point.
// Sets up security headers, CORS, body parsing, rate limiting,
// static file serving, all API routes, SPA fallback, and error handling.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { PORT, CORS_ORIGIN } = require('./config');
const ordersRouter = require('./routes/orders');

const app = express();

// Security headers via Helmet (Content-Security-Policy, X-Frame-Options, etc.)
// 'unsafe-inline' for scripts is required because all 20 HTML files use inline <script> blocks.
// A future improvement would be extracting all JS to external files and removing 'unsafe-inline'.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://kit.fontawesome.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"]
    }
  }
}));

// Cross-Origin Resource Sharing — restricts who can call this API.
// 'credentials: true' allows the Authorization header for admin JWT tokens.
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

// Body parsing — JSON and URL-encoded form data.
// 1MB limit prevents memory exhaustion from oversized payloads.
// Raw body capture for webhook signature verification (before JSON parsing).
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiters — prevent brute-force attacks and abuse.
// loginLimiter: max 10 requests per 15 min per IP on the login endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// checkoutLimiter is defined inside routes/orders.js and applied there.

// Static files — serves uploaded images from the uploads/ directory.
// Uploaded image filenames are unique, so they can be cached for a year (immutable).
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '365d',
  immutable: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
}));

// Serves all frontend HTML pages and assets from the public/ directory.
// 'index: false' prevents serving index.html at '/' (we handle that via SPA fallback).
// 'extensions: ["html"]' allows /index without the .html extension.
// HTML is never cached (revalidated each visit); images cache for a year;
// css/js cache for 1 day to avoid stale assets during updates.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  extensions: ['html'],
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(path)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(css|js)$/i.test(path)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// ============================================================
// API ROUTES — all under /api
// ============================================================

// Simple test endpoint to verify the server is reachable.
app.get('/api/test', (req, res) => {
  res.json({ message: 'hello from backend', status: 'success' });
});

// Health check endpoint for monitoring.
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Apply rate limiter specifically to the login route (must be before the auth router).
app.use('/api/auth/login', loginLimiter);

// Mount all route modules under their respective /api paths.
app.use('/api/auth', require('./routes/auth'));         // Admin login/logout/me
app.use('/api/admin', require('./routes/admin'));       // Admin profile & password
app.use('/api/products', require('./routes/products')); // Product browsing + CRUD

// Checkout rate limiter is applied inside routes/orders.js before the POST handler.
app.use('/api/orders', require('./routes/orders'));     // Customer checkout + admin order management
app.use('/api/payments', require('./routes/payments')); // Payment status, webhook, tracking

app.use('/api/customers', require('./routes/customers')); // Admin customer list
app.use('/api/analytics', require('./routes/analytics')); // Admin analytics dashboard
app.use('/api/settings', require('./routes/settings'));   // Store settings (public + admin)
app.use('/api/categories', require('./routes/categories')); // Category browsing + CRUD
app.use('/api/reviews', require('./routes/reviews'));     // Product reviews (public + admin)
app.use('/api/sales', require('./routes/sales'));         // Sales / deals management (admin + public active)
app.use('/api/upload', require('./routes/upload'));       // Admin image upload
app.use('/api/delivery', require('./routes/delivery'));   // NOEST delivery integration

// Admin dashboard shortcuts — redirect to the admin login page.
app.get(['/admin', '/dashboard', '/admin/dashboard'], (req, res) => res.redirect('/admin-login.html'));

// ============================================================
// SPA FALLBACK — serves index.html for all non-API, non-upload routes.
// This allows client-side routing (e.g. /products, /checkout) to work
// by always returning the main HTML page, which handles routing via JS.
// Express 5 requires named wildcards (*path, not just *).
// ============================================================
app.get('*path', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler — catches unhandled errors from all routes.
// Returns structured JSON error responses instead of crashing the server.
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Multer-specific errors (file too large, wrong type, etc.)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: 'File upload error' });
  }
  
  // Generic 500 error — no internal details leaked to the client
  res.status(500).json({ error: 'Internal server error' });
});

// Start the HTTP server on the configured port.
app.listen(PORT, () => {
  console.log(`Server is active at http://localhost:${PORT}`);
});

// ============================================================
// ABANDONED ORDER CLEANUP — auto-cancel unpaid card orders after 1 hour.
// Runs every 5 minutes and once on startup to catch stale orders.
// ============================================================
const db = require('./db');

function cleanupAbandonedOrders() {
  try {
    const staleOrders = db.prepare(
      "SELECT id, items FROM orders WHERE payment_method = 'card' AND payment_status = 'pending' AND order_status NOT IN ('cancelled', 'delivered') AND created_at < datetime('now', '-30 minutes')"
    ).all();
    for (const order of staleOrders) {
      try {
        ordersRouter.cancelAndRestoreStock(order.id, order);
        console.log(`[CLEANUP] Auto-cancelled abandoned order #${order.id}`);
      } catch (err) {
        console.error(`[CLEANUP] Failed to cancel abandoned order #${order.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[CLEANUP] Error fetching abandoned orders:', err);
  }
}

// Initial run on startup
cleanupAbandonedOrders();

// Then every 5 minutes
setInterval(cleanupAbandonedOrders, 300000);

// Process crash handlers — log fatal errors instead of dying silently.
process.on('uncaughtException', (err) => { console.error('[FATAL] uncaughtException:', err); });
process.on('unhandledRejection', (reason) => { console.error('[FATAL] unhandledRejection:', reason); });
