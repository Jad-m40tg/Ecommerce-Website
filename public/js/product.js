/* product.js — product.html specific logic */

var currentProduct = null;
var storeSettings = {};
var settingsPromise = fetch('/api/settings').then(function (r) { return r.json(); }).then(function (s) { storeSettings = s || {}; }).catch(function () {});

var lightboxEl = null;
var lightboxIndex = 0;
var lightboxImages = [];

var selection = { color: '', size: '', qty: 1 };

/* ---------- IMAGE HELPERS ---------- */
function fallbackImage(category) {
  if (typeof window.DEFAULT_PRODUCT_IMAGE === 'string') return window.DEFAULT_PRODUCT_IMAGE;
  return '/assets/noImageForItem.jpg';
}

function getProductImage(product) {
  var images = [];
  try { images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []); }
  catch (e) { images = []; }
  if (images.length > 0 && images[0]) {
    return images[0];
  }
  return fallbackImage(product.category);
}

/* ---------- CATEGORY LABELS ---------- */
var CATEGORY_LABELS = {};
function getCategoryLabel(slug) {
  if (CATEGORY_LABELS[slug]) return CATEGORY_LABELS[slug];
  return slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : '';
}

/* ---------- LOAD CATEGORIES FROM API ---------- */
fetch('/api/categories').then(function (r) { return r.json(); }).then(function (data) {
  var cats = data.categories || data;
  if (Array.isArray(cats)) {
    cats.forEach(function (c) { CATEGORY_LABELS[c.slug] = c.name; });
  }
}).catch(function () {});

/* ---------- LOAD PRODUCT FROM API ---------- */
var params = new URLSearchParams(window.location.search);
var requestedId = params.get('id');

function showNotFound() {
  document.getElementById('breadcrumb').innerHTML =
    '<a href="index.html">Home</a><span class="sep">/</span>' +
    '<a href="products.html">Shop</a><span class="sep">/</span>' +
    '<span class="current">Product not found</span>';
  document.getElementById('productRoot').innerHTML =
    '<div class="not-found">' +
      '<h2>We couldn&rsquo;t find that product</h2>' +
      '<p>It may have been renamed or moved. Browse the full collection to find something you&rsquo;ll love.</p>' +
      '<a href="products.html" class="btn btn-primary">Back to Shop</a>' +
    '</div>';
}

if (!requestedId) {
  showNotFound();
} else {
  document.getElementById('breadcrumb').innerHTML = '<span style="color:var(--gray)">Loading...</span>';
  document.getElementById('productRoot').innerHTML =
    '<div class="product-detail">' +
      '<div>' +
        '<div class="skeleton skel-img"></div>' +
        '<div class="skel-thumbs">' +
          '<div class="skeleton skel-thumb"></div>' +
          '<div class="skeleton skel-thumb"></div>' +
          '<div class="skeleton skel-thumb"></div>' +
          '<div class="skeleton skel-thumb"></div>' +
        '</div>' +
      '</div>' +
      '<div style="padding-top:4px;">' +
        '<div class="skeleton skel-line w40"></div>' +
        '<div class="skeleton skel-line h24 w80" style="margin-bottom:16px;"></div>' +
        '<div class="skeleton skel-line w60" style="margin-bottom:24px;"></div>' +
        '<div class="skeleton skel-line h32 w40" style="margin-bottom:24px;"></div>' +
        '<div class="skeleton skel-line w100" style="margin-bottom:12px;"></div>' +
        '<div class="skeleton skel-line w100" style="margin-bottom:12px;"></div>' +
        '<div class="skeleton skel-line w80" style="margin-bottom:24px;"></div>' +
        '<div style="margin-bottom:22px;">' +
          '<div class="skeleton skel-swatch"></div>' +
          '<div class="skeleton skel-swatch"></div>' +
          '<div class="skeleton skel-swatch"></div>' +
          '<div class="skeleton skel-swatch"></div>' +
        '</div>' +
        '<div style="margin-bottom:22px;">' +
          '<div class="skeleton skel-pill"></div>' +
          '<div class="skeleton skel-pill"></div>' +
          '<div class="skeleton skel-pill"></div>' +
        '</div>' +
        '<div class="skeleton skel-block"></div>' +
        '<div class="skeleton skel-line w100"></div>' +
        '<div class="skeleton skel-line w100"></div>' +
        '<div class="skeleton skel-line w60"></div>' +
      '</div>' +
    '</div>';
  fetch('/api/products/browse/' + encodeURIComponent(requestedId))
    .then(function (r) {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    })
    .then(function (apiProduct) {
      currentProduct = {
        id: apiProduct.id,
        name: apiProduct.name,
        description: apiProduct.description || '',
        category: apiProduct.category || '',
        price_cents: apiProduct.price_cents || 0,
        old_price_cents: apiProduct.old_price_cents || null,
        stock: apiProduct.stock || 0,
        colors: [],
        sizes: [],
        tags: [],
        images: [],
        image: getProductImage(apiProduct),
        featured: apiProduct.featured,
        on_sale: apiProduct.on_sale,
        free_delivery: apiProduct.free_delivery,
        warranty_months: apiProduct.warranty_months,
        brand: apiProduct.brand || '',
        sku: apiProduct.sku || '',
        specifications: [],
        shipping_info: '',
        returns_info: ''
      };
      try { currentProduct.colors = typeof apiProduct.colors === 'string' ? JSON.parse(apiProduct.colors) : (apiProduct.colors || []); } catch (e) { currentProduct.colors = []; }
      try { currentProduct.sizes = typeof apiProduct.sizes === 'string' ? JSON.parse(apiProduct.sizes) : (apiProduct.sizes || []); } catch (e) { currentProduct.sizes = []; }
      try { currentProduct.tags = typeof apiProduct.tags === 'string' ? JSON.parse(apiProduct.tags) : (apiProduct.tags || []); } catch (e) { currentProduct.tags = []; }
      try { currentProduct.images = typeof apiProduct.images === 'string' ? JSON.parse(apiProduct.images) : (apiProduct.images || []); } catch (e) { currentProduct.images = []; }
      try { currentProduct.specifications = typeof apiProduct.specifications === 'string' ? JSON.parse(apiProduct.specifications) : (apiProduct.specifications || []); } catch (e) { currentProduct.specifications = []; }
      currentProduct.shipping_info = apiProduct.shipping_info || '';
      currentProduct.returns_info = apiProduct.returns_info || '';

      document.getElementById('orderSection').style.display = 'block';
      var confirmBtn = document.getElementById('confirmOrderBtn');
      if (confirmBtn && !(currentProduct.stock > 0)) confirmBtn.disabled = true;
      fetchReviewsAndRender(currentProduct);
    })
    .catch(function (err) {
      console.error('Failed to load product:', err);
      showNotFound();
    });
}

