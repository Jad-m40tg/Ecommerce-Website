# I18N-GUIDE-v2 — Boularas i18n spec (i18next, EN default + AR + FR, no layout mirroring)

Supersedes the 2026-08-18 guide. This file is the reference for the entire i18n
effort — read it instead of chat history, and paste the whole thing into the
agent's context at the start of every session. Update it in place as decisions
change, the same way the original was maintained.

## What changed from v1 — read this first
- **French added** as a third locale. Arabic ships first, fully migrated
  (structure + translation) on both surfaces, before French is even started.
  French is then a *translation-only* pass on top of the same keys — no
  template edits, a fraction of the cost of the Arabic pass.
- **RTL is cancelled.** `<html dir>` never changes, ever. Only the visible
  text changes. See "No-RTL, text-only translation" below for exactly what
  that does and doesn't mean for how Arabic renders.
- **The language switcher UI already exists** (you placed the buttons). B3
  wires logic into that existing markup — it does not build new UI.
- **Mobile layout changes are yours to do by hand.** The agent's job during
  migration is to *flag* spots where AR/FR text visibly overflows a control,
  not to restyle anything.
- **New guardrails section**, given the mimo/opencode incident where an agent
  made unauthorized changes that had to be reverted via git. Treat that
  section as non-negotiable, not boilerplate.

## Confirmed by recon (2026-08-29) — overrides assumptions below where they overlap
- 25 pages total: 14 customer (index, products, product, categories, offers,
  search-results, cart, checkout, wishlist, track, order-placed,
  payment-success, payment-failed, 404) + 11 admin (admin-login,
  admin-dashboard, admin-products, admin-product-editor, admin-orders,
  admin-customers, admin-categories, admin-analytics, admin-sales,
  admin-settings, admin-profile). No shared partial/template system — head,
  nav, and footer markup is duplicated per file, so any static markup change
  (fonts, vendor script tags) touches all 25 files individually.
- Two exceptions to that duplication, and they matter: `footer.js` builds the
  footer via `innerHTML` (one file, not 25), and `admin-topbar.js` builds the
  admin notification menu the same way (one file, not 11). Translating those
  is a single-file edit, not a per-page one.
- The language switcher (`language.js`) is already fully real, not a
  placeholder — `setLang()` already updates `localStorage['boularas_lang']`,
  `<html lang>`, active-state classes, and fires `onChange` callbacks. B3 no
  longer needs to build any switching logic — see the rewritten B3 below.
- The site has **zero cookies anywhere** (pure JWT-in-localStorage auth,
  nothing else uses `document.cookie`). Persisting language to a cookie for
  a hypothetical future backend would be new infrastructure this codebase
  doesn't otherwise use, for a backend feature that's explicitly out of
  scope — dropped, see Locked decisions.
- No build step/bundler — `server.js` serves `public/` directly via
  `express.static`, so `public/locales/**` and `public/js/vendor/**` need no
  registration anywhere, they just work once the files exist.
- `.json` responses get no explicit `Cache-Control` today. The codebase
  already has an established `?v=N` cache-busting convention for CSS/JS
  (used in the recent language-button commit) — reuse that same convention
  for the locale fetch URLs instead of inventing a caching strategy.
- Fonts load via a per-page Google Fonts `<link>`/`css2` URL, ~39 occurrences
  across the 25 files (some pages carry two). Adding Cairo is a pure
  find-and-replace across those 39 occurrences — see the efficiency section;
  this does not need agent judgment.
- Translatable JS-built text is real and non-trivial: `product.js` (15
  `innerHTML` sites), `categories.js`, `search.js`, `checkout.js`,
  `home.js`, `cart.js`, `offers.js`, `products.js` (3–5 each), plus inline
  `<script>` blocks inside several HTML files (`track.html`,
  `order-placed.html`, `payment-success.html`, `wishlist.html`,
  `admin-dashboard.html`, and others — all 11 admin pages have at least one).
  A plain HTML-text scan will miss all of this — see updated scan scope
  below.
- No hardcoded secrets, no obviously outdated dependencies. `npm audit`
  itself wasn't run — do that yourself once, it's a two-second check, before
  handing the repo broad agent access for the next few phases.
- Two guide files exist in the repo: this one and the original
  `I18N-GUIDE.md`. Delete the original or mark it superseded at the top —
  an agent that stumbles onto it mid-session will find the old RTL
  instructions this file cancels.

## Assumptions — fix these if wrong, otherwise proceed
- Currency label stays **"DA"** in all three languages.
- Dates and numbers keep their current format and digits in all three
  languages — no per-locale `Intl` formatting. Same "don't change anything
  but the words" logic applies to numbers/dates as to layout.
