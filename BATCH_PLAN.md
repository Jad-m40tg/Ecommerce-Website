# Ecommerce Web — Fix & Feature Plan

## Batch 1 — Done (completed in Alpha 1.12)
Trivials: #14, 15, 20, 27, 28, 29, 31, 7

## Batch 2 — Done (CSS + responsiveness, Alpha 1.13)
| # | Issue | File | Status |
|---|-------|------|--------|
| 30/32/35 | Carousel card widths: 240px→280px at 800px, 100%→160px at 500px | shared-responsive.css, home.css, categories.css, offers.css | ✅ Done |
| 33 | Mobile filter panel: static→fullscreen overlay at 820px | shared-responsive.css, products.css | ✅ Done |
| 35 | Product grid: 1fr→repeat(2,1fr) at 520px | shared-responsive.css, products.css | ✅ Done |
| 25 | Gallery thumbs: repeat(2,1fr)→repeat(4,1fr) at 500px | product.css | ✅ Done |

## Batch 3 — Done (JS fixes, Alpha 1.13)
| # | Issue | File | Severity | Status |
|---|-------|------|----------|--------|
| 1 | Badge operator precedence: `\|\|` vs `?:` | js/alt-home.js:170 | Medium | ✅ Done |
| 2 | No API fetch for product data | js/alt-product.js | High | ✅ Done |
| 3 | Stale array index in cart remove handler | js/cart.js:202-213 | Medium | ✅ Done |

## Batch 4 — Done (admin + features, Alpha 1.14)
| # | Issue | File | Status |
|---|-------|------|--------|
| 3 | Revenue by week static in analytics | admin-analytics.html | ✅ Done |
| 4 | Revenue counts non-delivered orders | admin-analytics.html | ✅ Done |
| 8 | Customer action buttons non-functional | admin-customers.html | ✅ Done |
| 10 | No stock limiter on quantity selector | — (deferred) |
| 13 | Admin chip doesn't redirect to profile | admin-chip pages | ✅ Done |
| 16 | Password change validation | admin-profile.html | ✅ Done |

## Batch 5 — Done (new components, Alpha 1.15)
| # | Issue | Status |
|---|-------|--------|
| 1 | Comment section with scroll effect (vertical carousel) | ✅ Done |
| 6 | 5-review limit removed | ✅ Done |
| 12 | Notification button popup | ✅ Done |
| 21 | Footer store info section | ✅ Done |
| 22 | Wishlist page | ✅ Done |

## Batch 6 — Pending (big UI changes)
| # | Issue |
|---|-------|
| 9 | Product image upload + editor redesign |
| 19 | Profile updates reflect in footer + confirmation dialog |

## Batch 7 — Pending (content + SEO + a11y)
| # | Issue |
|---|-------|
| 36 | Texts editing across all pages |
| 37 | Search optimization |
| 38 | Accessibility features |

## Batch 8 — Pending (i18n + currency)
| # | Issue |
|---|-------|
| 17 | 3-language support with switching |
| 18 | Default currency DZD |

---

## Full Issue List

1. Product comment section needs dedicated section with scroll effect (vertical carousel), page won't get long void space
2. Reviews counter + avg stars should update live without refresh (already works after refresh)
3. Admin analytics "revenue by week" static
4. Analytics counts revenue from non-delivered/pending orders incorrectly
5. "Order information" form data not sent
6. 5-review limit — should be removed
7. Checkout order works and visible in admin
8. Customer section action buttons do nothing
9. Product image upload doesn't reflect on customer side; image editor redesign
10. Quantity limiter based on stock
11. Admin profile avatar update on name change
12. Notification button needs popup with alerts (new orders, confirmations, close/clear)
13. Admin chip should redirect to profile or show popup
14. Admin search bars are pointless — remove
15. Sidebar active link icon becomes invisible on hover
16. Password change needs validation/safety
17. 3-language support with switching
18. Default currency DZD
19. Profile updates reflect in footer; save button → confirmation dialog
20. Categories search bar "all statuses" text overlap
21. Footer needs store info section (location, phone, email)
22. Wishlist page (optional)
23. Wishlist button beside add-to-cart on mobile
24. Product images zoom in/out
25. Mobile gallery thumbs should be 4 per row
26. Reviews section at very bottom below order form
27. Order form buttons: confirm order then continue shopping
28. Search icon disappears on reload (font issue → use SVG)
29. Footer contact links to Facebook
30. Skeleton loading squeezed left
31. 404 error on categories page
32. Mobile carousel "Popular across categories" — show scroll hint
33. Mobile filtering products div update
34. Offers page sales counter + "Current promotions" section + "Discounted favorites" carousel
35. All carousels need mobile updating
36. Texts editing — catchier quotes, remove dashes
37. Search optimization
38. Accessibility features