/* ---------- REVIEWS ---------- */
var currentReviews = [];

function fetchReviewsAndRender(product) {
  fetch('/api/reviews?product_id=' + product.id)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      currentReviews = data.reviews || [];
    })
    .catch(function (err) {
      console.error('Failed to load reviews:', err);
      currentReviews = [];
    })
    .then(function () {
      return settingsPromise;
    })
    .then(function () {
      renderProduct(product);
      renderRelated(product);
      var list = document.getElementById('reviewsList');
      if (list) list.innerHTML = renderReviews(product ? product.id : 0);
      wireUpReviewDeleteButtons();
      wireUpViewAllButton();
      observeReveals();
      positionReviews();
      renderCartState();
      if (typeof updateWishCount === 'function') updateWishCount();
      applyReviewedState(product ? product.id : 0);
    });
}

function renderReviews(productId) {
  if (currentReviews.length === 0) {
    return '<div class="reviews-empty">No reviews yet. Be the first to share your thoughts!</div>';
  }
  var cards = currentReviews.map(function (review) {
    var stars = '';
    for (var i = 0; i < 5; i++) {
      stars += i < review.rating ? '&#9733;' : '&#9734;';
    }
    var date = review.created_at ? new Date(review.created_at.replace(' ', 'T') + 'Z').toLocaleDateString() : '';
    var deleteBtn = localStorage.getItem('admin_token')
      ? '<button type="button" class="review-delete-btn" data-review-id="' + review.id + '" aria-label="Delete review" title="Delete review">&#10005;</button>'
      : '';
    return '<div class="review-card">' +
      '<div class="review-head">' +
        '<div><span class="review-name">' + escapeHtml(review.customer_name) + '</span> <span class="review-stars">' + stars + '</span></div>' +
        '<div><span class="review-date">' + date + '</span> ' + deleteBtn + '</div>' +
      '</div>' +
      '<p class="review-text">' + escapeHtml(review.comment) + '</p>' +
    '</div>';
  }).join('');
  var wrap = '<div class="reviews-scroll-wrap">';
  wrap += '<div class="reviews-scroll-inner">' + cards + '</div>';
  if (currentReviews.length > 3) {
    wrap += '<div class="reviews-scroll-fade"></div>';
  }
  wrap += '</div>';
  return wrap;
}

function wireUpReviewDeleteButtons() {
  document.querySelectorAll('[data-review-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var reviewId = btn.getAttribute('data-review-id');
      if (!confirm('Delete this review?')) return;
      var headers = {};
      var adminToken = localStorage.getItem('admin_token');
      if (adminToken) headers['Authorization'] = 'Bearer ' + adminToken;
      fetch('/api/reviews/' + reviewId, { method: 'DELETE', headers: headers })
        .then(function (r) { return r.json(); })
        .then(function () {
          currentReviews = currentReviews.filter(function (r) { return String(r.id) !== String(reviewId); });
          var list = document.getElementById('reviewsList');
          if (list) list.innerHTML = renderReviews(currentProduct ? currentProduct.id : 0);
          showToast('Review deleted');
        })
        .catch(function () { showToast('Could not delete review'); });
    });
  });
}

function wireUpViewAllButton() {
  var viewAll = document.getElementById('viewAllReviewsBtn');
  if (viewAll) {
    viewAll.addEventListener('click', function () {
      var list = document.getElementById('reviewsList');
      if (list) list.innerHTML = renderReviews(currentProduct ? currentProduct.id : 0);
    });
  }
}

/* Hide the review form once a customer has reviewed (once per product, per browser) */
function markReviewFormDone(productId, message) {
  var formCard = document.querySelector('.review-form-card');
  if (!formCard) return;
  formCard.style.display = 'none';
  if (formCard.parentNode.querySelector('.review-form-done')) return;
  var notice = document.createElement('div');
  notice.className = 'reviews-empty review-form-done';
  notice.textContent = message;
  formCard.parentNode.insertBefore(notice, formCard);
}

