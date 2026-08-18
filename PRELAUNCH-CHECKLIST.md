# Pre-Launch Checklist — Ecommerce Site

**Scope:** everything to verify before UI polish, a11y, SEO, i18n. This is about "won't go down / won't lose an order / won't leak data" — the boring stuff that matters most in hour one with real customers.

---

## Legend
- 🔴 launch-blocker
- 🟡 fix within first week
- 🟢 can wait

---

## 1. Payments (Chargily) — where real money is on the line

- [ ] 🔴 **Webhook signature verification** — confirm routes/payments.js verifies Chargily's webhook signature before trusting any payment-status update. If it doesn't, anyone can POST a fake "paid" event and get free orders.
- [ ] 🔴 **Idempotency on webhooks** — Chargily (like most gateways) can send the same webhook more than once. If a duplicate webhook re-triggers stock decrement, order confirmation email, or NOEST shipment creation, you'll double-ship or oversell. Key the handler off checkout ID and make it a no-op if already processed.
- [ ] 🔴 **Never trust the client for payment success** — confirm the frontend redirect to payment-success.html doesn't itself mark the order paid. The order should only flip to "paid" when the backend verifies with Chargily (webhook or a server-side status check), not just because the browser landed on the success page.
- [ ] 🔴 **Test vs live keys** — verify .env on production has live Chargily keys, not test/sandbox ones, and that this is never hardcoded in services/payment.js or config.js.
- [ ] 🔴 **Stock reservation timing** — decide and confirm: does routes/orders.js decrement stock when the order is created (before payment) or when payment is confirmed? If it's "on create," an abandoned/failed checkout can lock stock that never sells. If it's "on confirm," two customers can both see 1 item in stock and both attempt checkout — you need to handle the second one failing gracefully at payment time.
- [ ] 🟡 **Abandoned/pending order cleanup** — orders that never get paid will pile up in "pending" state. Decide a TTL (e.g. auto-cancel after 24h) so they don't clutter admin views or hold stock forever.
- [ ] 🟡 **Failed/declined/expired payment paths** — actually test these, not just the happy path. Chargily sandbox lets you simulate declines — confirm the customer sees a clear message and the order doesn't get stuck in limbo.
- [ ] 🟡 **DZD currency correctness** — confirm amounts sent to Chargily match price() output exactly (no rounding drift, no cents-vs-dinar unit mismatch).
- [ ] 🟡 **Timeout/retry on Chargily API calls** — if their API is slow or briefly down during checkout, does services/payment.js fail cleanly with a retry-able error, or does the request hang/crash?
- [ ] 🟡 **Refund process** — even a manual admin-triggered refund flow; decide now how a refund is recorded against an order so support doesn't improvise later.
- [ ] 🟢 **Log payment failures** with enough detail to debug, but never log full card data, secret keys, or full webhook payloads with customer PII in plaintext logs.

## 2. Order & inventory logic

- [ ] 🔴 **Overselling race condition** — two customers checking out the last unit at the same time. Confirm the stock decrement is an atomic DB operation (UPDATE ... WHERE stock >= qty, checking rows affected), not a read-then-write in JS that can race.
- [ ] 🔴 **Duplicate order on double-click / resubmit** — test rapidly double-clicking "Place Order" on checkout.js. Does it create two orders? Add a submit-lock client-side and a server-side idempotency check.
- [ ] 🟡 **Price/stock changes mid-cart** — cart is stored client-side (localStorage per cart-utils.js); if a product's price or stock changed since it was added, does checkout re-validate against current DB values, or trust the stale cart data? It must re-validate server-side regardless of what the client sends.
- [ ] 🟡 **Order status state machine** — list out valid states (pending, paid, processing, shipped, delivered, cancelled, refunded) and confirm routes/orders.js doesn't allow invalid transitions (e.g. shipped → pending).
- [ ] 🟢 **NOEST delivery integration** (services/noest.js) — confirm failures to create a shipment don't silently fail; the order shouldn't look "complete" to the customer if NOEST rejected it.

## 3. Security

