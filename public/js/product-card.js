/* ============================================================
   PRODUCT CARD — Unified card renderer (used by 6 pages)
   althome, fable, products, categories, offers, search-results
   ============================================================ */

/**
 * Build HTML for a single product card.
 * Expects product object with:
 *   id, name, price_cents, image, category (or category_name),
 *   rating, reviews, on_sale, compare_at_price_cents, featured, badge
 */
function productCardHTML(product) {
  const stars = '\u2605'.repeat(Math.round(product.rating || 0));
  let badge = '';
  if (product.badge === 'sale' || (product.on_sale && product.compare_at_price_cents)) {
    badge = '<span class="card-badge sale">Sale</span>';
  } else if (product.badge === 'new' || product.featured) {
    badge = '<span class="card-badge">New</span>';
  }

  const img = typeof getProductImage === 'function' ? getProductImage(product) : (window.DEFAULT_PRODUCT_IMAGE || product.image || '/assets/noImageForItem.png');
  const cat = product.category_name || product.category || 'uncategorized';
  const oldPrice = product.compare_at_price_cents || product.old_price_cents;
  const oldPriceHTML = oldPrice ? '<s>' + price(oldPrice) + '</s>' : '';
  const inCart = typeof isInCart === 'function' ? isInCart(product.id) : false;
  const btnClass = inCart ? 'card-added' : 'card-add';
  const btnText  = inCart ? 'In Cart' : 'Add';

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + product.id + '" class="card-media">' +
        badge +
        '<img src="' + img + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
      '</a>' +
      '<div class="card-body">' +
        '<div class="card-category">' + escapeHtml(cat) + '</div>' +
        '<h3><a href="product.html?id=' + product.id + '">' + escapeHtml(product.name) + '</a></h3>' +
        (product.rating ? '<div class="card-rating">' + stars + '<span>(' + (product.reviews || 0) + ')</span></div>' : '') +
        '<div class="card-price-row">' +
          '<div class="card-price">' + price(product.price_cents || 0) + oldPriceHTML + '</div>' +
          '<button class="' + btnClass + '" type="button" data-add="' + product.id + '">' + btnText + '</button>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

/** Render array of products into a container by ID */
function renderRow(containerId, products) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = products.map(productCardHTML).join('');
}

/* Expose globally */
window.productCardHTML = productCardHTML;
window.renderRow = renderRow;