function applyReviewedState(productId) {
  if (localStorage.getItem('boularas_reviewed_' + productId)) {
    markReviewFormDone(productId, 'You have already reviewed this product.');
  }
}

/* ---------- RENDER PRODUCT ---------- */
function renderProduct(p) {
  document.title = p.name + ' | Boularas Modern Furniture & Home';
  var md = document.querySelector('meta[name="description"]');
  if (md && p.description) md.setAttribute('content', p.description.slice(0, 150));
  var description = p.description || 'A thoughtfully designed piece from the Boularas collection.';
  var colors = p.colors && p.colors.length > 0 ? p.colors : [];
  var sizes = p.sizes && p.sizes.length > 0 ? p.sizes : [];

  var priceDollars = Math.round(p.price_cents / 100);
  var oldPriceDollars = p.old_price_cents ? Math.round(p.old_price_cents / 100) : null;

  var reviewCount = currentReviews.length;
  var avgRating = 0;
  if (reviewCount > 0) {
    var sum = currentReviews.reduce(function (s, r) { return s + r.rating; }, 0);
    avgRating = Math.round((sum / reviewCount) * 10) / 10;
  }
  var stars = '\u2605'.repeat(Math.round(avgRating)) + '\u2606'.repeat(5 - Math.round(avgRating));

  var catLabel = getCategoryLabel(p.category);
  document.getElementById('breadcrumb').innerHTML =
    '<a href="index.html">Home</a><span class="sep">/</span>' +
    '<a href="products.html">Shop</a><span class="sep">/</span>' +
    '<a href="products.html?category=' + encodeURIComponent(p.category) + '">' + escapeHtml(catLabel) + '</a>' +
    '<span class="sep">/</span>' +
    '<span class="current">' + escapeHtml(p.name) + '</span>';

  var badgeHTML = '';
  if (p.on_sale) badgeHTML = '<span class="gallery-badge sale">Sale</span>';
  else if (p.featured) badgeHTML = '<span class="gallery-badge">New</span>';

  var oldPriceHTML = oldPriceDollars ? '<s>' + price(oldPriceDollars * 100) + '</s>' : '';
  var saveHTML = oldPriceDollars ? '<span class="save">Save ' + price((oldPriceDollars - priceDollars) * 100) + '</span>' : '';

  var galleryImages = (p.images && p.images.length > 0) ? p.images.filter(function (img) { return !!img; }) : [];
  lightboxImages = galleryImages.length > 0 ? galleryImages : [p.image];
  var thumbs;
  if (galleryImages.length > 0) {
    thumbs = galleryImages.map(function (img, i) {
      return '<button type="button" class="' + (i === 0 ? 'active' : '') + '" data-thumb="' + i + '" aria-label="View image ' + (i + 1) + '"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + img + '" alt="" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" /></button>';
    }).join('');
  } else {
    thumbs = '<button type="button" class="active" data-thumb="0" aria-label="View image 1"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + p.image + '" alt="" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" /></button>';
  }

  var swatches;
  if (typeof colors[0] === 'object') {
    swatches = colors.map(function (c, i) {
      var hex = c.hex || '#e8e0d3';
      var name = c.name || c;
      return '<button type="button" class="swatch ' + (i === 0 ? 'active' : '') + '" style="background:' + hex + '" data-color="' + escapeHtml(name) + '" aria-label="Color: ' + escapeHtml(name) + '"></button>';
    }).join('');
  } else {
    swatches = colors.map(function (name, i) {
      return '<button type="button" class="swatch ' + (i === 0 ? 'active' : '') + '" style="background:' + colorHex(name) + '" data-color="' + escapeHtml(name) + '" aria-label="Color: ' + escapeHtml(name) + '"></button>';
    }).join('');
  }

  var sizePills = sizes.map(function (s, i) {
    var label = typeof s === 'object' ? s.name : s;
    return '<button type="button" class="size-pill ' + (i === 0 ? 'active' : '') + '" data-size="' + escapeHtml(label) + '">' + escapeHtml(label) + '</button>';
  }).join('');

  var defaults = resolveVariantDefaults(p);
  selection.color = defaults.color;
  selection.size = defaults.size;
  var cartQty = 0;
  var cartItems = (typeof getCart === 'function') ? getCart() : [];
  var cartKey = buildCartKey(p.id, selection.color, selection.size);
  for (var ci = 0; ci < cartItems.length; ci++) {
    if (cartItems[ci] && cartItems[ci].key === cartKey) { cartQty = Number(cartItems[ci].qty) || 0; break; }
  }
  var initialQty = Math.max(1, Math.min(cartQty || 1, p.stock > 0 ? p.stock : 99, 99));
  selection.qty = initialQty;
  var outOfStock = !(p.stock > 0);

  var stockHTML = p.stock > 0
    ? '<div class="stock-note">In stock (' + p.stock + ' left) &middot; ships in 2&ndash;4 days</div>'
    : '<div class="stock-note" style="color:var(--wood)">Out of stock</div>';

  var specsRows = '';
  if (p.specifications && p.specifications.length > 0) {
    specsRows = p.specifications.map(function (s) {
      return '<tr><th>' + escapeHtml(s.label) + '</th><td>' + escapeHtml(s.value) + '</td></tr>';
    }).join('');
  }

  var shippingText = (p.shipping_info && p.shipping_info.trim()) ? p.shipping_info
    : (storeSettings.shipping_policy && storeSettings.shipping_policy.trim()) ? storeSettings.shipping_policy
    : 'Free delivery on orders over 66,700 DA. Standard delivery takes 2-4 business days; larger pieces are scheduled with a two-hour window.';
  var returnsText = (p.returns_info && p.returns_info.trim()) ? p.returns_info
    : (storeSettings.returns_policy && storeSettings.returns_policy.trim()) ? storeSettings.returns_policy
    : 'Not the right fit? Send it back within 30 days for a full refund - we will even collect it from your door.';

  var perksFreeDelivery = p.free_delivery ? true : !!(storeSettings.perks_free_delivery);
  var perksWarrantyMonths = (p.warranty_months && p.warranty_months > 0) ? p.warranty_months : ((storeSettings.perks_warranty_months && storeSettings.perks_warranty_months > 0) ? storeSettings.perks_warranty_months : 12);
  var perksReturnsDays = (storeSettings.perks_returns_days && storeSettings.perks_returns_days > 0) ? storeSettings.perks_returns_days : 30;

  document.getElementById('productRoot').innerHTML =
    '<div class="product-detail">' +

      /* LEFT COLUMN — gallery images */
      '<div class="reveal">' +
        '<div class="gallery-main">' +
          badgeHTML +
          '<img id="galleryMainImg" src="' + p.image + '" alt="' + escapeHtml(p.name) + '" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" />' +
        '</div>' +
        '<div class="gallery-thumbs">' + thumbs + '</div>' +
      '</div>' +

      /* RIGHT COLUMN — name, price, options, tabs */
      '<div class="product-info reveal">' +
        '<div class="info-category">' + escapeHtml(catLabel) + '</div>' +
        '<h1>' + escapeHtml(p.name) + '</h1>' +
        '<div class="info-rating">' +
          '<span class="stars">' + stars + '</span>' +
          '<small>' + avgRating + ' &middot; ' + reviewCount + ' review' + (reviewCount !== 1 ? 's' : '') + '</small>' +
        '</div>' +
        '<div class="info-price">' +
          '<span class="price">' + price(p.price_cents) + '</span>' +
          oldPriceHTML + saveHTML +
        '</div>' +
        stockHTML +
        '<p class="info-desc">' + escapeHtml(description) + '</p>' +

        '<div class="option-block">' +
          '<label>Color <span>: <b id="selectedColor">' + escapeHtml(selection.color) + '</b></span></label>' +
          '<div class="swatches" id="swatchList">' + swatches + '</div>' +
        '</div>' +
        '<div class="option-block">' +
          '<label>Size <span>: <b id="selectedSize">' + escapeHtml(selection.size) + '</b></span></label>' +
          '<div class="size-list" id="sizeList">' + sizePills + '</div>' +
        '</div>' +
        '<div class="option-block">' +
          '<label>Quantity</label>' +
          '<div class="buy-row">' +
            '<div class="qty">' +
              '<button type="button" data-qty="-1" aria-label="Decrease quantity"' + (outOfStock ? ' disabled' : '') + '>&minus;</button>' +
              '<input type="number" id="qtyInput" value="' + initialQty + '" min="1" max="99" aria-label="Quantity"' + (outOfStock ? ' disabled' : '') + ' />' +
              '<button type="button" data-qty="1" aria-label="Increase quantity"' + (outOfStock ? ' disabled' : '') + '>+</button>' +
            '</div>' +
            '<button type="button" class="btn btn-primary" id="addToCartBtn"' + (outOfStock ? ' disabled style="opacity:0.5;pointer-events:none;"' : '') + '>Add to Cart</button>' +
            '<button type="button" class="btn-icon" id="wishlistBtn" aria-label="Add to wishlist" title="Add to wishlist"><span class="material-symbols-outlined">favorite_border</span></button>' +
          '</div>' +
          '<div class="stock-note qty-stock-note" id="qtyStockNote" style="display:none"></div>' +
        '</div>' +

        '<div class="perks">' +
          '<div><b>Free Delivery</b>' + (perksFreeDelivery ? 'On every order' : 'On orders over 66,700 DA') + '</div>' +
          '<div><b>' + perksWarrantyMonths + '-Month Warranty</b>On every frame</div>' +
          '<div><b>' + perksReturnsDays + '-Day Returns</b>Hassle-free</div>' +
        '</div>' +

        '<div class="tabs">' +
          '<div class="tab-nav" role="tablist">' +
            '<button type="button" class="active" data-tab="desc" role="tab">Description</button>' +
            '<button type="button" data-tab="specs" role="tab">Specifications</button>' +
            '<button type="button" data-tab="ship" role="tab">Shipping &amp; Returns</button>' +
          '</div>' +
          '<div class="tab-panels">' +
            '<div class="tab-panel active" data-panel="desc">' +
              '<h3>About this piece</h3>' +
              '<p>' + escapeHtml(description) + '</p>' +
            '</div>' +
            '<div class="tab-panel" data-panel="specs">' +
              '<h3>The details</h3>' +
              '<table class="specs-table"><tbody>' +
                '<tr><th>Brand</th><td>' + escapeHtml(p.brand || 'Boularas') + '</td></tr>' +
                '<tr><th>Category</th><td>' + escapeHtml(catLabel) + '</td></tr>' +
                (p.sku ? '<tr><th>SKU</th><td>' + escapeHtml(p.sku) + '</td></tr>' : '') +
                specsRows +
              '</tbody></table>' +
            '</div>' +
            '<div class="tab-panel" data-panel="ship">' +
              '<h3>Delivery &amp; returns</h3>' +
              '<p><b>Shipping</b> ' + escapeHtml(shippingText) + '</p>' +
              '<p><b>Returns</b> ' + escapeHtml(returnsText) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>';

  wireUpDetail(p, colors);
  updateOrderSummary(p);
  updateQtyStockNote(p);
  if (typeof initLazyImages === 'function') initLazyImages();
}