- [ ] 🔴 **Admin routes actually protected everywhere** — audit every route in routes/admin.js, products.js (admin CRUD), categories.js (admin CRUD), customers.js, settings.js, upload.js and confirm middleware/auth.js (with role check, not just "logged in") is applied on every single one. This is the single easiest thing to miss on one forgotten route.
- [ ] 🔴 **SQL injection** — confirm all DB queries use parameterized statements (? placeholders), especially anywhere user input touches a query (search, filters, login). Never string-concatenate into SQL.
- [ ] 🔴 **Default admin credentials changed** — if db/init.js seeds a default admin (admin/admin123 or similar), confirm it's been changed or removed before go-live.
- [ ] 🔴 **Secrets not in the repo** — confirm .env is gitignored and only .env.example (with placeholder values) is committed. Check git history too — if a real key was ever committed and pushed, rotate it now, deleting the file later doesn't remove it from history.
- [ ] 🔴 **JWT secret strength + expiration** — a long random secret (not "secret123"), reasonable token expiry, and confirm expired/invalid tokens are actually rejected (test with a tampered token).
- [ ] 🔴 **File upload validation** (routes/upload.js, multer) — restrict to actual image MIME types (checked server-side, not just by file extension), cap file size, and sanitize/randomize filenames so someone can't upload ../../server.js or an executable disguised as a .jpg.
- [ ] 🟡 **Error responses don't leak internals** — confirm a global Express error handler exists that returns a generic message in production, not raw stack traces or SQL error text (which can reveal table/column names to an attacker).
- [ ] 🟡 **Rate limiting on login** (routes/auth.js) and checkout — without it, someone can brute-force the admin password or hammer the payment endpoint. express-rate-limit is a 10-minute add.
- [ ] 🟡 **CORS configured explicitly** — not wide open (*) if cookies/tokens are involved; restrict to your actual frontend origin.
- [ ] 🟡 **Security headers** — add helmet middleware (CSP, X-Frame-Options, etc.) — cheap to add, meaningfully reduces XSS/clickjacking surface.
- [ ] 🟡 **XSS via product data / reviews** — confirm escapeHtml from utils.js is used consistently everywhere user-influenced or admin-entered text (product names, review text, descriptions) gets rendered into the DOM, not just on some pages.
- [ ] 🟡 **npm audit** — run it, fix high/critical vulnerabilities in dependencies before launch.
- [ ] 🟡 **Token storage** — if the admin JWT is stored in localStorage, it's readable by any injected script (XSS → token theft). An httpOnly cookie is safer if you can switch; if not, XSS prevention above becomes even more important.
- [ ] 🟢 **hidden_customers table** — you already have a mechanism for hiding customer emails, which is a good privacy signal. Just confirm "hidden" customers are actually excluded from all admin list/export views, not just the main list.

## 4. Database (SQLite)