- French register: formal, standard France French ("vous"), e-commerce tone —
  same spirit as the locked "MSA, e-commerce tone" instruction for Arabic.
- Backend/email i18n stays out of scope, same as v1.

## Locked decisions
- i18next core only — no framework binding (vanilla JS + Node.js backend).
- Frontend plugins: i18next-http-backend only, vendored locally in
  `public/js/vendor/` — no CDN. **Drop i18next-browser-languagedetector**:
  `language.js` already owns detection + persistence via `boularas_lang`;
  init i18next with `lng` read from the existing `getLang()` instead of
  adding a second system that could disagree with the first.
- **NO backend i18n** (unchanged). **No cookie** — the site has zero cookie
  usage anywhere (JWT-in-localStorage auth only); keep persisting language
  in the existing `boularas_lang` localStorage key, don't add a new
  mechanism for a hypothetical future backend.
- Three locales, in priority order: **en** (already live, source of truth,
  `fallbackLng`) → **ar** (full migration + translation, both surfaces) →
  **fr** (translation-only, reusing ar's keys).
- Locale files: `public/locales/{en,ar,fr}/{common,customer,admin}.json` —
  flat, snake_case, max 2 levels, human-readable keys, never
  hashed/auto-generated, never regenerated wholesale once populated.
- **No RTL.** `<html dir>` is always `"ltr"`. `<html lang>` still switches
  between `en`/`ar`/`fr` — keep this, it's free and it's a real
  accessibility/SEO signal. Drop `public/css/rtl.css` and the CSS
  logical-properties work from scope entirely.
- Fonts: keep Inter + Playfair Display, add **Cairo** for Arabic glyph
  coverage. This is unrelated to RTL — Inter/Playfair simply have no Arabic
  letterforms at all, so Cairo is still required. During the French pass,
  spot-check Playfair Display's accented-character coverage (é, è, ê, ç, œ...)
  on headings; fall back that specific string to Inter if a glyph looks off.
- Language switcher: reuse the existing buttons — `language.js`'s
  `setLang()`/`onChange` API is already real, not a placeholder. Register
  `i18next.changeLanguage()` as one of its `onChange` callbacks; keep using
  `boularas_lang`, no cookie. **No dir flip.** Keep the pre-paint bootstrap
  so the page doesn't flash the wrong language on load.
- Pace: same phased cadence with review stops. Before touching more than 3
  files in a step, list them and wait for go-ahead — this rule is doing more
  work now than it did in v1 (see Guardrails).

## No-RTL, text-only translation — what this actually means
Setting `dir="rtl"` mirrors the *whole page*: nav order flips, sidebars swap
sides, icons and margins mirror, forms reverse. You don't want that, so
nothing ever sets it — `dir` stays `"ltr"` everywhere, permanently.

One thing this can't change, because it's a script property and not a layout
property: standalone Arabic text will still shape and flow right-to-left
*within its own line*, because Arabic script is inherently right-to-left at
the character level — the browser's bidi algorithm handles that
automatically, independent of the container's `dir`. So a button that says
"Proceed to Checkout" in English will show the Arabic sentence flowing
right-to-left inside that exact same button, same position, same width
behavior. That's not RTL layout leaking in — it's just what Arabic text looks
like, and it's exactly the "text transforms, layout doesn't" result you're
after. The only thing worth an eyeball in B6 is mixed strings (Arabic text
with an embedded number or a Latin word), which can look slightly odd right
at the direction boundary — not a bug, just occasionally worth a glance.

Also leave `text-align` wherever it currently is (probably left/default).
Don't add right-alignment for Arabic paragraphs — that would start
reintroducing RTL-like behavior you explicitly don't want.

## File structure
```
public/
  locales/
    en/  common.json  customer.json  admin.json
    ar/  common.json  customer.json  admin.json
    fr/  common.json  customer.json  admin.json
  js/
    vendor/  i18next.min.js  i18next-http-backend.min.js
    i18n-init.js      (bootstrap: pre-paint lang + init + apply; dir always "ltr")
    i18n-helper.js    (data-i18n scan + data-i18n-attr="placeholder:key" / "aria-label:key")
```
Namespace = filename. Always load `common`; load `customer` or `admin` per
surface. `rtl.css` is gone from this structure — there's nothing for it to do.

## Conventions
- Keys: snake_case, nested by feature/section, max 2 levels
  (e.g. `cart.checkout_button`).
- Interpolation: `"cart.item_count": "You have {{count}} items"`, called as
  `i18n.t('cart.item_count', { count })` — never string-concatenate.
- **Pluralization (new — v1 didn't cover this and Arabic needs it):** any
  string using `{{count}}` needs CLDR plural-form keys, not just one string.
  Arabic has six categories (`_zero`, `_one`, `_two`, `_few`, `_many`,
  `_other`); English and French effectively need `_one`/`_other`. i18next
  resolves these automatically via `Intl.PluralRules` if the keys are named
  correctly — the migration phases just need to actually define all the
  Arabic forms instead of one generic string, or plurals will silently fall
  back to the wrong form.
- DB enum values that are UI vocabulary (order/payment status badges) stay in
  scope: `order.status.pending`, etc. Product names/descriptions and other DB
  content stay out of scope — flag, don't translate, if found hardcoded.
- The switcher's own EN/AR/FR labels stay as literal language names, never
  translated (already how `language.js` renders them).
- No unrelated refactors/renames/cleanup while in a file for i18n reasons.
- Never regenerate a locale JSON wholesale once it has content — add/edit
  keys only.

## Phase plan (in order, stop for review between phases)
- **B0** — Setup: vendor the 2 i18next files (http-backend only), create
  `en`/`ar`/`fr` locale folders with one placeholder key per file to confirm
  loading. No behavior changes. Show diff.
- **B1** — Frontend init: i18next init (http-backend only, no detector) with
  all three locales configured, `lng` read from the existing `getLang()`,
  the data-i18n helper, pre-paint bootstrap (`dir` hardcoded `"ltr"`, never
  touched again). Write `scripts/i18n-scan.js` here too, scoped to the three
  text surfaces recon confirmed: static HTML text, `innerHTML`
  string-concatenation in `.js` files (this codebase uses
  `'...' + var + '...'`, no template literals — match that pattern), and
  inline `<script>` blocks inside HTML files. Add the optional debug
  inspector too (see "Fixing a translation later" below). List files
  touched.
- **B2** — still skipped (backend i18n, owner decision).
- **B3** — Switcher: `language.js` is already fully wired and real — no
  placeholder logic to remove. Register `i18next.changeLanguage()` (which
  triggers the actual text swap) as an `onChange` callback of the existing
  `setLang()`/`BoularasI18n` API. Don't touch persistence or the `<html
  lang>` update — `setLang()` already does both correctly. No dir logic
  exists or should be added. This phase should be small.
- **B4 — Customer pages, Arabic only:** 14 pages, no shared partials, so
  expect ~4 groups of 3–4 (e.g. cart/checkout/wishlist together;
  product/products/categories/search-results together). Hardcoded strings →
  data-i18n / `t('key')`, including the `.js` files that build markup via
  `innerHTML` (`product.js` is heaviest at 15 sites) and any inline
  `<script>` blocks. English text in the JSON stays identical to what's
  already on the page; Arabic translations added alongside. Wait for
  go-ahead between groups. Flag out-of-scope product/DB content. Flag
  (don't fix) any spot where the Arabic string looks like it'll overflow on
  mobile widths.
- **B5 — Admin pages, Arabic only:** 11 pages, same rules as B4, ~3 groups of
  3–4. `footer.js` and `admin-topbar.js` are single files shared across
  every page that includes them — translate those once, not per-page.
- **B4F / B5F — French, translation-only:** reuse the exact key set B4/B5
  already created. No template edits — the `data-i18n`/`t()` calls are
  already in place. Only `fr/*.json` values get added. This phase should be
  visibly cheaper than B4/B5; if the agent starts touching HTML/JS here,
  something's gone off-script.
- **B6 — Test:** switcher cycles EN→AR→FR→EN correctly on both surfaces and
  persists across reload/navigation; key-existence checker across all three
  dicts; grep for missed English literals; confirm `dir` is `"ltr"`
  everywhere and no RTL CSS/classes crept in from a copy-pasted example;
  Cairo renders Arabic correctly on every page; screenshots at 375/768/1280px
  in EN/AR/FR (Playwright). Text-overflow spots flagged in B4/B5 get
  addressed by you on mobile, not by the agent.

## Running this efficiently with an AI agent
The real lever here isn't "faster prompting," it's not paying LLM tokens for
work that's actually mechanical:
1. **Separate deterministic scanning from judgment calls.** Have the agent
   write a small script once (`scripts/i18n-scan.js`, in B0/B1) that walks
   the customer/admin templates *and* the `.js` files *and* inline
   `<script>` blocks (all three surfaces confirmed by recon) and lists
   un-wrapped English-looking strings with file:line references. That
   script is free to re-run — use it to generate each phase's work queue
   *and* as B6's "missed literals" check, so it pays for itself once instead
   of costing LLM time every phase.
2. **Feed the agent the scan output, not whole files**, for the judgment
   calls it actually needs to make: what key name fits, which namespace,
   in/out of scope. Small, focused context per phase.
3. **Do translation as its own tiny task**, separate from code-editing. Once
   a phase's English keys are finalized and committed, run a narrow
   session/prompt whose only input is the `{key: english_string}` pairs plus
   the tone/register rules — output just the `ar` (then later `fr`) values.
   No codebase in context at all. Cheaper per call, and the model isn't
   splitting attention between editing code and translating, so the
   translations tend to be better too.
4. **The phased review-stop cadence is a cost control, not just a safety
   one** — every stop is a chance to commit a small, clean diff instead of
   letting one balloon.
5. If OpenCode lets you route different calls to different models, spend
   Opus on the parts with real judgment (key naming, translation quality,
   in/out-of-scope calls) and let something cheaper re-run the scan script
   and do the mechanical B6 checks.
6. Arabic-then-French is itself the biggest cost saver on the board: the
   French pass touches zero templates.
7. **The Cairo font addition is a pure find-and-replace, not an LLM task.**
   All 25 files load fonts via the same Google Fonts `css2` URL pattern
   (~39 occurrences total). Do this with a plain script/codemod that appends
   `&family=Cairo:wght@...` wherever that URL appears, in one pass across
   all 25 files — don't spend agent judgment re-deciding this file by file.

## Guardrails — read this given what happened last time
- Work in a dedicated git branch for the whole effort; **commit after every
  accepted phase**, not at the end.
- Every session starts with this file plus an explicit statement of which
  phase you're on and which files are in scope. The "list files before
  touching them" rule in the phase plan is a hard stop, not a suggestion —
  don't let the agent start editing on the strength of its own summary.
- Actually read the diff before accepting, especially against the
  "no unrelated refactors" rule — that's exactly the kind of self-initiated
  change that caused the earlier revert.
- If the agent proposes touching a file outside the phase's stated list,
  stop and ask why *before* allowing it, not after.
- Small phases + frequent commits mean a bad phase costs you `git revert` of
  one commit, not a lost afternoon of uncommitted work.
- Delete `I18N-GUIDE.md` (the original v1) from the repo, or add a one-line
  "superseded, see I18N-GUIDE-v2.md" note at its top — don't leave two
  spec files in the repo, one of them still describing RTL, for an agent to
  stumble on mid-session.

## Fixing a translation you don't like, later
Because `i18next-http-backend` fetches `locales/{lng}/{ns}.json` at runtime,
changing a translation is: open the file, find the key, edit the string,
save, refresh. No rebuild, no agent required, ever, for a wording fix.
`server.js` sets no explicit `Cache-Control` for `.json` today, and this
codebase already has its own `?v=N` cache-busting convention for CSS/JS —
configure the http-backend `loadPath` to use that same convention (e.g.
`/locales/{{lng}}/{{ns}}.json?v=1`, bump the number if an edit doesn't show
up) instead of inventing a different caching strategy.

To find which key backs a piece of visible text without grepping every file,
have the agent add a small debug mode to `i18n-helper.js` in B1: gated behind
`?i18nDebug=1` (or a localStorage flag), off by default and invisible in
production, it adds a `title` attribute showing the raw key name over every
element it translates. Hover anything on the live site, see e.g.
`cart.checkout_button`, and you know exactly which JSON file and key to open.

After each B4/B5(/F) phase, have the agent produce one `AR_REVIEW.md` (and
later `FR_REVIEW.md`) listing every key touched that phase — English source,
translation, confidence flag — one file to skim instead of diffing JSON
across a dozen files. Since you'd rather do one big pass than iterate line by
line: read a review file, mark up everything you want changed in one
sitting, then either edit the JSON yourself in one sitting or hand the agent
a short `key → new value` list as its own tiny, cheap task — don't loop it in
on every single wording tweak as you notice it.

## Verification checklist (B6 + before you call it done)
- `node --check` on all touched JS.
- Key-existence checker: every `t('key')`/`data-i18n` exists in **en, ar,
  and fr** dicts (three-way now).
- `i18n-scan.js` run for missed English literals in customer + admin.
- `dir` is `"ltr"` everywhere; no RTL CSS/classes leaked in anywhere.
- Cairo renders Arabic correctly, customer + admin.
- Switcher cycles EN→AR→FR→EN and persists across reload/navigation.
- Screenshots at 375/768/1280px in EN/AR/FR (Playwright).
- Mobile text-overflow spots flagged during B4/B5 — checked and fixed by you.
- No cookie introduced anywhere, and no `i18next-browser-languagedetector`
  vendored or referenced — both are dropped per the recon-confirmed
  decisions above.
- Explicitly still out of scope, unchanged from v1: backend-rendered
  strings, transactional emails. Not covered by either guide, worth a note
  if you ever revisit: per-locale meta tags/OG data for SEO.