/* ---------- STOCK WARNING NEAR QUANTITY CONTROLS ---------- */
function updateQtyStockNote(p) {
  var note = document.getElementById('qtyStockNote');
  if (!note) return;
  var stock = p.stock || 0;
  if (stock <= 0) {
    note.textContent = 'This item is out of stock';
    note.style.display = '';
    return;
  }
  var maxQty = Math.min(stock || 99, 99);
  if (stock > 0 && stock <= 99 && selection.qty >= maxQty) {
    note.textContent = 'Only ' + maxQty + ' in stock';
    note.style.display = '';
  } else {
    note.style.display = 'none';
  }
}

/* ---------- REPOSITION REVIEWS BY SCREEN WIDTH ---------- */
function positionReviews() {
  var isDesktop = window.matchMedia('(min-width: 961px)').matches;
  var reviewsSection = document.getElementById('reviewsSection');
  var leftColumn = document.querySelector('.product-detail > .reveal');
  var orderSection = document.getElementById('orderSection');
  if (!reviewsSection) return;
  if (isDesktop && leftColumn) {
    leftColumn.appendChild(reviewsSection);
    reviewsSection.style.marginTop = '40px';
  } else if (!isDesktop && orderSection && orderSection.parentNode) {
    orderSection.parentNode.insertBefore(reviewsSection, orderSection.nextSibling);
    reviewsSection.style.marginTop = '';
  }
}

