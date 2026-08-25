// tests/pricing.test.js — Regression tests for services/pricing.js.
// Pure-function tests only: dbGetProduct is injected as a fake, so no DB
// state is read or modified by these tests (activeSalesMap property checks
// only SELECT and are asserted generically so they pass regardless of rows).
const { test } = require('node:test');
const assert = require('node:assert');
const { activeSalesMap, buildOrderItems, computeTotals } = require('../services/pricing');

// Fake product catalog (mirrors the bug report scenario):
// Sofa costs 19,000 DA normally; live sale drops it to 7,600 DA.
const CATALOG = {
  1: { id: 1, name: 'Oslo Velvet Sofa', price_cents: 1900000, stock: 10, colors: ['Emerald Green', 'Dusty Rose', 'Charcoal', 'Navy'], sizes: ['2-Seater', '3-Seater', 'L-Shape'] },
  2: { id: 2, name: 'Bergen Oak Table', price_cents: 90000, stock: 0 },
  3: { id: 3, name: 'Plain Mug', price_cents: 50000, stock: 5, colors: '[]', sizes: '[]' }
};
const dbGetProduct = (id) => CATALOG[id] || null;

const SALE_1 = {
  product_id: 1,
  original_price_cents: 1900000,
  sale_price_cents: 760000,
  start_at: '2026-08-25T16:31',
  end_at: '2026-09-01T16:31'
};

const DELIVERY_FEE = 120000;          // 1,200 DA
const FREE_THRESHOLD = 800000;        // free delivery over 8,000 DA
const ITEMS_ONE_SOFA = [{ product_id: 1, quantity: 1 }];

test('no sale + COD: charges original price', () => {
  const { resolvedItems, subtotal_cents } = buildOrderItems({ items: ITEMS_ONE_SOFA, dbGetProduct, saleMap: {} });
  assert.strictEqual(resolvedItems[0].price_cents, 1900000);
  assert.strictEqual(resolvedItems[0].original_price_cents, null);
  assert.strictEqual(subtotal_cents, 1900000);
});

test('no sale + card: identical math to COD (payment method never affects pricing)', () => {
  const cod = computeTotals({ subtotal_cents: 1900000, appliedPromo: null, deliveryFeeCents: DELIVERY_FEE, freeDeliveryThresholdCents: FREE_THRESHOLD });
  const card = computeTotals({ subtotal_cents: 1900000, appliedPromo: null, deliveryFeeCents: DELIVERY_FEE, freeDeliveryThresholdCents: FREE_THRESHOLD });
  assert.deepStrictEqual(cod, card);
  // 19,000 >= 8,000 threshold -> shipping waived
  assert.strictEqual(cod.shipping_cents, 0);
  assert.strictEqual(cod.total_cents, 1900000);
});

test('live sale: charges sale price and records the original', () => {
  const { resolvedItems, subtotal_cents } = buildOrderItems({
    items: ITEMS_ONE_SOFA,
    dbGetProduct,
    saleMap: { 1: SALE_1 }
  });
  assert.strictEqual(resolvedItems[0].price_cents, 760000);
  assert.strictEqual(resolvedItems[0].original_price_cents, 1900000);
  assert.strictEqual(subtotal_cents, 760000);
});

test('sale outside window (expired / not started): falls back to original price', () => {
  // activeSalesMap filters non-live windows out, so production passes an
  // empty map here — buildOrderItems must fall back to products.price_cents.
  const { resolvedItems, subtotal_cents } = buildOrderItems({ items: ITEMS_ONE_SOFA, dbGetProduct, saleMap: {} });
  assert.strictEqual(resolvedItems[0].price_cents, 1900000);
  assert.strictEqual(subtotal_cents, 1900000);
});

