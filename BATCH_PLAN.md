# Ecommerce Web — Fix & Feature Plan

## Batch 1 — Done (completed in Alpha 1.12)
Applied before this plan was created.

## Batch 2 — Done (CSS + responsiveness)
| # | Issue | File | Status |
|---|-------|------|--------|
| 30/32/35 | Carousel card widths: 240px→280px at 800px, 100%→160px at 500px | shared-responsive.css, home.css, categories.css, offers.css | ✅ Done |
| 33 | Mobile filter panel: static→fullscreen overlay at 820px | shared-responsive.css, products.css | ✅ Done |
| 35 | Product grid: 1fr→repeat(2,1fr) at 520px | shared-responsive.css, products.css | ✅ Done |
| 25 | Gallery thumbs: repeat(2,1fr)→repeat(4,1fr) at 500px | product.css | ✅ Done |

## Batch 3 — Done (JS fixes)
| # | Issue | File | Severity | Status |
|---|-------|------|----------|--------|
| 1 | Badge operator precedence: `\|\|` vs `?:` | js/alt-home.js:170 | Medium | ✅ Done |
| 2 | No API fetch for product data | js/alt-product.js | High | ✅ Done |
| 3 | Stale array index in cart remove handler | js/cart.js:202-213 | Medium | ✅ Done |