/* ---------- LIGHTBOX ---------- */
function ensureLightbox() {
  if (lightboxEl) return lightboxEl;
  lightboxEl = document.createElement('div');
  lightboxEl.className = 'lightbox';
  lightboxEl.setAttribute('role', 'dialog');
  lightboxEl.setAttribute('aria-modal', 'true');
  lightboxEl.innerHTML =
    '<button type="button" class="lightbox-btn lightbox-close" aria-label="Close">&#10005;</button>' +
    '<button type="button" class="lightbox-btn lightbox-prev" aria-label="Previous image">&#8249;</button>' +
    '<button type="button" class="lightbox-btn lightbox-next" aria-label="Next image">&#8250;</button>' +
    '<img id="lightboxImg" alt="" />';
  document.body.appendChild(lightboxEl);
  lightboxEl.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightboxEl.querySelector('.lightbox-prev').addEventListener('click', function () { lightboxStep(-1); });
  lightboxEl.querySelector('.lightbox-next').addEventListener('click', function () { lightboxStep(1); });
  lightboxEl.addEventListener('click', function (event) { if (event.target === lightboxEl) closeLightbox(); });
  return lightboxEl;
}

function updateLightbox() {
  if (!lightboxEl) return;
  var src = lightboxImages[lightboxIndex] || '';
  var main = document.getElementById('galleryMainImg');
  var img = document.getElementById('lightboxImg');
  img.src = src;
  img.setAttribute('data-category', main ? (main.getAttribute('data-category') || '') : '');
  img.setAttribute('onerror', 'handleImageError(this)');
  img.removeAttribute('data-fallback');
  lightboxEl.classList.toggle('single', lightboxImages.length <= 1);
}

function openLightbox(src) {
  var idx = lightboxImages.indexOf(src);
  lightboxIndex = idx >= 0 ? idx : 0;
  ensureLightbox();
  updateLightbox();
  lightboxEl.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!lightboxEl) return;
  lightboxEl.classList.remove('open');
  document.body.style.overflow = '';
}

function lightboxStep(dir) {
  if (lightboxImages.length <= 1) return;
  lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
  updateLightbox();
}

document.addEventListener('keydown', function (event) {
  if (!lightboxEl || !lightboxEl.classList.contains('open')) return;
  if (event.key === 'Escape') closeLightbox();
  else if (event.key === 'ArrowLeft') lightboxStep(-1);
  else if (event.key === 'ArrowRight') lightboxStep(1);
});

