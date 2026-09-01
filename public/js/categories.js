/* categories.js — categories.html specific logic */

var CATEGORIES = [];
var PRODUCTS = [];
var CATEGORY_LABELS = { all: 'All Products' };
var PRICE_MAX_DA = null;
var PRICE_MAX_LABEL = '';

var params = new URLSearchParams(window.location.search);
var state = {
  category: params.get('category') || 'all',
  maxPrice: null,
  sort: 'featured'
};

function getCategoryKey(product) {
  return (product.category || product.category_name || '').toLowerCase();
}

function sliderLabel(dzd) {
  var lang = (window.BoularasI18n && typeof window.BoularasI18n.getLang === 'function') ? window.BoularasI18n.getLang() : 'en';
  var loc = { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' }[lang] || 'en-US';
  return Number(dzd).toLocaleString(loc) + ' DA';
}

/* Render the "Up to X DA" price label with i18n */
function renderPriceMaxLabel() {
  var wrap = document.getElementById('priceMaxWrap');
  if (!wrap) return;
  wrap.innerHTML = window.i18n('customer:catalog.up_to', { amount: PRICE_MAX_LABEL });
}

function setupPriceSlider() {
  var maxCents = 0;
  PRODUCTS.forEach(function (p) {
    var c = p.price_cents || 0;
    if (c > maxCents) maxCents = c;
  });
  PRICE_MAX_DA = Math.max(1, Math.ceil((maxCents / 100) / 50) * 50);
  PRICE_MAX_LABEL = sliderLabel(maxCents / 100);
  state.maxPrice = PRICE_MAX_DA;
  var slider = document.getElementById('priceSlider');
  slider.min = 0;
  slider.max = PRICE_MAX_DA;
  slider.value = PRICE_MAX_DA;
  renderPriceMaxLabel();
}

/* ---------- RENDER CATEGORIES ---------- */
function renderCategories() {
  var grid = document.getElementById('categoriesGrid');
  grid.innerHTML = CATEGORIES.map(function (cat) {
    var slug = cat.slug || '';
    var count = cat.product_count || 0;
    var img = cat.image || window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.jpg';
    return (
      '<a href="products.html?category=' + encodeURIComponent(slug) + '" class="category-card reveal">' +
        '<img class="card-img" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + img + '" alt="' + escapeHtml(cat.name) + '" loading="lazy" onerror="handleImageError(this)" />' +
        '<div class="card-body">' +
          '<h3>' + escapeHtml(cat.name) + '</h3>' +
          '<span class="count">' + window.i18n('customer:categories.count', { count: count }) + '</span>' +
          '<div class="arrow" aria-hidden="true">&rarr;</div>' +
        '</div>' +
      '</a>'
    );
  }).join('');
  document.querySelectorAll('.category-card.reveal').forEach(function (el) { revealObserver.observe(el); });
  if (typeof initLazyImages === 'function') initLazyImages();
}

/* ---------- CATEGORY COUNTS ---------- */
function updateCategoryCounts() {
  var counts = {};
  PRODUCTS.forEach(function (p) {
    var key = getCategoryKey(p);
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  CATEGORIES.forEach(function (cat) {
    var key = (cat.slug || cat.name || '').toLowerCase();
    cat.product_count = counts[key] || 0;
  });
}

/* ---------- CATALOG SIDEBAR ---------- */
function renderCategoryList() {
  var counts = { all: PRODUCTS.length };
  PRODUCTS.forEach(function (p) {
    var key = getCategoryKey(p);
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  var items = Object.keys(CATEGORY_LABELS).map(function (key) {
    var isActive = state.category === key ? ' active' : '';
    var pressed = state.category === key ? 'true' : 'false';
    var count = counts[key] || 0;
    return (
      '<li><button type="button" class="' + isActive.trim() + '" data-cat="' + key + '" aria-pressed="' + pressed + '">' +
        '<span>' + CATEGORY_LABELS[key] + '</span>' +
        '<small>' + count + '</small>' +
      '</button></li>'
    );
  }).join('');
  document.getElementById('categoryList').innerHTML = items;
}

/* ---------- CATALOG GRID ---------- */
function renderProducts() {
  if (!PRODUCTS.length) return;
  var list = PRODUCTS.slice();

  if (state.category !== 'all') {
    list = list.filter(function (p) {
      return getCategoryKey(p) === state.category;
    });
  }
  if (PRICE_MAX_DA !== null) {
    list = list.filter(function (p) {
      return (p.price_cents || 0) <= state.maxPrice * 100;
    });
  }

  if (state.sort === 'price-asc')  list.sort(function (a, b) { return (a.price_cents || 0) - (b.price_cents || 0); });
  if (state.sort === 'price-desc') list.sort(function (a, b) { return (b.price_cents || 0) - (a.price_cents || 0); });
  if (state.sort === 'name')       list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  if (state.sort === 'rating')     list.sort(function (a, b) { return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0); });

  var grid = document.getElementById('categoryProductGrid');

  if (list.length === 0) {
    grid.innerHTML =
      '<div class="empty-state">' +
        '<h3>' + window.i18n('customer:catalog.empty_title') + '</h3>' +
        '<p>' + window.i18n('customer:catalog.empty_sub') + '</p>' +
        '<button type="button" class="btn btn-outline" id="emptyReset">' + window.i18n('customer:catalog.empty_reset') + '</button>' +
      '</div>';
    document.getElementById('emptyReset').addEventListener('click', clearFilters);
  } else {
    grid.innerHTML = list.map(productCardHTML).join('');
    if (typeof initLazyImages === 'function') initLazyImages();
  }

  document.getElementById('resultCount').innerHTML = window.i18n('customer:catalog.showing', { count: list.length });
}

function clearFilters() {
  state.category = 'all';
  state.maxPrice = PRICE_MAX_DA;
  state.sort = 'featured';
  document.getElementById('priceSlider').value = PRICE_MAX_DA;
  renderPriceMaxLabel();
  document.getElementById('sortSelect').value = 'featured';
  renderCategoryList();
  renderProducts();
}

document.getElementById('categoryList').addEventListener('click', function (event) {
  var button = event.target.closest('[data-cat]');
  if (!button) return;
  state.category = button.getAttribute('data-cat');
  renderCategoryList();
  renderProducts();
});

document.getElementById('priceSlider').addEventListener('input', function () {
  state.maxPrice = Number(this.value);
  renderProducts();
});

document.getElementById('sortSelect').addEventListener('change', function () {
  state.sort = this.value;
  renderProducts();
});

document.getElementById('clearFilters').addEventListener('click', clearFilters);

function openFiltersPanel() {
  var panel = document.getElementById('filtersPanel');
  var toggle = document.getElementById('filtersToggle');
  panel.classList.add('open');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  var first = panel.querySelector('button, [href], input, select, textarea');
  if (first) first.focus();
}
function closeFiltersPanel() {
  var panel = document.getElementById('filtersPanel');
  var toggle = document.getElementById('filtersToggle');
  panel.classList.remove('open');
  panel.removeAttribute('role');
  panel.removeAttribute('aria-modal');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}
document.getElementById('filtersToggle').addEventListener('click', function () {
  var panel = document.getElementById('filtersPanel');
  if (panel.classList.contains('open')) {
    closeFiltersPanel();
  } else {
    openFiltersPanel();
  }
});
document.getElementById('filtersClose').addEventListener('click', closeFiltersPanel);
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    var fp = document.getElementById('filtersPanel');
    if (fp && fp.classList.contains('open')) {
      closeFiltersPanel();
      var ft = document.getElementById('filtersToggle');
      if (ft) ft.focus();
    }
  }
});

/* ---------- PRODUCT CARDS + ROW ---------- */
function productCardHTML(product) {
  var stars = '\u2605'.repeat(Math.round(product.rating || 0));
  var badge = '';
  if (product.badge === 'sale') badge = '<span class="card-badge sale">' + window.i18n('customer:product.sale') + '</span>';
  if (product.badge === 'new')  badge = '<span class="card-badge">' + window.i18n('customer:product.new') + '</span>';
  if (!(product.stock > 0)) {
    var outBadge = '<span class="card-badge" style="background:#e41a1a;color:#fff;">' + window.i18n('customer:product.unavailable') + '</span>';
    badge = badge ? badge + ' ' + outBadge : outBadge;
  }
  var oldPrice = product.price_cents && product.old_price_cents
    ? '<s>' + price(product.old_price_cents) + '</s>' : '';
  var priceHtml = product.price_cents ? price(product.price_cents) : '';
  var inCart = isInCart(product.id);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? window.i18n('customer:product.in_cart') : window.i18n('customer:product.add');
  var btnDisabled = !(product.stock > 0) ? ' disabled style="opacity:0.5;pointer-events:none;"' : '';

  var nameEscaped = escapeHtml(product.name);
  var addLabel = !(product.stock > 0) ? window.i18n('customer:product.unavailable_label', { name: nameEscaped }) : (inCart ? window.i18n('customer:product.in_cart_label', { name: nameEscaped }) : window.i18n('customer:product.add_label', { name: nameEscaped }));
  return (
    '<div class="product-card">' +
      '<a class="card-hit" href="product.html?id=' + product.id + '" aria-label="' + window.i18n('customer:product.view', { name: nameEscaped }) + '">' +
        '<span class="card-media">' +
          badge +
          '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + (product.image || window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.jpg') + '" alt="' + nameEscaped + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
        '</span>' +
        '<span class="card-body">' +
          '<span class="card-category">' + escapeHtml(product.category_name || '') + '</span>' +
          '<span class="card-title">' + nameEscaped + '</span>' +
          '<span class="card-rating"><span aria-hidden="true">' + stars + '</span><span class="sr-only">' + window.i18n('customer:product.rated', { rating: (product.rating || 0) }) + '</span><span>(' + (product.reviews || 0) + ')</span></span>' +
        '</span>' +
      '</a>' +
      '<span class="card-price-row">' +
        '<span class="card-price">' + priceHtml + oldPrice + '</span>' +
        '<button class="' + btnClass + '" type="button" data-add="' + product.id + '" aria-label="' + addLabel + '"' + btnDisabled + '>' + btnText + '</button>' +
      '</span>' +
    '</div>'
  );
}

