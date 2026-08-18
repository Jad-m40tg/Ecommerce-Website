# CREATOR-LAUNCH-LIST — Boularas (owner's checklist, created 2026-08-18)

Companion to `PRELAUNCH-CHECKLIST.md` (engineering-focused). Both derived from full code audits. This file is the single source of truth for launch readiness — update it as items complete.

## Done (verified by audits)
- [x] Responsive: admin drawer ≤860px, stat cards, customer navbar collapse ≤900px
- [x] Cart unification (cart-utils.js), color-dot fix, product-button stale state
- [x] Tiny UX improvement from previous project
- [x] "—" removed from AI-generated text
- [x] unused/ folder (gitignored) + orphan cleanup
- [x] Backend security audit PASS: auth on every admin route, SQL parameterized,
      upload MIME+magic-bytes, .env gitignored, JWT no-fallback, rate limits,
      helmet+CORS, error handler, WAL+FK, npm audit 0 vulns, webhook HMAC-verified
      + idempotent, atomic stock decrement
- [x] Pre-Phase-0 i18n check: NO existing scaffolding (no locales/, no i18n libs,
      no data-i18n) — blank slate confirmed

## Phase A — code fixes (continuous pass, agents) — ALL DONE (verified 2026-08-18)
- [x] Rename althome.html → index.html (server.js fallback, internal links, AGENTS.md)
- [x] FIX payment-success: customer poll 401s on admin-only /api/payments/status/:id
      (routes/payments.js:9, payment-success.html:95) — never shows success
- [x] Checkout idempotency: client submit-lock + server checkout-id dedupe
- [x] Wishlist (KEEP + fix): .nav-wish count badge, cross-tab sync, escapeHtml
      (wishlist.html:150-152). Removal decision deferred with promos post-launch
- [x] Reviews: once-per-customer (email + client flag + server UNIQUE(product_id,email));
      delete review sends Bearer token + ✕ hidden from non-admins (product.js:192,211)
- [x] /admin pretty URL → admin-login.html redirect
- [x] SEO: dynamic per-product title, OG/Twitter, JSON-LD Product+Org, robots.txt,
      sitemap.xml, 3 missing meta descriptions, remove fable.html refs
- [x] a11y: :focus-visible, skip link, contrast (sage/amber/gray-on-beige), role=alert,
      hamburger aria-expanded+Escape, payment-failed dead menu, dialog semantics
      (note: aria-expanded everywhere; Escape-to-close mobile nav NOT implemented —
      minor optional nicety, menus close on link click + outside click)
- [x] Resilience: process.on handlers, busy_timeout, delete dead test_product_check.js,
      clear duplicate Aspen seed row

## Post-Phase-A bugfix — product images (2026-08-18, verified)
- [x] Root cause: 28 seed image files (/uploads/*.jpg) never existed on disk (uploads/
      gitignored) → all seed products/categories 404'd; placeholder.jpg was a 1×1 gray
      pixel copied over them by an earlier fix → blank "light background" images
- [x] Fix: DB + db/init.js seed → /assets/noImageForItem.png; deleted 28 cursed copies;
      placeholder.jpg overwritten with real default bytes; wishlist + admin fallbacks
      hardened; site-wide agent audit PASS (no dangling refs, all URLs 200)

## Phase B — i18n (AR + EN, MSA; French later) — see I18N-GUIDE.md
- [ ] B0 Setup: vendor i18next (core + http-backend + languagedetector) in public/js/vendor/,
      create public/locales/{en,ar}/{common,customer,admin}.json (placeholder keys)
- [ ] B1 Frontend init: i18next init + data-i18n / data-i18n-attr="placeholder:key" helper
      + pre-paint lang/dir bootstrap
- [ ] B3 Language switcher: navbar (customer) + topbar (admin), changeLanguage +
      localStorage + cookie + dir/lang flip
- [ ] B4 Customer pages migration (file-by-file, snake_case keys, max 2 levels,
      interpolation for dynamic strings, order-status enum keys in scope,
      product content out of scope + flagged)
- [ ] B5 Admin pages migration (same rules)
- [ ] B6 Test: AR/EN switch both surfaces, reload persistence, RTL (nav/tables/forms/
      modals), rtl.css overrides + Cairo font added to Google Fonts + font stacks,
      Arabic wording report for owner review (i18n-ally editing afterwards)

## Phase C — verification + QA
- [ ] Verification agent sweep (24 pages, no broken JS, key-existence checker)
- [ ] Playwright QA suite (dev-dep): load all 24 pages, AR/EN switch, RTL layout,
      full checkout flow (sandbox), screenshots at 375/768/1280px
- [ ] OWNER sanity QA (~30-60 min): real-device pass + Chargily sandbox payment
      approval (the only things automation cannot do)
- [ ] Post-QA visual/UX fixes round

## Deferred (explicitly — do not start without owner's go-ahead)
- [ ] Promo-code mismatch (offers.js advertises WELCOME15/STUDENT10/FREESHIP/GIFT50
      + free delivery over 66,700 DA; backend has BOUL10/WELCOME5 + 99.99 DA) —
      client hasn't asked; keep or remove with wishlist later
- [ ] Wishlist removal decision (pending client feedback)
- [ ] Pricing study (owner handles post-delivery, needs supplier costs)
- [ ] Full i18n FR (infrastructure ready in B0-B6, add fr dict + strings)
- [ ] Product-content i18n (name_ar/description_ar DB columns) — when client
      delivers real catalog
- [ ] Admin JWT → httpOnly cookie; backup/uptime/PM2 (host-level)
- [ ] Terms/refund/privacy policy pages
- [ ] Test vs live key audit (test keys in .env until LAUNCH DAY)

## LAUNCH DAY (owner + runbook, NOT before)
- [ ] Swap to live Chargily keys (test keys in .env until now — DO NOT swap early)
- [ ] Regenerate JWT_SECRET, SEED_ADMIN_PASSWORD, admin credentials
- [ ] ENABLE_NOEST_VALIDATION=1 + verify NOEST live keys
- [ ] Chargily live-mode merchant account setup steps
- [ ] Reverify PRELAUNCH-CHECKLIST.md line by line

## Guardrails (project-wide)
- NEVER touch: payment-success.html (unless explicitly scoped), middleware/auth.js,
  services/payment.js signature logic, wishlist removal without go-ahead
- NEVER swap API keys before launch day
- .opencode/ + PRELAUNCH-CHECKLIST.md + CREATOR-LAUNCH-LIST.md + I18N-GUIDE.md: never commit
- Ask the owner when confused — never guess