/* ---------- WIRE UP INTERACTIONS ---------- */
function wireUpDetail(p, colors) {
  document.querySelectorAll('[data-thumb]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var thumbImg = btn.querySelector('img');
      var src = thumbImg ? (thumbImg.getAttribute('data-src') || thumbImg.getAttribute('src')) : '';
      if (src) openLightbox(src);
    });
  });

  var galleryMain = document.getElementById('galleryMainImg');
  if (galleryMain) {
    galleryMain.addEventListener('click', function () {
      openLightbox(this.getAttribute('src'));
    });
  }

  document.getElementById('swatchList').addEventListener('click', function (event) {
    var swatch = event.target.closest('[data-color]');
    if (!swatch) return;
    document.querySelectorAll('#swatchList .swatch').forEach(function (s) { s.classList.remove('active'); });
    swatch.classList.add('active');
    selection.color = swatch.getAttribute('data-color');
    document.getElementById('selectedColor').textContent = selection.color;
    updateOrderSummary(p);
    renderCartState();
  });

  var sizeList = document.getElementById('sizeList');
  if (sizeList) {
    sizeList.addEventListener('click', function (event) {
      var pill = event.target.closest('[data-size]');
      if (!pill) return;
      document.querySelectorAll('#sizeList .size-pill').forEach(function (s) { s.classList.remove('active'); });
      pill.classList.add('active');
      selection.size = pill.getAttribute('data-size');
      document.getElementById('selectedSize').textContent = selection.size;
      updateOrderSummary(p);
      renderCartState();
    });
  }

  var qtyInput = document.getElementById('qtyInput');
  document.querySelectorAll('[data-qty]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (p.stock <= 0) return;
      var step = Number(btn.getAttribute('data-qty'));
      var next = Math.max(1, Math.min(p.stock || 99, 99, Number(qtyInput.value) + step));
      qtyInput.value = next;
      selection.qty = next;
      updateOrderSummary(p);
      updateQtyStockNote(p);
      var plusBtn = document.querySelector('[data-qty="1"]');
      if (plusBtn) plusBtn.disabled = Number(qtyInput.value) >= (p.stock || 99);
      var minusBtn = document.querySelector('[data-qty="-1"]');
      if (minusBtn) minusBtn.disabled = Number(qtyInput.value) <= 1;
    });
  });
  if (qtyInput) {
    qtyInput.addEventListener('change', function () {
      if (p.stock <= 0) return;
      selection.qty = Math.max(1, Math.min(p.stock || 99, 99, Number(qtyInput.value) || 1));
      qtyInput.value = selection.qty;
      updateOrderSummary(p);
      updateQtyStockNote(p);
      var plusBtn = document.querySelector('[data-qty="1"]');
      if (plusBtn) plusBtn.disabled = Number(qtyInput.value) >= (p.stock || 99);
      var minusBtn = document.querySelector('[data-qty="-1"]');
      if (minusBtn) minusBtn.disabled = Number(qtyInput.value) <= 1;
    });
  }

  // Initial button state
  var plusBtn = document.querySelector('[data-qty="1"]');
  var minusBtn = document.querySelector('[data-qty="-1"]');
  if (p.stock <= 0) {
    if (plusBtn) plusBtn.disabled = true;
    if (minusBtn) minusBtn.disabled = true;
  } else if (plusBtn && p.stock <= 1) {
    plusBtn.disabled = true;
  }

  document.getElementById('addToCartBtn').addEventListener('click', function () {
    if (p.stock <= 0) { showToast('This item is out of stock'); return; }
    if (isInCart(p.id, selection.color, selection.size)) {
      updateQty(buildCartKey(p.id, selection.color, selection.size), selection.qty);
      window.location.href = 'cart.html';
      return;
    }
    addToCart(p, { qty: selection.qty, color: selection.color, size: selection.size });
    showToast(p.name + ' added to cart');
    renderCartState();
  });

  var wishBtn = document.getElementById('wishlistBtn');
  var wished = false;
  if (wishBtn) {
    var wishList = JSON.parse(localStorage.getItem('boularas_wishlist') || '[]');
    wished = wishList.some(function (w) { return String(w.id) === String(p.id); });
    if (wished) {
      wishBtn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings:\'FILL\' 1,\'wght\' 400,\'GRAD\' 0,\'opsz\' 24">favorite</span>';
      wishBtn.style.background = 'var(--charcoal)';
      wishBtn.style.color = 'var(--warm-white)';
      wishBtn.style.borderColor = 'var(--charcoal)';
    }
    wishBtn.addEventListener('click', function () {
      wished = !wished;
      wishBtn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings:\'' + (wished ? 'FILL\' 1' : 'FILL\' 0') + ',\'wght\' 400,\'GRAD\' 0,\'opsz\' 24">' + (wished ? 'favorite' : 'favorite_border') + '</span>';
      wishBtn.style.background = wished ? 'var(--charcoal)' : '';
      wishBtn.style.color = wished ? 'var(--warm-white)' : '';
      wishBtn.style.borderColor = wished ? 'var(--charcoal)' : '';
      if (wished) {
        wishList.push({ id: p.id, name: p.name, price_cents: p.price_cents, image: p.image || (p.images && p.images[0]) || '' });
      } else {
        wishList = wishList.filter(function (w) { return String(w.id) !== String(p.id); });
      }
      localStorage.setItem('boularas_wishlist', JSON.stringify(wishList));
      showToast(wished ? 'Added to wishlist' : 'Removed from wishlist');
      if (typeof updateWishCount === 'function') updateWishCount();
    });
  }

  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var name = btn.getAttribute('data-tab');
      document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('[data-panel]').forEach(function (panel) {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === name);
      });
      btn.classList.add('active');
    });
  });

  /* Star picker for reviews */
  var starBtns = document.querySelectorAll('#starPicker button');
  var currentRating = 0;
  starBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentRating = Number(btn.getAttribute('data-star'));
      starBtns.forEach(function (b, i) {
        b.classList.toggle('filled', i < currentRating);
      });
    });
    btn.addEventListener('mouseenter', function () {
      var hover = Number(btn.getAttribute('data-star'));
      starBtns.forEach(function (b, i) {
        b.style.color = i < hover ? 'var(--wood)' : '';
      });
    });
    btn.addEventListener('mouseleave', function () {
      starBtns.forEach(function (b, i) {
        b.style.color = i < currentRating ? 'var(--wood)' : 'var(--beige)';
      });
    });
  });

  document.getElementById('submitReviewBtn').addEventListener('click', function () {
    var submitBtn = document.getElementById('submitReviewBtn');
    var name = document.getElementById('reviewName').value.trim();
    var text = document.getElementById('reviewText').value.trim();
    var emailInput = document.getElementById('reviewEmail');
    var emailValue = '';
    if (emailInput) emailValue = emailInput.value.trim();
    if (!currentRating) { showToast('Please select a rating'); return; }
    if (!name) { showToast('Please enter your name'); return; }
    if (emailInput && !emailValue) { showToast('Please enter your email'); return; }
    if (!text) { showToast('Please write a review'); return; }
    if (submitBtn) submitBtn.disabled = true;
    var payload = { product_id: p.id, customer_name: name, rating: currentRating, comment: text };
    if (emailInput) payload.customer_email = emailValue;
    fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (newReview) {
        if (newReview.error) {
          if (submitBtn) submitBtn.disabled = false;
          showToast(newReview.error);
          return;
        }
        localStorage.setItem('boularas_reviewed_' + p.id, '1');
        currentReviews.unshift(newReview);
        var list = document.getElementById('reviewsList');
        if (list) list.innerHTML = renderReviews(p.id);
        document.getElementById('reviewName').value = '';
        document.getElementById('reviewText').value = '';
        if (emailInput) emailInput.value = '';
        currentRating = 0;
        starBtns.forEach(function (b) { b.classList.remove('filled'); b.style.color = 'var(--beige)'; });
        showToast('Review submitted!');
        wireUpReviewDeleteButtons();
        markReviewFormDone(p.id, 'Thank you for your review!');
      })
      .catch(function () {
        if (submitBtn) submitBtn.disabled = false;
        showToast('Could not submit review');
      });
  });
}