function renderRow(containerId, products) {
  document.getElementById(containerId).innerHTML = products.map(productCardHTML).join('');
  if (typeof initLazyImages === 'function') initLazyImages();
}

/* Delegated "Add" button clicks */
document.addEventListener('click', function (event) {
  var addButton = event.target.closest('[data-add]');
  if (!addButton) return;
  if (addButton.classList.contains('card-added')) {
    window.location.href = 'cart.html';
    return;
  }
  var pid = Number(addButton.getAttribute('data-add'));
  var product = PRODUCTS.find(function (p) { return p.id === pid; });
  if (product) {
    if (!(product.stock > 0)) return;
    addToCart(product);
    showToast(window.i18n('customer:product.added_to_cart', { name: escapeHtml(product.name) }));
  }
  addButton.textContent = window.i18n('customer:product.in_cart');
  addButton.className = 'card-added';
});

/* ---------- CART STATE ---------- */
function renderCartState() {
  document.querySelectorAll('[data-add]').forEach(function (addButton) {
    var inCart = isInCart(addButton.getAttribute('data-add'));
    addButton.textContent = inCart ? window.i18n('customer:product.in_cart') : window.i18n('customer:product.add');
    addButton.className = inCart ? 'card-added' : 'card-add';
  });
}
window.addEventListener('cart:updated', renderCartState);
window.addEventListener('pageshow', function (e) { if (e.persisted) { updateCartCount(); renderCartState(); } });
window.addEventListener('storage', function (e) { if (e.key === window.CART_KEY) { updateCartCount(); renderCartState(); } });