- [ ] 🔴 **Backup strategy exists before launch**, not after an incident — SQLite is a single file (store.db); set up an automated daily copy to somewhere off-server (cloud storage, even a cron'd scp). "The file is right there" is not a backup plan.
- [ ] 🔴 **WAL mode confirmed active in production** — you have store.db-wal/store.db-shm files, so WAL looks enabled locally; verify the production DB connection also sets PRAGMA journal_mode=WAL — it's what lets reads and writes not block each other under concurrent checkout traffic.
- [ ] 🟡 **Foreign keys enforced** — PRAGMA foreign_keys = ON — SQLite defaults this off, so orphaned rows (an order referencing a deleted product) are easy to create by accident unless this is explicitly set.
- [ ] 🟡 **Indexes on hot columns** — product search/filter columns, order lookup by customer/status, anything in a WHERE on a table that'll grow. Missing indexes won't break anything at launch but will slow down noticeably as data grows.
- [ ] 🟡 **Seed/test data cleared** — confirm db/init.js's seed data (test products, dummy orders) isn't going live as real inventory, and that re-running init.js (if it ever gets triggered accidentally) can't wipe production data.
- [ ] 🟢 **Know SQLite's real limit for you**: it's genuinely fine for a single-server store at moderate traffic (writes are serialized but fast). If you ever run multiple app server instances behind a load balancer, SQLite won't work across them — that's a future-you problem, not a launch blocker.

## 5. Backend/API reliability ("won't go down")

- [ ] 🔴 **Process manager with auto-restart** — if node server.js is just run directly and it crashes on an unhandled error, the site is down until someone notices. Use PM2 (or systemd) so it auto-restarts.
- [ ] 🔴 **Unhandled promise rejections / uncaught exceptions don't crash silently** — add a top-level handler that at minimum logs the error before the process would exit, so you have something to debug from instead of just "site went down at 2am, no idea why."
- [ ] 🔴 **Global Express error-handling middleware** — one bad request shouldn't be able to take down the whole process; confirm async route handlers have their errors caught (a try/catch or a wrapper) and forwarded to the error middleware, not left to throw unhandled.
- [ ] 🟡 **Health check endpoint** (e.g. GET /health) — needed for any uptime monitor or reverse proxy to know the app is alive.
- [ ] 🟡 **Input validation on every endpoint** — server-side, not just relying on frontend form validation. Anyone can hit your API directly with curl/Postman, bypassing all your JS validation entirely.
- [ ] 🟢 **Consider basic request logging** (method, path, status, response time) — invaluable for diagnosing "what happened right before it broke."

## 6. Server / deployment / infra

- [ ] 🔴 **HTTPS enforced** — Chargily and any real payment flow needs this; also required for people to trust entering card details. Redirect HTTP → HTTPS.
- [ ] 🔴 **Production env vars set correctly on the actual host** — not just in your local .env; double check the deployed environment has the right (live, not test) values for every key config.js reads.
- [ ] 🔴 **uploads/ folder persists across deploys/restarts** — if you're on a platform with an ephemeral filesystem (e.g. some free-tier hosts, containers without a mounted volume), product images uploaded via upload.js will vanish on the next deploy. Confirm this is backed by persistent storage.
- [ ] 🟡 **Reverse proxy in front of Node** (nginx or platform equivalent) — for TLS termination, gzip, and serving static files efficiently instead of through Express.
- [ ] 🟡 **Log files don't grow unbounded** — server.out.log/server.err.log sitting in the repo root now; make sure in production these either go through a log manager with rotation or aren't just appended to forever.
- [ ] 🟢 **Basic uptime monitor** (UptimeRobot, or similar free tier) hitting the health check endpoint, so you find out about downtime from a text message, not from a customer.

## 7. Admin panel

- [ ] 🟡 **Confirm every admin page checks auth client-side too** (redirect to login if no valid token) — not for security (the backend already enforces that), but so an admin doesn't see a broken blank page instead of a login prompt.
- [ ] 🟢 **Basic audit trail** — even just a "last edited by / last edited at" on products and orders — makes debugging "wait, who changed this price" much easier once more than one person has admin access.

## 8. Frontend robustness (vanilla JS)

- [ ] 🟡 **Network failure handling** — what happens if a fetch() in api-helpers.js fails (server down, offline, timeout)? Confirm it shows a toast/error state, not a silently broken page or an infinite skeleton loader.
- [ ] 🟡 **Empty states** — empty cart, zero search results, empty category, out-of-stock product page. Test each on purpose; these get skipped in normal happy-path testing.
- [ ] 🟡 **Stale cart items** — a product in a customer's saved cart gets deleted or goes out of stock; confirm cart.js handles a missing/changed product gracefully instead of erroring on undefined.
- [ ] 🟢 **Broken product image fallback** (placeholder already exists in your assets — just confirm it's actually wired up as an onerror fallback).

## 9. Testing before you flip it live

- [ ] 🔴 **Full checkout run-through for all three payment methods** (Dahabia/EDAHABIA, CIB, BaridiMob) in Chargily sandbox, including at least one deliberate decline/failure per method.
- [ ] 🔴 **Concurrent-checkout test** — two browser tabs/devices buying the last unit of the same product at the same time; confirm only one succeeds and the other gets a clear "out of stock" response, not a broken order.
- [ ] 🟡 **Run test_product_check.js** — confirm it still passes and check what it actually covers, so you know what it doesn't cover.
- [ ] 🟡 **Cross-browser pass** (Chrome, Firefox, Safari — Safari especially, since it diverges most on date/localStorage/CSS quirks) and one real mobile device test of full checkout, not just DevTools' mobile emulator.
- [ ] 🟢 **Anything still open in BATCH_PLAN.md / PLAN-payment-tracking.md** — worth a final pass to confirm nothing planned there is silently unfinished.

## 10. Legal/compliance (Algeria-specific)

- [ ] 🟡 **Terms of sale, return/refund policy, and privacy policy pages** — Chargily's merchant terms typically expect these to exist on a live site, and customers will look for them.
- [ ] 🟢 **Confirm whatever business/merchant registration Chargily required for live-mode approval is complete** (this gates you from ever going live with real money if missed, so worth confirming now rather than discovering it at launch).

---

> **If you only have time for the 🔴 row:** webhook verification + idempotency, atomic stock decrement, admin route auth audit, secrets not in git, SQLite backups, process auto-restart, HTTPS, and the concurrent-checkout test. Those are the ones where a gap means either lost money or a 2am outage with no way to recover.