/* ---------- ORDER FORM ---------- */
function updateOrderSummary(p) {
  var sumName = document.getElementById('sumName');
  var sumColor = document.getElementById('sumColor');
  var sumSize = document.getElementById('sumSize');
  var sumQty = document.getElementById('sumQty');
  var sumTotal = document.getElementById('sumTotal');
  if (sumName) sumName.textContent = p.name;
  if (sumColor) sumColor.textContent = selection.color;
  if (sumSize) sumSize.textContent = selection.size;
  if (sumQty) sumQty.textContent = selection.qty;
  if (sumTotal) sumTotal.textContent = price(p.price_cents * selection.qty);
}

var formRules = {
  fName:    function (v) { v = v.trim(); if (!v) return 'Full name is required.'; return v.length < 3 ? 'Name must be at least 3 characters.' : ''; },
  fPhone:   function (v) { var d = v.replace(/[^0-9]/g, ''); if (!d) return 'Phone number is required.'; return d.length < 7 ? 'Please enter a valid phone number.' : ''; },
  fEmail:   function (v) { v = v.trim(); if (!v) return 'Email is required.'; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Please enter a valid email.'; },
  fAddress: function (v) { v = v.trim(); if (!v) return 'Delivery address is required.'; return v.length < 5 ? 'Please enter your delivery address.' : ''; },
  fCity:    function (v) { v = v.trim(); if (!v) return 'City is required.'; return v.length < 2 ? 'Please enter your city.' : ''; }
};

function setFieldError(name, message) {
  var input = document.getElementById(name);
  var msg = document.querySelector('[data-msg-for="' + name + '"]');
  if (message) {
    if (input) { input.classList.add('error', 'invalid'); input.classList.remove('valid'); }
    if (msg) msg.textContent = message;
  } else {
    if (input) { input.classList.remove('error', 'invalid'); input.classList.add('valid'); }
    if (msg) msg.textContent = '';
  }
}

Object.keys(formRules).forEach(function (name) {
  var input = document.getElementById(name);
  if (!input) return;
  input.addEventListener('blur', function () { setFieldError(name, formRules[name](input.value)); });
  input.addEventListener('input', function () { setFieldError(name, formRules[name](input.value)); });
});

var modal = document.getElementById('orderModal');

function openModal() {
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(function () { document.getElementById('modalCloseBtn').focus(); }, 200);
}
function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('orderForm').addEventListener('submit', function (event) {
  event.preventDefault();
  var firstInvalid = null;
  Object.keys(formRules).forEach(function (name) {
    var input = document.getElementById(name);
    if (!input) return;
    var error = formRules[name](input.value);
    setFieldError(name, error);
    if (error && !firstInvalid) firstInvalid = input;
  });
  if (firstInvalid) { firstInvalid.focus(); showToast('Please fix the highlighted fields'); return; }

  if (!currentProduct) { showToast('Product not loaded yet'); return; }

  if (currentProduct.stock <= 0) { showToast('This item is out of stock'); return; }

  addToCart(currentProduct, { qty: selection.qty, color: selection.color, size: selection.size });
  showToast('Added to cart! Redirecting to checkout...');
  setTimeout(function () { window.location.href = 'checkout.html'; }, 800);
});

document.getElementById('modalCloseBtn').addEventListener('click', function () {
  closeModal();
  document.getElementById('orderForm').reset();
  if (document.getElementById('qtyInput')) document.getElementById('qtyInput').value = 1;
});
modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

/* ---------- RELATED PRODUCTS ---------- */
function relatedProductCard(p) {
  var img = getProductImage(p);
  var badge = '';
  if (p.on_sale) badge = '<span class="card-badge sale">Sale</span>';
  else if (p.featured) badge = '<span class="card-badge">New</span>';
  if (!(p.stock > 0)) {
    var outBadge = '<span class="card-badge" style="background:#9aa0a6;">Out of stock</span>';
    badge = badge ? badge + ' ' + outBadge : outBadge;
  }
  var oldPriceHTML = p.old_price_cents ? '<s>' + price(p.old_price_cents) + '</s>' : '';
  var defaults = resolveVariantDefaults(p);
  var inCart = isInCart(p.id, defaults.color, defaults.size);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? 'In Cart' : 'Add';
  var btnDisabled = !(p.stock > 0) ? ' disabled style="opacity:0.5;pointer-events:none;"' : '';
  return '<article class="product-card">' +
    '<a href="product.html?id=' + p.id + '" class="card-media">' + badge +
    '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + img + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" /></a>' +
    '<div class="card-body">' +
      '<div class="card-category">' + escapeHtml(getCategoryLabel(p.category)) + '</div>' +
      '<h3><a href="product.html?id=' + p.id + '">' + escapeHtml(p.name) + '</a></h3>' +
      '<div class="card-price-row">' +
        '<div class="card-price">' + price(p.price_cents) + oldPriceHTML + '</div>' +
        '<button class="' + btnClass + '" type="button" data-add="' + p.id + '"' + btnDisabled + '>' + btnText + '</button>' +
      '</div>' +
    '</div>' +
  '</article>';
}

var relatedItems = [];

function renderRelated(cur) {
  var fetchUrl = '/api/products/browse?limit=8';
  if (cur.category) fetchUrl += '&category=' + encodeURIComponent(cur.category);
  fetch(fetchUrl)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var items = data.products || [];
      var related = items.filter(function (p) { return p.id !== cur.id; }).slice(0, 6);
      if (related.length === 0) return;
      relatedItems = related;
      document.getElementById('relatedSection').style.display = 'block';
      document.getElementById('relatedRow').innerHTML = related.map(relatedProductCard).join('');
      if (typeof initLazyImages === 'function') initLazyImages();
    })
    .catch(function () {});
}

