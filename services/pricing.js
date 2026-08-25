// services/pricing.js — Single source of truth for live-sale pricing.
// Used by routes/products.js (storefront display) and routes/orders.js
// (order creation) so both sides always agree on what a product costs.

const db = require('../db');

// Build a map of product_id -> active sale row at the given epoch ms.
// `now` is REQUIRED so an entire order is priced against one consistent
// timestamp. Never call Date.now() inside this module.
function activeSalesMap(now) {
  const rows = db.prepare('SELECT product_id, original_price_cents, sale_price_cents, start_at, end_at FROM sales').all();
  const map = {};
  for (const s of rows) {
    const start = new Date(s.start_at).getTime();
    const end = new Date(s.end_at).getTime();
    if (!isNaN(start) && !isNaN(end) && now >= start && now <= end) {
      map[s.product_id] = s;
    }
  }
  return map;
}

// Overlay an active sale onto a product (display shape used by storefront pages):
// price_cents becomes the sale price, old/compare-at carry the original price.
function withSalePrice(product, saleMap) {
  const sale = saleMap && saleMap[product.id];
  if (!sale) return product;
  return Object.assign({}, product, {
    price_cents: sale.sale_price_cents,
    old_price_cents: sale.original_price_cents,
    compare_at_price_cents: sale.original_price_cents,
    on_sale: 1
  });
}

// Pure, DB-free order pricing. Resolves each cart item through dbGetProduct,
// applies the saleMap unit price, and throws the exact error messages the
// orders route already catches ('Product <id> not found or inactive',
// 'Insufficient stock for <name>'). The saleMap is trusted — it must only
// contain live sales (see activeSalesMap).
function buildOrderItems({ items, dbGetProduct, saleMap }) {
  let subtotal_cents = 0;
  const resolvedItems = [];
  for (const item of items) {
    const product = dbGetProduct(item.product_id);
    if (!product) throw new Error(`Product ${item.product_id} not found or inactive`);
    if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
    const sale = saleMap && saleMap[product.id];
    const unit = sale ? sale.sale_price_cents : product.price_cents;
    subtotal_cents += unit * item.quantity;
    resolvedItems.push({
      product_id: product.id,
      name: product.name,
      price_cents: unit,
      original_price_cents: sale ? sale.original_price_cents : null,
      quantity: item.quantity,
      color: typeof item.color === 'string' && item.color.trim() ? item.color.trim().slice(0, 100) : null,
      size: typeof item.size === 'string' && item.size.trim() ? item.size.trim().slice(0, 100) : null
    });
  }
  return { resolvedItems, subtotal_cents };
}

// Order totals math — identical to the previous inline logic in orders.js:
// promo discount off the (sale-priced) subtotal, shipping waived past the
// free-delivery threshold, total = subtotal - discount + shipping.
function computeTotals({ subtotal_cents, appliedPromo, deliveryFeeCents, freeDeliveryThresholdCents }) {
  const discount_cents = appliedPromo ? Math.round(subtotal_cents * appliedPromo.pct) : 0;
  const shipping_cents = subtotal_cents >= freeDeliveryThresholdCents ? 0 : deliveryFeeCents;
  const total_cents = subtotal_cents - discount_cents + shipping_cents;
  return { subtotal_cents, discount_cents, shipping_cents, total_cents };
}

module.exports = { activeSalesMap, withSalePrice, buildOrderItems, computeTotals };
