# Payment + Delivery Tracking — Implementation Plan

**Gateway**: Chargily Pay V2 (sandbox mode)
**Started**: 2026-08-04

## Chargily Keys (test mode)
- Public: `test_pk_IBwLkz5RgPFplCO1sKTtQNvtM8My9RC9KW205hmq`
- Secret: `test_sk_fFCm4efeQgxsrFnYD6dR5umDPH3neH4Fnayq4zH4`
- Test base: `https://pay.chargily.net/test/api/v2`
- Live base: `https://pay.chargily.net/api/v2`
- npm: `@chargily/chargily-pay`

## Phases

### Phase 1 — DB migration
Idempotent `orders` column migration in `db/index.js`:
`payment_method`, `payment_reference`, `payment_payload`, `paid_at`,
`tracking_number`, `carrier`, `tracking_url`, `tracking_code`.

### Phase 2 — Payment service
`services/payment.js` — Chargily REST via `@chargily/chargily-pay`.
`config.js` + `.env` for keys. DZD amount converted from USD cents.

### Phase 3 — Product form → checkout redirect
`product.js`: form submit adds to localStorage cart → redirect to `checkout.html`.
No order created until "Place Order" on checkout.

### Phase 4+5 — Checkout payment UI + place order flow
- Radio: "Cash on Delivery" (default) | "Pay Now — CIB / Edahabia / BaridiMob"
- COD: POST /api/orders → confirmation
- Online: POST → Chargily checkout → redirect → pay → return → poll → confirmation
- New `payment-success.html` + `payment-failed.html`

### Phase 6 — Backend routes
- `routes/orders.js` POST: accept `payment_method`, return `payment_url` + `tracking_code` for online
- `routes/orders.js` PATCH /:id: accept `payment_status`, `tracking_number`, `carrier`, `tracking_url`
- `GET /api/orders/track?code=XXX`: public lookup
- New `routes/payments.js`: `GET /status/:checkoutId` + `POST /webhook`

### Phase 7 — Tracking page
`track.html` + `track.js`: tracking code → timeline + payment status.

### Phase 8 — Admin orders
Payment method/status badges, detail modal, tracking/carrier fields.

### Phase 9 — Currency
Set `settings.currency = "DZD"`. Payment amount = price_cents × 133.40.

### Phase 10 — Verify end-to-end