document.addEventListener('click', function (event) {
  var addButton = event.target.closest('[data-add]');
  if (!addButton) return;
  if (addButton.classList.contains('card-added')) { window.location.href = 'cart.html'; return; }
  var productId = parseInt(addButton.getAttribute('data-add'), 10);
  fetch('/api/products/browse/' + productId)
    .then(function (r) { return r.json(); })
    .then(function (prod) {
      addToCart(prod, { qty: 1 });
      addButton.textContent = 'In Cart';
      addButton.className = 'card-added';
      showToast(prod.name + ' added to cart');
    })
    .catch(function () {});
});

document.querySelectorAll('[data-scroll]').forEach(function (button) {
  button.addEventListener('click', function () {
    var row = document.getElementById(button.getAttribute('data-target'));
    if (!row) return;
    var dir = button.getAttribute('data-scroll') === 'left' ? -1 : 1;
    row.scrollBy({ left: dir * (row.clientWidth * 0.8), behavior: 'smooth' });
  });
});

/* ---------- UI HELPERS ---------- */
document.getElementById('menuToggle').addEventListener('click', function () {
  var navLinks = document.getElementById('navLinks');
  navLinks.classList.toggle('open');
  var btn = document.getElementById('menuToggle');
  if (btn) btn.setAttribute('aria-expanded', navLinks.classList.contains('open') ? 'true' : 'false');
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    var nl = document.getElementById('navLinks');
    if (nl && nl.classList.contains('open')) {
      nl.classList.remove('open');
      var b = document.getElementById('menuToggle');
      if (b) b.setAttribute('aria-expanded', 'false');
    }
  }
});

var revealObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); revealObserver.unobserve(entry.target); }
  });
}, { threshold: 0.15 });
function observeReveals() {
  document.querySelectorAll('.reveal:not(.visible)').forEach(function (el) { revealObserver.observe(el); });
}
observeReveals();

var toastTimer = null;
function showToast(message) {
  var toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
}

function renderCartState() {
  if (!currentProduct) return;
  var inCart = isInCart(currentProduct.id, selection.color, selection.size);
  var btn = document.getElementById('addToCartBtn');
  if (btn) btn.textContent = inCart ? 'In Cart' : 'Add to Cart';
  var relatedSection = document.getElementById('relatedSection');
  if (relatedSection && relatedSection.style.display !== 'none' && relatedItems.length > 0) {
    var row = document.getElementById('relatedRow');
    if (row) row.innerHTML = relatedItems.map(relatedProductCard).join('');
    if (typeof initLazyImages === 'function') initLazyImages();
  }
}

window.addEventListener('cart:updated', renderCartState);
window.addEventListener('pageshow', function (e) {
  if (e.persisted) { updateCartCount(); renderCartState(); }
});
window.addEventListener('storage', function (e) {
  if (e.key === window.CART_KEY) { updateCartCount(); renderCartState(); }
});

updateCartCount();

/* Reposition reviews on resize */
window.matchMedia('(min-width: 961px)').addEventListener('change', function () {
  positionReviews();
});