/* Arrow buttons for the product row */
document.querySelectorAll('[data-scroll]').forEach(function (button) {
  button.addEventListener('click', function () {
    var row = document.getElementById(button.getAttribute('data-target'));
    var direction = button.getAttribute('data-scroll') === 'left' ? -1 : 1;
    row.scrollBy({ left: direction * (row.clientWidth * 0.8), behavior: 'smooth' });
  });
});

/* ---------- UI HELPERS ---------- */

/* Mobile hamburger menu toggle */
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

/* ---------- API DATA LOADING ---------- */
function bootCategories() {
  fetch('/api/categories')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var cats = data.categories || data.data || data;
      if (!Array.isArray(cats) || !cats.length) return;
      CATEGORIES = cats.filter(function (c) { return (c.status || 'active') === 'active'; })
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
      CATEGORY_LABELS = { all: window.i18n('customer:categories.all_products') };
      CATEGORIES.forEach(function (c) {
        var slug = (c.slug || '').toLowerCase();
        if (slug) CATEGORY_LABELS[slug] = c.name || slug;
      });
      updateCategoryCounts();
      renderCategories();
      renderCategoryList();
    })
    .catch(function () {});

  fetch('/api/products/browse')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var items = data.products || data.data || data;
      if (!Array.isArray(items) || !items.length) return;
      PRODUCTS = items.map(function (p) {
        var imgs = [];
        try { imgs = typeof p.images === 'string' ? JSON.parse(p.images) : (Array.isArray(p.images) ? p.images : []); } catch (e) { imgs = []; }
        var img = (imgs[0]) ? imgs[0] : (p.image || window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.jpg');
        return {
          id: p.id,
          name: p.name || 'Untitled',
          slug: p.slug || '',
          category: p.category || '',
          category_name: (p.category_name || p.category || 'Uncategorized'),
          price_cents: p.price_cents || 0,
          old_price_cents: p.old_price_cents || null,
          stock: p.stock || 0,
          on_sale: !!p.on_sale,
          rating: parseFloat(p.rating) || 0,
          reviews: parseInt(p.reviews, 10) || 0,
          image: img,
          badge: p.on_sale ? 'sale' : null,
          colors: p.colors || [],
          sizes: p.sizes || []
        };
      });
      updateCategoryCounts();
      renderCategories();
      renderCategoryList();
      setupPriceSlider();
      renderProducts();
      renderRow('popularRow', PRODUCTS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 8));
      if (typeof initLazyImages === 'function') initLazyImages();
    })
    .catch(function () {});
}

/* Re-render text-dependent output when the language changes */
function rerenderCategories() {
  if (!PRODUCTS.length && !CATEGORIES.length) return;
  renderPriceMaxLabel();
  renderCategoryList();
  renderCategories();
  renderProducts();
  renderRow('popularRow', PRODUCTS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 8));
  if (typeof initLazyImages === 'function') initLazyImages();
}

if (window.i18n) bootCategories();
else window.addEventListener('i18n:ready', bootCategories, { once: true });
window.addEventListener('i18n:changed', rerenderCategories);