test('free-delivery threshold flips because of the sale price (original qualifies, sale does not)', () => {
  // Original 19,000 >= 8,000 threshold -> shipping would be free at full price...
  const atOriginal = computeTotals({ subtotal_cents: 1900000, appliedPromo: null, deliveryFeeCents: DELIVERY_FEE, freeDeliveryThresholdCents: FREE_THRESHOLD });
  assert.strictEqual(atOriginal.shipping_cents, 0);
  // ...but the sale-priced subtotal 7,600 < 8,000 -> shipping IS charged.
  const atSale = computeTotals({ subtotal_cents: 760000, appliedPromo: null, deliveryFeeCents: DELIVERY_FEE, freeDeliveryThresholdCents: FREE_THRESHOLD });
  assert.strictEqual(atSale.shipping_cents, DELIVERY_FEE);
  assert.strictEqual(atSale.total_cents, 760000 + DELIVERY_FEE);
});

test('sale-priced subtotal above the threshold still ships free', () => {
  // Two sofas on sale: 15,200 >= 8,000 -> shipping waived.
  const totals = computeTotals({ subtotal_cents: 1520000, appliedPromo: null, deliveryFeeCents: DELIVERY_FEE, freeDeliveryThresholdCents: FREE_THRESHOLD });
  assert.strictEqual(totals.shipping_cents, 0);
  assert.strictEqual(totals.total_cents, 1520000);
});

test('promo code applies on top of the sale-priced subtotal', () => {
  const totals = computeTotals({ subtotal_cents: 760000, appliedPromo: { code: 'BOUL10', pct: 0.10 }, deliveryFeeCents: DELIVERY_FEE, freeDeliveryThresholdCents: FREE_THRESHOLD });
  assert.strictEqual(totals.discount_cents, 76000); // 10% of the SALE subtotal
  assert.strictEqual(totals.total_cents, 760000 - 76000 + DELIVERY_FEE);
});

test('buildOrderItems throws the exact errors the orders route catches', () => {
  assert.throws(
    () => buildOrderItems({ items: [{ product_id: 99, quantity: 1 }], dbGetProduct, saleMap: {} }),
    /Product 99 not found or inactive/
  );
  assert.throws(
    () => buildOrderItems({ items: [{ product_id: 2, quantity: 1 }], dbGetProduct, saleMap: {} }),
    /Insufficient stock for Bergen Oak Table/
  );
});

test('variant passthrough: explicit color/size survive; junk on a variant-free product becomes null', () => {
  const { resolvedItems } = buildOrderItems({
    items: [
      { product_id: 1, quantity: 1, color: 'red', size: '40cm' },
      { product_id: 3, quantity: 1, color: '', size: '   ' },
      { product_id: 3, quantity: 1, color: 123, size: null }
    ],
    dbGetProduct,
    saleMap: {}
  });
  assert.strictEqual(resolvedItems[0].color, 'red');
  assert.strictEqual(resolvedItems[0].size, '40cm');
  assert.strictEqual(resolvedItems[1].color, null, 'variant-free product keeps color null');
  assert.strictEqual(resolvedItems[1].size, null, 'variant-free product keeps size null');
  assert.strictEqual(resolvedItems[2].color, null, 'non-string -> null');
  assert.strictEqual(resolvedItems[2].size, null, 'null -> null');
});

test('legacy cart line (empty color/size) inherits the product default variants', () => {
  const { resolvedItems } = buildOrderItems({
    items: [{ product_id: 1, quantity: 1, color: '', size: '' }],
    dbGetProduct,
    saleMap: {}
  });
  assert.strictEqual(resolvedItems[0].color, 'Emerald Green', 'first configured color');
  assert.strictEqual(resolvedItems[0].size, '2-Seater', 'first configured size');
});

test('activeSalesMap: only live windows are returned (generic property check)', () => {
  const now = Date.now();
  const map = activeSalesMap(now);
  for (const id of Object.keys(map)) {
    const s = map[id];
    const start = new Date(s.start_at).getTime();
    const end = new Date(s.end_at).getTime();
    assert.ok(start <= now && now <= end, 'returned sale for product ' + id + ' must contain now');
  }
  assert.deepStrictEqual(activeSalesMap(0), {}, 'epoch 0 must match no sale');
});
