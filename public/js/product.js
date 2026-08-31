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
    cats.filter(function(c){ return (c.status||'active')==='active'; }).forEach(function (c) { CATEGORY_LABELS[c.slug] = c.name; });
  }
}).catch(function () {});

/* ---------- LOAD PRODUCT FROM API ---------- */
var params = new URLSearchParams(window.location.search);
var requestedId = params.get('id');

function showNotFound() {
  document.getElementById('breadcrumb').innerHTML =
    '<a href="index.html">Home</a><span class="sep">/</span>' +
    '<a href="products.html">Shop</a><span class="sep">/</span>' +
    '<span class="current">' + window.i18n('customer:product_detail.product_not_found') + '</span>';
  document.getElementById('productRoot').innerHTML =
    '<div class="not-found">' +
      '<h2>' + window.i18n('customer:product_detail.not_found_title') + '</h2>' +
      '<p>' + window.i18n('customer:product_detail.not_found_sub') + '</p>' +
      '<a href="products.html" class="btn btn-primary">' + window.i18n('customer:product_detail.back_to_shop') + '</a>' +
    '</div>';
}

function bootProduct() {
if (!requestedId) {
  showNotFound();
} else {
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
      if (confirmBtn) {
        var out = !(currentProduct.stock > 0);
        confirmBtn.disabled = out;
        confirmBtn.textContent = out ? window.i18n('customer:product_detail.out_of_stock') : window.i18n('customer:product_detail.confirm_order');
        confirmBtn.setAttribute('aria-disabled', out ? 'true' : 'false');
      }
      fetchReviewsAndRender(currentProduct);
    })
    .catch(function (err) {
      console.error('Failed to load product:', err);
      showNotFound();
    });
}
} /* end bootProduct */

/* Re-render on language change */
function rerenderProduct() {
  if (!currentProduct) { showNotFound(); return; }
  fetchReviewsAndRender(currentProduct);
}

if (window.i18n) bootProduct();
else window.addEventListener('i18n:ready', bootProduct, { once: true });
window.addEventListener('i18n:changed', rerenderProduct);

/* ---------- REVIEWS ---------- */
var currentReviews = [];

function formatRelativeDate(createdAt) {
  if (!createdAt) return '';
  var date = new Date(String(createdAt).replace(' ', 'T') + 'Z');
  if (isNaN(date.getTime())) return '';
  var seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return window.i18n('customer:product_detail.time.just_now');
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return window.i18n('customer:product_detail.time.minute', { count: minutes });
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return window.i18n('customer:product_detail.time.hour', { count: hours });
  var days = Math.floor(hours / 24);
  if (days < 30) return window.i18n('customer:product_detail.time.day', { count: days });
  var months = Math.floor(days / 30);
  if (months < 12) return window.i18n('customer:product_detail.time.month', { count: months });
  var years = Math.floor(days / 365);
  return window.i18n('customer:product_detail.time.year', { count: years });
}

