# Ecommerce Web (Boularas storefront + admin)

## Quick start

```bash
npm install
npm run db:init     # create SQLite DB + seed data
npm run dev         # nodemon auto-restart on save
npm start           # node server.js
```

No test, lint, or typecheck scripts exist.

## Architecture

- **Entrypoint**: `server.js` — Express 5 app, CommonJS (`"type": "commonjs"`)
- **Database**: SQLite via `better-sqlite3` at `db/store.db`. Import with `require('../db')` (resolves to `db/index.js`). WAL mode enabled.
- **Auth**: JWT (7d expiry) in `Authorization: Bearer <token>` header. Admin-only accounts. Login: `POST /api/auth/login` with email/password.
- **Frontend**: Plain HTML pages served from project root via `express.static`. No framework — vanilla JS with `fetch()` calls.

## Database

Run `npm run db:init` to (re)create all tables and seed data:

- **admins** — email, name, avatar, password_hash, role. Default: `admin@boularas.com` / `password123`
- **products** — price_cents (integer), colors/sizes/tags/images (JSON strings), featured, on_sale, status (active/draft)
- **orders** — customer info embedded (no customer accounts), items (JSON array), payment_status, order_status, total_cents
- **categories** — name, slug (unique), image, sort_order
- **settings** — key-value store (JSON values)

## Routes (all under `/api`)

| Route | Auth | Purpose |
|-------|------|---------|
| `auth` | Public (login), Admin (me/logout) | Admin authentication |
| `admin` | Admin | Profile update, password change |
| `products` | Public (`/browse/*`), Admin (CRUD) | Product browsing + management |
| `orders` | Public (checkout POST), Admin (list/update) | Customer checkout + admin management |
| `categories` | Public (list), Admin (CRUD) | Category browsing + management |
| `customers` | Admin | Customer list (extracted from orders) |
| `analytics` | Admin | Revenue, top products, category breakdown, customer growth |
| `settings` | Public (returns safe keys), Admin (update) | Store settings |
| `upload` | Admin | Image upload via multer to `uploads/` |

Public browse endpoints: `/products/browse`, `/products/browse/featured`, `/products/browse/on-sale`, `/products/browse/:id`

## Key conventions

- **Prices** stored as integer `price_cents` (not floats)
- **Array/object fields** (`colors`, `sizes`, `tags`, `images`, `items`) stored as JSON strings, serialized/parsed in route handlers
- **Order status** field is `order_status` (not `status`) in the database
- **No customer accounts** — customers fill a form at checkout, info stored directly in orders
- **Cash on delivery** — payment_status tracks pending/paid/refunded, no payment gateway
- **SPA fallback**: serves `index.html` for non-API, non-uploads routes
- **Static security**: `/db`, `/routes`, `/middleware`, `/node_modules` blocked from static serving
- **Express 5**: named wildcards required (`*path` not `*`), `req.query` returns `undefined` for missing keys

## Frontend pages

Customer: index (home), products, product, cart, checkout, categories, offers, search-results, fable, alt-prod
Admin: admin-login, admin-dashboard, admin-products, admin-product-editor, admin-orders, admin-customers, admin-categories, admin-analytics, admin-settings, admin-profile

Admin auth flow: token stored in `localStorage` as `admin_token`, all admin `fetch()` calls include Bearer header.

## Route registration

All routes registered in `server.js`. Add new routes with `app.use('/api/<name>', require('./routes/<name>'))`.

## Environment

Uses `dotenv`. Expects `PORT` (default 5000) and `JWT_SECRET` in `.env`. See `.env.example`.
