/* search.js — search-results.html specific logic */

var PRODUCTS = [];

/* ---------- HELPERS ---------- */
function getProductImage(product) {
  var imgs = [];
  try { imgs = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []); }
  catch (e) { imgs = []; }
  if (imgs.length > 0 && imgs[0]) {
    return imgs[0];
  }
  if (typeof window.getFallbackImage === 'function') {
    return window.getFallbackImage(product.category);
  }
  return window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.jpg';
}
function getProductCategory(product) {
  return (product.category || product.category_name || 'uncategorized');
}

/* ---------- PRODUCT CARD HTML ---------- */
function productCardHTML(product) {
  var img = getProductImage(product);
  var cat = getProductCategory(product);
  var isSale = product.on_sale || product.on_sale === 1;
  var oldPrice = product.old_price_cents ? product.old_price_cents : null;
  var badge = '';
  if (isSale && oldPrice) badge = '<span class="card-badge sale">Sale</span>';
  if (!(product.stock > 0)) {
    var outBadge = '<span class="card-badge" style="background:#e41a1a;color:#fff;">unavailable</span>';
    badge = badge ? badge + ' ' + outBadge : outBadge;
  }
  var oldPriceHTML = oldPrice ? '<s>' + price(oldPrice) + '</s>' : '';
  var inCart = isInCart(product.id);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? 'In Cart' : 'Add';
  var btnDisabled = !(product.stock > 0) ? ' disabled style="opacity:0.5;pointer-events:none;"' : '';

  var nameEscaped = escapeHtml(product.name);
  var addLabel = !(product.stock > 0) ? 'Product ' + nameEscaped + ' unavailable' : (inCart ? nameEscaped + ' is in cart' : 'Add ' + nameEscaped + ' to cart');
  return (
    '<article class="product-card reveal">' +
      '<a class="card-hit" href="product.html?id=' + product.id + '" aria-label="View ' + nameEscaped + '">' +
        '<span class="card-media">' +
          badge +
          '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + img + '" alt="' + nameEscaped + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
        '</span>' +
        '<span class="card-body">' +
          '<span class="card-category">' + escapeHtml(cat) + '</span>' +
          '<span class="card-title">' + nameEscaped + '</span>' +
        '</span>' +
      '</a>' +
      '<span class="card-price-row">' +
        '<span class="card-price">' + price(product.price_cents || 0) + oldPriceHTML + '</span>' +
        '<button class="' + btnClass + '" type="button" data-add="' + product.id + '" aria-label="' + addLabel + '"' + btnDisabled + '>' + btnText + '</button>' +
      '</span>' +
    '</article>'
  );
}

/* ---------- SEARCH LOGIC ---------- */
function getQuery() {
  var params = new URLSearchParams(window.location.search);
  return (params.get('q') || '').trim();
}

function performSearch() {
  var query = getQuery();
  var grid = document.getElementById('resultsGrid');
  var countEl = document.getElementById('resultCount');
  var input = document.getElementById('searchInput');

  if (input) input.value = query;

  if (!query) {
    if (countEl) countEl.innerHTML = 'Enter a search term above to find products.';
    grid.innerHTML =
      '<div class="no-results" style="grid-column: 1 / -1;">' +
        '<div class="icon" aria-hidden="true"><span class="material-symbols-outlined">search</span></div>' +
        '<h2>Search Boularas</h2>' +
        '<p>Find your perfect piece, try searching for "sofa", "desk", or "lamp".</p>' +
      '</div>';
    return;
  }

  var lower = query.toLowerCase();
  var results = PRODUCTS.filter(function (p) {
    var name = (p.name || '').toLowerCase();
    var cat = getProductCategory(p).toLowerCase();
    var desc = (p.description || '').toLowerCase();
    var tags = (Array.isArray(p.tags) ? p.tags.join(' ') : '').toLowerCase();
    return name.indexOf(lower) !== -1 || cat.indexOf(lower) !== -1 || desc.indexOf(lower) !== -1 || tags.indexOf(lower) !== -1;
  });

  if (countEl) {
    countEl.innerHTML = results.length === 1
      ? '<b>1</b> result for "<b>' + escapeHtml(query) + '</b>"'
      : '<b>' + results.length + '</b> results for "<b>' + escapeHtml(query) + '</b>"';
  }

  if (results.length === 0) {
    grid.innerHTML =
      '<div class="no-results">' +
        '<div class="icon" aria-hidden="true"><span class="material-symbols-outlined">mood_bad</span></div>' +
        '<h2>No results found</h2>' +
        '<p>We couldn\'t find anything matching "<b>' + escapeHtml(query) + '</b>". Try a different search term.</p>' +
        '<a href="products.html" class="btn btn-outline">Browse All Products</a>' +
      '</div>';
    return;
  }

  grid.innerHTML = results.map(productCardHTML).join('');
  if (typeof initLazyImages === 'function') initLazyImages();

  grid.querySelectorAll('.reveal').forEach(function (el) {
    revealObserver.observe(el);
  });
}

/* Delegated "Add" button clicks */
document.addEventListener('click', function (event) {
  var addButton = event.target.closest('[data-add]');
  if (!addButton) return;
  if (addButton.classList.contains('card-added')) {
    window.location.href = 'cart.html';
    return;
  }
  var product = PRODUCTS.find(function (p) { return String(p.id) === String(addButton.getAttribute('data-add')); });
  if (!product) return;
  if (!(product.stock > 0)) return;
  addToCart(product);
  showToast(product.name + ' added to cart');
  addButton.textContent = 'In Cart';
  addButton.className = 'card-added';
});

/* ---------- CART STATE ---------- */
function renderCartState() {
  document.querySelectorAll('[data-add]').forEach(function (addButton) {
    var inCart = isInCart(addButton.getAttribute('data-add'));
    addButton.textContent = inCart ? 'In Cart' : 'Add';
    addButton.className = inCart ? 'card-added' : 'card-add';
    var product = PRODUCTS.find(function (p) { return String(p.id) === String(addButton.getAttribute('data-add')); });
    if (product && !(product.stock > 0)) {
      addButton.disabled = true;
      addButton.style.opacity = '0.5';
      addButton.style.pointerEvents = 'none';
    }
  });
}
window.addEventListener('cart:updated', renderCartState);
window.addEventListener('pageshow', function (e) { if (e.persisted) { updateCartCount(); renderCartState(); } });
window.addEventListener('storage', function (e) { if (e.key === window.CART_KEY) { updateCartCount(); renderCartState(); } });

/* ---------- UI HELPERS ---------- */

/* Mobile menu toggle */
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

/* Reveal-on-scroll */
var revealObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

/* Toast */
var toastTimer = null;
function showToast(message) {
  var toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
}

/* Init cart badge */
updateCartCount();

/* ---------- API DATA ---------- */
(function () {
  var query = (new URLSearchParams(window.location.search).get('q') || '').trim();
  if (!query) { performSearch(); return; }

  fetch('/api/products/browse?search=' + encodeURIComponent(query))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var items = data.products || data.data || data;
      if (Array.isArray(items) && items.length) {
        PRODUCTS = items;
      }
      performSearch();
    })
    .catch(function () {
      performSearch();
    });
})();