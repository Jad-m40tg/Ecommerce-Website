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
const { getCheckout } = require('./services/payment');
const { sendProductPage } = require('./services/seo');

const app = express();

// Behind a reverse proxy (nginx/etc.) which sets X-Forwarded-For. Telling
// Express to trust one proxy hop per-deployment makes req.ip resolve to the
// real client address instead of the proxy's, so express-rate-limit can apply
// limits per-client rather than globally. Without this, a proxied request
// (e.g. Chargily redirect -> /api/payments/public-status) triggers
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and effectively blocks legit traffic.
app.set('trust proxy', 1);

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

// SEO: serve a dynamic XML sitemap and a static robots.txt.
// robots.txt lives in public/ and is served by the static handler below;
// we only mount the dynamic sitemap route here (it must precede the wildcard).
app.use(require('./routes/sitemap'));

// SEO: product pages are a single static template (product.html?id=...) with
// per-product <head> metadata injected server-side before static serving.
// Handles the canonical, title/description, Open Graph, and JSON-LD for real
// ids, and returns a genuine 404 for nonexistent/inactive product ids.
app.get(['/product.html', '/product'], sendProductPage);

// Serves all frontend HTML pages and assets from the public/ directory.
// 'index: false' prevents serving index.html at '/' (we handle that via SPA fallback).
// 'extensions: ["html"]' allows /index without the .html extension.
// HTML is never cached (revalidated each visit); images cache for a year;
// css/js cache for 1 day to avoid stale assets during updates.
// During development (NODE_ENV !== 'production') css/js are NOT cached at all,
// so a normal refresh always shows the latest edits — no hard-refresh or
// manual browser cache clearing needed.
const isProduction = process.env.NODE_ENV === 'production';
const cssJsCache = isProduction ? 'public, max-age=86400' : 'no-cache';
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  extensions: ['html'],
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(path)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(css|js)$/i.test(path)) {
      res.setHeader('Cache-Control', cssJsCache);
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
  // Serve the storefront shell only for the root path (the home page).
  // The static middleware above already resolves every known page, both with
  // and without the .html suffix (extensions:['html']), so the only requests
  // that legitimately reach here are the bare root and genuinely dead URLs.
  // Returning a genuine 404 for the latter removes soft-404 signals.
  if (req.path === '/' || req.path === '') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
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

async function cleanupAbandonedOrders() {
  try {
    const staleOrders = db.prepare(
      "SELECT id, items, payment_reference, stock_deducted FROM orders WHERE payment_method = 'card' AND payment_status = 'pending' AND order_status NOT IN ('cancelled', 'delivered') AND created_at < datetime('now', '-30 minutes')"
    ).all();
    for (const order of staleOrders) {
      try {
        // Confirm with Chargily that the checkout was never paid BEFORE auto-
        // cancelling. If both the success-page poll and the webhook missed the
        // event (no webhook URL configured, customer closed the tab), the DB
        // still says 'pending' but the customer DID pay — auto-cancelling would
        // bounce a real order and put its stock back on the shelf for a second
        // sale (overselling).
        if (order.payment_reference) {
          let checkout = null;
          try {
            checkout = await getCheckout(order.payment_reference);
          } catch (e) {
            console.error('[CLEANUP] Chargily lookup failed for order #' + order.id + ':', e.message);
            continue; // can't confirm it wasn't paid — leave the order alone
          }
          if (checkout && checkout.status === 'paid') {
            db.prepare("UPDATE orders SET payment_status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status NOT IN ('paid', 'refunded')").run(order.id);
            console.log('[CLEANUP] Order #' + order.id + ' was already paid — marked paid instead of cancelling');
            // Payment confirmed → deduct the deferred stock (idempotent).
            try { ordersRouter.deductStockForPaidOrder(order.id, order); }
            catch (e) { console.error('[CLEANUP] Failed to deduct stock for paid order #' + order.id + ':', e); }
            continue;
          }
          if (checkout && checkout.status !== 'pending') {
            // Chargily says failed/canceled/expired — cancel (stock-aware restore).
            ordersRouter.cancelAndRestoreStock(order.id, order);
            console.log('[CLEANUP] Auto-cancelled abandoned order #' + order.id + ' (Chargily status: ' + checkout.status + ')');
            continue;
          }
        }
        // No checkout reference (Chargily checkout creation failed at order
        // time) or Chargily still lists the checkout as pending after 30 min
        // (customer abandoned the payment page) — cancel (stock-aware restore).
        ordersRouter.cancelAndRestoreStock(order.id, order);
        console.log('[CLEANUP] Auto-cancelled abandoned order #' + order.id);
      } catch (err) {
        console.error('[CLEANUP] Failed to cancel abandoned order #' + order.id + ':', err);
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

// Automatic backups — use the safe online backup API (works while live).
// Backs up on startup and every 6 hours; old backups are pruned automatically.
const { createBackup } = require('./db/backup');
function runBackup() {
  createBackup()
    .then((file) => console.log('[BACKUP] ' + file))
    .catch((e) => console.error('[BACKUP] failed:', e.message));
}
runBackup();
setInterval(runBackup, 6 * 60 * 60 * 1000); // every 6 hours

// Process crash handlers — log fatal errors instead of dying silently.
process.on('uncaughtException', (err) => { console.error('[FATAL] uncaughtException:', err); });
process.on('unhandledRejection', (reason) => { console.error('[FATAL] unhandledRejection:', reason); });
