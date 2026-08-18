# I18N-GUIDE — Boularas i18n implementation spec (i18next, EN default + AR)

Derived 2026-08-18. Adaptation of the owner's Claude prompt + locked owner decisions.
This file is the reference for the entire i18n work — read it instead of the chat history.

## Locked decisions (do not deviate without asking)
- i18next core only — no framework binding (vanilla JS + Node.js backend)
- Frontend plugins: i18next-http-backend (fetch JSON) + i18next-browser-languagedetector
- All three vendored locally in `public/js/vendor/` — NO CDN dependency, self-hosted
- **NO backend i18n** (skipped by owner decision — backend renders no server-side
  strings, sends no emails; API errors are translated client-side). Lang still
  persisted to a cookie in B3 for future backend use
- Locale files: `public/locales/{en,ar}/{common,customer,admin}.json` (flat
  key→string objects, snake_case keys, max 2 levels deep, human-readable keys —
  owner edits these later in i18n-ally, never hashed/auto keys)
- English = source of truth + default + fallback (fallbackLng: 'en')
- Arabic = MSA (الفصحى), Western digits, "DA" currency label. Owner hand-corrects
  wording afterwards — flag any idiom/term you're unsure about in phase reports
- Language switcher: customer navbar + admin topbar; changeLanguage + localStorage
  + cookie + <html lang/dir> flip; pre-paint bootstrap to avoid flash
- RTL: set <html dir="rtl" lang="ar"> / dir="ltr" lang="en">. Use CSS logical
  properties for NEW css. Use `public/css/rtl.css` [dir="rtl"] overrides for
  existing physical-property CSS (owner-approved; NOT a full migration)
- Fonts: current = Inter + Playfair Display (no Arabic coverage). Add **Cairo**
  to Google Fonts links + font-family stacks on ALL pages (customer + admin),
  e.g. `font-family: 'Inter', 'Cairo', sans-serif`
- Pace: phased with grouped review stops (B0 → B1 → B3 → B4 → B5 → B6), ~6 stops.
  Before editing >3 files in a step: list the files first and wait for go-ahead.

## File structure
```
public/
  locales/
    en/  common.json  customer.json  admin.json
    ar/  common.json  customer.json  admin.json
  js/
    vendor/  i18next.min.js  i18next-http-backend.min.js  i18next-browser-languagedetector.min.js
    i18n-init.js      (bootstrap: pre-paint lang/dir + init + apply)
    i18n-helper.js    (data-i18n scan + data-i18n-attr="placeholder:key" convention)
  css/rtl.css         ([dir="rtl"] overrides, loaded last on every page)
```
Namespace = filename. Always load `common`; load `customer` or `admin` per surface.
Example key shape (en/customer.json):
```json
{ "cart": { "title": "Your Cart", "empty": "Your cart is empty",
            "checkout_button": "Proceed to Checkout" } }
```
Mirror identical key structure in ar/ with translated values.

## Conventions
- Keys: snake_case, nested by feature/section, max 2 levels (e.g. cart.checkout_button)
- Interpolation for dynamic strings: `"cart.item_count": "You have {{count}} items"`
  called as `i18n.t('cart.item_count', { count })` from JS — never concatenate
- DB enum values that are UI vocabulary ARE in scope (order_status / payment_status
  badges: pending/paid/shipped/delivered/cancelled/refunded → keys like
  order.status.pending, mapped at render time)
- Product names/descriptions and other DB content are OUT of scope — if hardcoded
  product data is found mixed into a template, FLAG it, don't translate it
- No unrelated refactors/renames/cleanup while in a file for i18n reasons
- Never regenerate a locale JSON wholesale once it has content — add/edit keys only

## Phase plan (in order, stop for owner review between phases)
- B0 — Setup only: vendor the 3 i18next files, create locale folders + one
  placeholder key per file to confirm loading. No behavior changes. Show diff.
- B1 — Frontend init: i18next init (http-backend + languagedetector), the
  data-i18n helper, pre-paint lang/dir bootstrap. List files touched.
- B2 — SKIPPED (backend i18n — owner decision)
- B3 — Language switcher: dropdown/toggle in customer nav + admin nav:
  (a) i18next.changeLanguage, (b) persist localStorage + cookie, (c) flip
  lang/dir on <html>. Add cookie so a future backend could read it.
- B4 — Customer pages migration: hardcoded strings → data-i18n / t('key'),
  keys added to en (existing text unchanged) + ar (translation). Grouped diffs
  (3-4 pages per group), wait for go-ahead between groups.
- B5 — Admin pages migration: same rules, grouped diffs.
- B6 — Test: switch on both surfaces, reload, RTL layout (nav, tables, forms,
  modals), persistence across reload/navigation, Arabic confidence report.
  Also: rtl.css finalization + Cairo font on all pages.

## Report-back after each phase (even B0)
- Files changed
- Strings you weren't sure how to key (common vs surface namespace)
- Arabic translations you're not confident about (idioms, e-commerce terms)
  so the owner knows what to double-check in i18n-ally

## Verification (B6 + before owner handoff)
- node --check on all touched JS
- Key-existence checker: every t('key') and data-i18n exists in BOTH en + ar dicts
- Grep for missed English literals in customer + admin surfaces
- Screenshots at 375/768/1280px in EN + AR (Playwright, Phase C)