function fetchReviewsAndRender(product) {
  var reviewEmail = localStorage.getItem('boularas_review_email') || '';
  var queryEmail = reviewEmail ? '&email=' + encodeURIComponent(reviewEmail) : '';
  fetch('/api/reviews?product_id=' + product.id + queryEmail)
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
    return '<div class="reviews-empty">' + window.i18n('customer:product_detail.no_reviews') + '</div>';
  }
  var isAdmin = !!localStorage.getItem('admin_token');
  var cards = currentReviews.map(function (review) {
    var stars = '';
    for (var i = 0; i < 5; i++) {
      stars += i < review.rating ? '&#9733;' : '&#9734;';
    }
    var date = formatRelativeDate(review.created_at);

    var menuHTML = '';
    if (isAdmin || review.is_mine === true) {
      var editDisabled = (!isAdmin && review.is_expired === true) ? ' disabled' : '';
      var delDisabled = (!isAdmin && review.is_expired === true) ? ' disabled' : '';
      menuHTML =
        '<div class="review-menu">' +
          '<button type="button" class="review-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="' + window.i18n('customer:product_detail.review_options') + '">&#8942;</button>' +
          '<div class="review-menu-pop" hidden>' +
            '<button type="button" class="review-menu-item" data-edit-review="' + review.id + '"' + editDisabled + '>' + window.i18n('customer:product_detail.edit') + '</button>' +
            '<button type="button" class="review-menu-item danger" data-delete-review="' + review.id + '"' + delDisabled + '>' + window.i18n('customer:product_detail.delete') + '</button>' +
          '</div>' +
        '</div>';
    }

    return '<div class="review-card" data-review-id="' + review.id + '">' +
      '<div class="review-head">' +
        '<div><span class="review-name">' + escapeHtml(review.customer_name) + '</span> <span class="review-stars">' + stars + '</span></div>' +
        '<div class="review-head-right"><span class="review-date">' + date + '</span>' + menuHTML + '</div>' +
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

function closeAllReviewMenus() {
  document.querySelectorAll('.review-menu').forEach(function (menu) {
    var pop = menu.querySelector('.review-menu-pop');
    var btn = menu.querySelector('.review-menu-btn');
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

function toggleReviewMenu(btn) {
  closeAllReviewMenus();
  var menu = btn.closest('.review-menu');
  if (!menu) return;
  var pop = menu.querySelector('.review-menu-pop');
  var willOpen = !pop || pop.hidden;
  if (pop) pop.hidden = !willOpen;
  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function wireUpReviewDeleteButtons() {
  if (wireUpReviewDeleteButtons._done) return;
  wireUpReviewDeleteButtons._done = true;

  document.addEventListener('click', function (event) {
    var menuBtn = event.target.closest('.review-menu-btn');
    if (menuBtn) { event.stopPropagation(); toggleReviewMenu(menuBtn); return; }

    var delBtn = event.target.closest('[data-delete-review]');
    if (delBtn) { event.stopPropagation(); if (confirm(window.i18n('customer:product_detail.delete_confirm'))) deleteReview(delBtn.getAttribute('data-delete-review')); return; }

    var editBtn = event.target.closest('[data-edit-review]');
    if (editBtn) {
      event.stopPropagation();
      var card = editBtn.closest('.review-card');
      if (card) startInlineEdit(card, editBtn.getAttribute('data-edit-review'));
    }
  });
}

function deleteReview(reviewId) {
  var options = { method: 'DELETE' };
  var adminToken = localStorage.getItem('admin_token');
  var headers = {};
  var body = null;
  if (adminToken) {
    headers['Authorization'] = 'Bearer ' + adminToken;
  } else {
    var email = localStorage.getItem('boularas_review_email') || '';
    body = JSON.stringify({ email: email });
    headers['Content-Type'] = 'application/json';
  }
  if (Object.keys(headers).length) options.headers = headers;
  if (body) options.body = body;

  fetch('/api/reviews/' + reviewId, options)
    .then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    })
    .then(function (res) {
      if (!res.ok) {
        showToast((res.data && res.data.error) || window.i18n('customer:product_detail.could_not_delete'));
        currentReviews = currentReviews.filter(function (r) { return String(r.id) !== String(reviewId); });
        var list = document.getElementById('reviewsList');
        if (list) list.innerHTML = renderReviews(currentProduct ? currentProduct.id : 0);
        return;
      }
      currentReviews = currentReviews.filter(function (r) { return String(r.id) !== String(reviewId); });
      var list2 = document.getElementById('reviewsList');
      if (list2) list2.innerHTML = renderReviews(currentProduct ? currentProduct.id : 0);
      showToast(window.i18n('customer:product_detail.review_deleted'));
    })
    .catch(function () {
      showToast(window.i18n('customer:product_detail.could_not_delete'));
    });
}

function startInlineEdit(card, reviewId) {
  closeAllReviewMenus();
  var review = null;
  for (var i = 0; i < currentReviews.length; i++) {
    if (String(currentReviews[i].id) === String(reviewId)) { review = currentReviews[i]; break; }
  }
  if (!review) return;

  var textEl = card.querySelector('.review-text');
  var editor = document.createElement('div');
  editor.className = 'review-editor';
  editor.innerHTML =
    '<textarea class="review-edit-textarea" maxlength="2000" aria-label="' + window.i18n('customer:product_detail.edit_review_aria') + '">' + escapeHtml(review.comment || '') + '</textarea>' +
    '<div class="review-editor-actions">' +
      '<button type="button" class="btn btn-primary review-save-btn">' + window.i18n('customer:product_detail.save') + '</button>' +
      '<button type="button" class="btn btn-outline review-cancel-btn">' + window.i18n('customer:product_detail.cancel') + '</button>' +
    '</div>';
  if (textEl) {
    textEl.replaceWith(editor);
  }

  var cancelBtn = editor.querySelector('.review-cancel-btn');
  var saveBtn = editor.querySelector('.review-save-btn');
  cancelBtn.addEventListener('click', function () {
    var p = document.createElement('p');
    p.className = 'review-text';
    p.innerHTML = escapeHtml(review.comment || '');
    editor.replaceWith(p);
  });
  saveBtn.addEventListener('click', function () {
    var value = editor.querySelector('.review-edit-textarea').value.trim();
    if (value.length === 0) { showToast(window.i18n('customer:product_detail.comment_empty')); return; }
    saveBtn.disabled = true;
    var payload = { comment: value };
    var options = { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
    var adminToken = localStorage.getItem('admin_token');
    if (adminToken) {
      options.headers['Authorization'] = 'Bearer ' + adminToken;
    } else {
      payload.email = localStorage.getItem('boularas_review_email') || '';
      options.body = JSON.stringify(payload);
    }
    fetch('/api/reviews/' + reviewId, options)
      .then(function (r) {
        return r.json().then(function (data) { return { ok: r.ok, data: data }; });
      })
      .then(function (res) {
        saveBtn.disabled = false;
        if (!res.ok) {
          showToast((res.data && res.data.error) || window.i18n('customer:product_detail.could_not_save'));
          return;
        }
        review.comment = res.data.comment;
        var list = document.getElementById('reviewsList');
        if (list) list.innerHTML = renderReviews(currentProduct ? currentProduct.id : 0);
        showToast(window.i18n('customer:product_detail.review_updated'));
      })
      .catch(function () {
        saveBtn.disabled = false;
        showToast(window.i18n('customer:product_detail.could_not_save'));
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

/* Close review "..." menus on outside click and Escape */
document.addEventListener('click', function (event) {
  if (!event.target.closest('.review-menu')) closeAllReviewMenus();
});
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') closeAllReviewMenus();
});

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
    markReviewFormDone(productId, window.i18n('customer:product_detail.already_reviewed'));
  }
}

/* ---------- RENDER PRODUCT ---------- */
function renderProduct(p) {
  document.title = p.name + window.i18n('customer:product_detail.title_suffix');
  var md = document.querySelector('meta[name="description"]');
  if (md && p.description) md.setAttribute('content', p.description.slice(0, 150));
  var description = p.description || window.i18n('customer:product_detail.description_default');
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
  if (p.on_sale) badgeHTML = '<span class="gallery-badge sale">' + window.i18n('customer:product.sale') + '</span>';
  else if (p.featured) badgeHTML = '<span class="gallery-badge">' + window.i18n('customer:product.new') + '</span>';

  var oldPriceHTML = oldPriceDollars ? '<s>' + price(oldPriceDollars * 100) + '</s>' : '';
  var saveHTML = oldPriceDollars ? '<span class="save">' + window.i18n('customer:product.save_amount', { amount: price((oldPriceDollars - priceDollars) * 100) }) + '</span>' : '';

  var galleryImages = (p.images && p.images.length > 0) ? p.images.filter(function (img) { return !!img; }) : [];
  lightboxImages = galleryImages.length > 0 ? galleryImages : [p.image];
  var thumbs;
  if (galleryImages.length > 0) {
    thumbs = galleryImages.map(function (img, i) {
      return '<button type="button" class="' + (i === 0 ? 'active' : '') + '" data-thumb="' + i + '" aria-label="' + window.i18n('customer:product.view_image', { count: i + 1 }) + '"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + img + '" alt="' + window.i18n('customer:product.thumbnail', { name: escapeHtml(p.name), count: i + 1 }) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" /></button>';
    }).join('');
  } else {
    thumbs = '<button type="button" class="active" data-thumb="0" aria-label="' + window.i18n('customer:product.view_image', { count: 1 }) + '"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + p.image + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" /></button>';
  }

  var swatches;
  if (typeof colors[0] === 'object') {
    swatches = colors.map(function (c, i) {
      var hex = c.hex || '#e8e0d3';
      var name = c.name || c;
      return '<button type="button" class="swatch ' + (i === 0 ? 'active' : '') + '" style="background:' + hex + '" data-color="' + escapeHtml(name) + '" aria-label="' + window.i18n('customer:product.color_aria', { name: escapeHtml(name) }) + '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '"></button>';
    }).join('');
  } else {
    swatches = colors.map(function (name, i) {
      return '<button type="button" class="swatch ' + (i === 0 ? 'active' : '') + '" style="background:' + colorHex(name) + '" data-color="' + escapeHtml(name) + '" aria-label="' + window.i18n('customer:product.color_aria', { name: escapeHtml(name) }) + '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '"></button>';
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
    ? '<div class="stock-note">' + window.i18n('customer:product.in_stock_left', { count: p.stock }) + '</div>'
    : '<div class="stock-note" style="color:var(--wood)">' + window.i18n('customer:product_detail.out_of_stock') + '</div>';

  var specsRows = '';
  if (p.specifications && p.specifications.length > 0) {
    specsRows = p.specifications.map(function (s) {
      return '<tr><th>' + escapeHtml(s.label) + '</th><td>' + escapeHtml(s.value) + '</td></tr>';
    }).join('');
  }

  var perksThresholdCents = (storeSettings.free_delivery_threshold_cents != null && !isNaN(Number(storeSettings.free_delivery_threshold_cents))) ? Number(storeSettings.free_delivery_threshold_cents) : 6670000;
  var perksThresholdText = price(perksThresholdCents);
  var perksHasThreshold = storeSettings.free_delivery_threshold_cents != null && !isNaN(Number(storeSettings.free_delivery_threshold_cents)) && Number(storeSettings.free_delivery_threshold_cents) > 0;
  var shippingText = (p.shipping_info && p.shipping_info.trim()) ? p.shipping_info
    : (storeSettings.shipping_policy && storeSettings.shipping_policy.trim()) ? storeSettings.shipping_policy
    : window.i18n('customer:product_detail.shipping_default', { amount: perksThresholdText });
  var returnsText = (p.returns_info && p.returns_info.trim()) ? p.returns_info
    : (storeSettings.returns_policy && storeSettings.returns_policy.trim()) ? storeSettings.returns_policy
    : window.i18n('customer:product_detail.returns_default');

  var hasProductFree = !!p.free_delivery;
  var hasStoreFree = !!(storeSettings.perks_free_delivery);
  var perksFreeDelivery = hasProductFree || hasStoreFree;
  var perksWarrantyMonths = (p.warranty_months && p.warranty_months > 0) ? p.warranty_months : ((storeSettings.perks_warranty_months && storeSettings.perks_warranty_months > 0) ? storeSettings.perks_warranty_months : 12);
  var perksReturnsDays = (storeSettings.perks_returns_days && storeSettings.perks_returns_days > 0) ? storeSettings.perks_returns_days : 30;
  var perksDeliveryTitle;
  var perksDeliveryDesc;
  if (hasProductFree) {
    perksDeliveryTitle = window.i18n('customer:product_detail.free_delivery');
    perksDeliveryDesc = window.i18n('customer:product_detail.on_this_product');
  } else if (hasStoreFree) {
    perksDeliveryTitle = window.i18n('customer:product_detail.free_delivery');
    perksDeliveryDesc = window.i18n('customer:product_detail.on_every_order');
  } else if (perksHasThreshold) {
    perksDeliveryTitle = window.i18n('customer:product_detail.free_delivery');
    perksDeliveryDesc = window.i18n('customer:product_detail.on_orders_over', { amount: perksThresholdText });
  } else {
    perksDeliveryTitle = window.i18n('customer:product_detail.nationwide_delivery');
    perksDeliveryDesc = '<span style="font-size:11px;color:var(--gray);display:block;margin-top:2px">' + window.i18n('customer:product_detail.wilayas_available') + '</span>';
  }

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
          '<span class="stars"><span aria-hidden="true">' + stars + '</span><span class="sr-only">' + window.i18n('customer:product.rated', { rating: avgRating }) + '</span></span>' +
          '<small>' + avgRating + ' &middot; ' + reviewCount + ' ' + window.i18n('customer:product.review', { count: reviewCount }) + '</small>' +
        '</div>' +
        '<div class="info-price">' +
          '<span class="price">' + price(p.price_cents) + '</span>' +
          oldPriceHTML + saveHTML +
        '</div>' +
        stockHTML +
        '<p class="info-desc">' + escapeHtml(description) + '</p>' +

        '<div class="option-block">' +
          '<label>' + window.i18n('customer:product_detail.color') + ' <span>: <b id="selectedColor">' + escapeHtml(selection.color) + '</b></span></label>' +
          '<div class="swatches" id="swatchList">' + swatches + '</div>' +
        '</div>' +
        '<div class="option-block">' +
          '<label>' + window.i18n('customer:product_detail.size') + ' <span>: <b id="selectedSize">' + escapeHtml(selection.size) + '</b></span></label>' +
          '<div class="size-list" id="sizeList">' + sizePills + '</div>' +
        '</div>' +
        '<div class="option-block">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
            '<label style="margin:0">' + window.i18n('customer:product_detail.quantity') + ' : </label>' +
            '<div class="stock-note qty-stock-note" id="qtyStockNote" style="display:none"></div>' +
          '</div>' +
          '<div class="buy-row">' +
            '<div class="qty">' +
              '<button type="button" data-qty="-1" aria-label="' + window.i18n('customer:product_detail.decrease_qty') + '"' + (outOfStock ? ' disabled' : '') + '>&minus;</button>' +
              '<input type="number" id="qtyInput" value="' + initialQty + '" min="1" max="99" aria-label="' + window.i18n('customer:product_detail.quantity') + '"' + (outOfStock ? ' disabled' : '') + ' />' +
              '<button type="button" data-qty="1" aria-label="' + window.i18n('customer:product_detail.increase_qty') + '"' + (outOfStock ? ' disabled' : '') + '>+</button>' +
            '</div>' +
            '<button type="button" class="btn btn-primary" id="addToCartBtn"' + (outOfStock ? ' disabled style="opacity:0.5;pointer-events:none;"' : '') + '>' + window.i18n('customer:product_detail.add_to_cart') + '</button>' +
            '<button type="button" class="btn-icon" id="wishlistBtn" aria-label="' + window.i18n('customer:product_detail.add_wishlist') + '" title="' + window.i18n('customer:product_detail.add_wishlist') + '"><span class="material-symbols-outlined">favorite_border</span></button>' +
          '</div>' +
        '</div>' +

        '<div class="perks">' +
          '<div><b>' + perksDeliveryTitle + '</b>' + perksDeliveryDesc + '</div>' +
          '<div><b>' + window.i18n('customer:product_detail.month_warranty', { count: perksWarrantyMonths }) + '</b>' + window.i18n('customer:product_detail.on_every_frame') + '</div>' +
          '<div><b>' + window.i18n('customer:product_detail.day_returns', { count: perksReturnsDays }) + '</b>' + window.i18n('customer:product_detail.hassle_free') + '</div>' +
        '</div>' +

        '<div class="tabs">' +
          '<div class="tab-nav" role="tablist">' +
            '<button type="button" class="active" data-tab="desc" id="tab-desc" role="tab" aria-selected="true" aria-controls="panel-desc">' + window.i18n('customer:product_detail.tab_description') + '</button>' +
            '<button type="button" data-tab="specs" id="tab-specs" role="tab" aria-selected="false" aria-controls="panel-specs">' + window.i18n('customer:product_detail.tab_specifications') + '</button>' +
            '<button type="button" data-tab="ship" id="tab-ship" role="tab" aria-selected="false" aria-controls="panel-ship">' + window.i18n('customer:product_detail.tab_shipping') + '</button>' +
          '</div>' +
          '<div class="tab-panels">' +
            '<div class="tab-panel active" data-panel="desc" id="panel-desc" role="tabpanel" aria-labelledby="tab-desc">' +
              '<h3>' + window.i18n('customer:product_detail.about_piece') + '</h3>' +
              '<p>' + escapeHtml(description) + '</p>' +
            '</div>' +
            '<div class="tab-panel" data-panel="specs" id="panel-specs" role="tabpanel" aria-labelledby="tab-specs">' +
              '<h3>' + window.i18n('customer:product_detail.details') + '</h3>' +
              '<table class="specs-table"><tbody>' +
                '<tr><th>' + window.i18n('customer:product_detail.brand') + '</th><td>' + escapeHtml(p.brand || 'Boularas') + '</td></tr>' +
                '<tr><th>' + window.i18n('customer:product_detail.category') + '</th><td>' + escapeHtml(catLabel) + '</td></tr>' +
                (p.sku ? '<tr><th>' + window.i18n('customer:product_detail.sku') + '</th><td>' + escapeHtml(p.sku) + '</td></tr>' : '') +
                specsRows +
              '</tbody></table>' +
            '</div>' +
            '<div class="tab-panel" data-panel="ship" id="panel-ship" role="tabpanel" aria-labelledby="tab-ship">' +
              '<h3>' + window.i18n('customer:product_detail.delivery_returns') + '</h3>' +
              '<p><b>' + window.i18n('customer:product_detail.shipping') + '</b> ' + escapeHtml(shippingText) + '</p>' +
              '<p><b>' + window.i18n('customer:product_detail.returns') + '</b> ' + escapeHtml(returnsText) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>';

  wireUpDetail(p, colors);
  document.querySelectorAll('#productRoot .reveal').forEach(function (el) { el.classList.add('visible'); });
  updateOrderSummary(p);
  updateQtyStockNote(p);
  var cBtn = document.getElementById('confirmOrderBtn');
  if (cBtn) {
    var out2 = !(p.stock > 0);
    cBtn.disabled = out2;
    cBtn.textContent = out2 ? 'Out of Stock' : 'Confirm Order';
    cBtn.setAttribute('aria-disabled', out2 ? 'true' : 'false');
  }
  if (typeof initLazyImages === 'function') initLazyImages();
}

/* ---------- STOCK WARNING NEAR QUANTITY CONTROLS ---------- */
function updateQtyStockNote(p) {
  var note = document.getElementById('qtyStockNote');
  if (!note) return;
  var stock = p.stock || 0;
  if (stock <= 0) {
    note.textContent = window.i18n('customer:product_detail.product_unavailable');
    note.style.display = 'inline-flex';
    return;
  }
  var maxQty = Math.min(stock || 99, 99);
  if (stock > 0 && stock <= 99 && selection.qty >= maxQty) {
    note.textContent = window.i18n('customer:product.in_stock_note', { count: maxQty });
    note.style.display = 'inline-flex';
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
  lightboxEl.setAttribute('aria-label', window.i18n('customer:product_detail.lightbox_viewer'));
  lightboxEl.innerHTML =
    '<button type="button" class="lightbox-btn lightbox-close" aria-label="' + window.i18n('customer:product_detail.lightbox_close') + '">&#10005;</button>' +
    '<button type="button" class="lightbox-btn lightbox-prev" aria-label="' + window.i18n('customer:product_detail.lightbox_prev') + '">&#8249;</button>' +
    '<button type="button" class="lightbox-btn lightbox-next" aria-label="' + window.i18n('customer:product_detail.lightbox_next') + '">&#8250;</button>' +
    '<img id="lightboxImg" alt="" />';
  document.body.appendChild(lightboxEl);
  lightboxEl.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightboxEl.querySelector('.lightbox-prev').addEventListener('click', function () { lightboxStep(-1); });
  lightboxEl.querySelector('.lightbox-next').addEventListener('click', function () { lightboxStep(1); });
  lightboxEl.addEventListener('click', function (event) { if (event.target === lightboxEl) closeLightbox(); });
  lightboxEl.addEventListener('keydown', trapLightboxFocus);
  return lightboxEl;
}

function getLightboxFocusables() {
  if (!lightboxEl) return [];
  return Array.prototype.slice.call(lightboxEl.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'));
}

function trapLightboxFocus(event) {
  if (!lightboxEl || !lightboxEl.classList.contains('open')) return;
  if (event.key !== 'Tab') return;
  var focusables = getLightboxFocusables();
  if (focusables.length === 0) { event.preventDefault(); return; }
  var first = focusables[0];
  var last = focusables[focusables.length - 1];
  var active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !lightboxEl.contains(active)) { event.preventDefault(); last.focus(); }
  } else {
    if (active === last || !lightboxEl.contains(active)) { event.preventDefault(); first.focus(); }
  }
}

function updateLightbox() {
  if (!lightboxEl) return;
  var src = lightboxImages[lightboxIndex] || '';
  var main = document.getElementById('galleryMainImg');
  var img = document.getElementById('lightboxImg');
  img.src = src;
  img.alt = currentProduct ? window.i18n('customer:product_detail.enlarged_view', { name: currentProduct.name || window.i18n('customer:product_detail.product'), count: 1 }) : window.i18n('customer:product_detail.enlarged_image');
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
  window.__lastFocused = document.activeElement;
  lightboxEl.classList.add('open');
  document.body.style.overflow = 'hidden';
  var closeBtn = lightboxEl.querySelector('.lightbox-close');
  if (closeBtn) closeBtn.focus();
}

function closeLightbox() {
  if (!lightboxEl) return;
  lightboxEl.classList.remove('open');
  document.body.style.overflow = '';
  if (window.__lastFocused && window.__lastFocused.focus) window.__lastFocused.focus();
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
    document.querySelectorAll('#swatchList .swatch').forEach(function (s) { s.classList.remove('active'); s.setAttribute('aria-pressed', 'false'); });
    swatch.classList.add('active');
    swatch.setAttribute('aria-pressed', 'true');
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
    if (p.stock <= 0) { showToast(window.i18n('customer:product_detail.product_unavailable')); return; }
    if (isInCart(p.id, selection.color, selection.size)) {
      updateQty(buildCartKey(p.id, selection.color, selection.size), selection.qty);
      window.location.href = 'cart.html';
      return;
    }
    addToCart(p, { qty: selection.qty, color: selection.color, size: selection.size });
    showToast(window.i18n('customer:product_detail.added_to_cart'));
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
    wishBtn.setAttribute('aria-pressed', wished ? 'true' : 'false');
    wishBtn.setAttribute('aria-label', wished ? window.i18n('customer:product_detail.remove_wishlist') : window.i18n('customer:product_detail.add_wishlist'));
    wishBtn.addEventListener('click', function () {
      wished = !wished;
      wishBtn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings:\'' + (wished ? 'FILL\' 1' : 'FILL\' 0') + ',\'wght\' 400,\'GRAD\' 0,\'opsz\' 24">' + (wished ? 'favorite' : 'favorite_border') + '</span>';
      wishBtn.style.background = wished ? 'var(--charcoal)' : '';
      wishBtn.style.color = wished ? 'var(--warm-white)' : '';
      wishBtn.style.borderColor = wished ? 'var(--charcoal)' : '';
      wishBtn.setAttribute('aria-pressed', wished ? 'true' : 'false');
      wishBtn.setAttribute('aria-label', wished ? window.i18n('customer:product_detail.remove_wishlist') : window.i18n('customer:product_detail.add_wishlist'));
      if (wished) {
        wishList.push({ id: p.id, name: p.name, price_cents: p.price_cents, image: p.image || (p.images && p.images[0]) || '' });
      } else {
        wishList = wishList.filter(function (w) { return String(w.id) !== String(p.id); });
      }
      localStorage.setItem('boularas_wishlist', JSON.stringify(wishList));
      showToast(wished ? window.i18n('customer:product_detail.added_wishlist') : window.i18n('customer:product_detail.removed_wishlist'));
      if (typeof updateWishCount === 'function') updateWishCount();
    });
  }

  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  function activateTab(btn) {
    var name = btn.getAttribute('data-tab');
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.classList.remove('active');
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.getAttribute('data-panel') === name);
    });
    btn.classList.add('active');
  }
  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateTab(btn);
    });
    btn.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      var idx = tabButtons.indexOf(btn);
      var next;
      if (event.key === 'ArrowLeft') {
        next = idx - 1 < 0 ? tabButtons.length - 1 : idx - 1;
      } else {
        next = idx + 1 >= tabButtons.length ? 0 : idx + 1;
      }
      tabButtons[next].focus();
      activateTab(tabButtons[next]);
    });
  });

  /* Star picker for reviews */
  var starBtns = document.querySelectorAll('#starPicker button');
  var currentRating = 0;
  function setStarLabels() {
    starBtns.forEach(function (btn) {
      var n = btn.getAttribute('data-star-count') || btn.getAttribute('data-star');
      btn.setAttribute('aria-label', window.i18n('customer:product_detail.star_aria', { count: Number(n) }));
    });
  }
  setStarLabels();
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
    if (!currentRating) { showToast(window.i18n('customer:product_detail.select_rating')); return; }
    if (!name) { showToast(window.i18n('customer:product_detail.enter_name')); return; }
    if (emailInput && !emailValue) { showToast(window.i18n('customer:product_detail.enter_email')); return; }
    if (!text) { showToast(window.i18n('customer:product_detail.write_review')); return; }
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
        if (emailInput) localStorage.setItem('boularas_review_email', emailValue.toLowerCase());
        newReview.is_mine = true;
        newReview.is_expired = false;
        currentReviews.unshift(newReview);
        var list = document.getElementById('reviewsList');
        if (list) list.innerHTML = renderReviews(p.id);
        document.getElementById('reviewName').value = '';
        document.getElementById('reviewText').value = '';
        if (emailInput) emailInput.value = '';
        currentRating = 0;
        starBtns.forEach(function (b) { b.classList.remove('filled'); b.style.color = 'var(--beige)'; });
        showToast(window.i18n('customer:product_detail.review_submitted'));
        wireUpReviewDeleteButtons();
        markReviewFormDone(p.id, window.i18n('customer:product_detail.thank_you_review'));
      })
      .catch(function () {
        if (submitBtn) submitBtn.disabled = false;
        showToast(window.i18n('customer:product_detail.could_not_submit'));
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
  fName:    function (v) { v = v.trim(); if (!v) return window.i18n('customer:product_detail.req_full_name'); return v.length < 3 ? window.i18n('customer:product_detail.req_name_len') : ''; },
  fPhone:   function (v) { var d = v.replace(/[^0-9]/g, ''); if (!d) return window.i18n('customer:product_detail.req_phone'); return d.length < 7 ? window.i18n('customer:product_detail.err_phone') : ''; },
  fEmail:   function (v) { v = v.trim(); if (!v) return window.i18n('customer:product_detail.req_email'); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : window.i18n('customer:product_detail.err_email'); },
  fAddress: function (v) { v = v.trim(); if (!v) return window.i18n('customer:product_detail.req_address'); return v.length < 5 ? window.i18n('customer:product_detail.err_address') : ''; },
  fCity:    function (v) { v = v.trim(); if (!v) return window.i18n('customer:product_detail.req_city'); return v.length < 2 ? window.i18n('customer:product_detail.err_city') : ''; }
};

function setFieldError(name, message) {
  var input = document.getElementById(name);
  var msg = document.querySelector('[data-msg-for="' + name + '"]');
  // Accessibility: give the error element a stable id and link the field to it.
  if (msg && !msg.id) msg.id = name + 'Msg';
  if (input && msg && !input.getAttribute('aria-describedby')) {
    input.setAttribute('aria-describedby', msg.id);
  }
  if (message) {
    if (input) { input.classList.add('error', 'invalid'); input.classList.remove('valid'); input.setAttribute('aria-invalid', 'true'); }
    if (msg) msg.textContent = message;
  } else {
    if (input) { input.classList.remove('error', 'invalid'); input.classList.add('valid'); input.removeAttribute('aria-invalid'); }
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

function getModalFocusables() {
  var overlay = document.getElementById('orderModalOverlay');
  if (!overlay) return [];
  return Array.prototype.slice.call(overlay.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'));
}

function trapModalFocus(event) {
  if (!modal.classList.contains('open')) return;
  if (event.key === 'Escape') { closeModal(); return; }
  if (event.key !== 'Tab') return;
  var focusables = getModalFocusables();
  if (focusables.length === 0) { event.preventDefault(); return; }
  var first = focusables[0];
  var last = focusables[focusables.length - 1];
  var active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !modal.contains(active)) { event.preventDefault(); last.focus(); }
  } else {
    if (active === last || !modal.contains(active)) { event.preventDefault(); first.focus(); }
  }
}

function openModal() {
  window.__lastFocused = document.activeElement;
  modal.classList.add('open');
  modal.addEventListener('keydown', trapModalFocus);
  document.body.style.overflow = 'hidden';
  setTimeout(function () { document.getElementById('modalCloseBtn').focus(); }, 200);
}
function closeModal() {
  modal.removeEventListener('keydown', trapModalFocus);
  modal.classList.remove('open');
  document.body.style.overflow = '';
  if (window.__lastFocused && window.__lastFocused.focus) window.__lastFocused.focus();
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
  if (firstInvalid) { firstInvalid.focus(); showToast(window.i18n('customer:product_detail.fix_fields')); return; }

  if (!currentProduct) { showToast(window.i18n('customer:product_detail.product_not_loaded')); return; }

  if (currentProduct.stock <= 0) { showToast(window.i18n('customer:product_detail.product_unavailable')); return; }

  addToCart(currentProduct, { qty: selection.qty, color: selection.color, size: selection.size });
  showToast(window.i18n('customer:product_detail.redirecting_checkout'));
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
  if (p.on_sale) badge = '<span class="card-badge sale">' + window.i18n('customer:product.sale') + '</span>';
  else if (p.featured) badge = '<span class="card-badge">' + window.i18n('customer:product.new') + '</span>';
  if (!(p.stock > 0)) {
    var outBadge = '<span class="card-badge" style="background:#e41a1a;color:#fff;">' + window.i18n('customer:product.unavailable') + '</span>';
    badge = badge ? badge + ' ' + outBadge : outBadge;
  }
  var oldPriceHTML = p.old_price_cents ? '<s>' + price(p.old_price_cents) + '</s>' : '';
  var defaults = resolveVariantDefaults(p);
  var inCart = isInCart(p.id, defaults.color, defaults.size);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? window.i18n('customer:product.in_cart') : window.i18n('customer:product.add');
  var btnDisabled = !(p.stock > 0) ? ' disabled style="opacity:0.5;pointer-events:none;"' : '';
  return '<article class="product-card" data-category="' + (p.category || '') + '">' +
    '<a class="card-hit" href="product.html?id=' + p.id + '" aria-label="' + window.i18n('customer:product.view', { name: escapeHtml(p.name) }) + '">' +
      '<span class="card-media">' + badge +
        '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + img + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" />' +
      '</span>' +
      '<span class="card-body">' +
        '<span class="card-category">' + escapeHtml(getCategoryLabel(p.category)) + '</span>' +
        '<span class="card-title">' + escapeHtml(p.name) + '</span>' +
      '</span>' +
    '</a>' +
    '<span class="card-price-row">' +
      '<span class="card-price">' + price(p.price_cents) + oldPriceHTML + '</span>' +
      '<button class="' + btnClass + '" type="button" data-add="' + p.id + '"' + btnDisabled + '>' + btnText + '</button>' +
    '</span>' +
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
      addButton.textContent = window.i18n('customer:product.in_cart');
      addButton.className = 'card-added';
      showToast(window.i18n('customer:product.added_to_cart', { name: escapeHtml(prod.name) }));
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

document.addEventListener('click', function (e) {
  var navLinks = document.getElementById('navLinks');
  var toggle = document.getElementById('menuToggle');
  if (!navLinks || !navLinks.classList.contains('open')) return;
  if (navLinks.contains(e.target) || (toggle && toggle.contains(e.target))) return;
  navLinks.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
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
  if (btn) btn.textContent = inCart ? window.i18n('customer:product.in_cart') : window.i18n('customer:product_detail.add_to_cart');
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