/* products.js — products.html specific logic */

var PRODUCTS = [];
var CATEGORY_LABELS = { all: 'All Products' };
var PRICE_MAX_DA = null;
var PRICE_MAX_LABEL = '';

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
function isOnSale(product) {
  return !!(product.on_sale || product.on_sale === 1);
}

/* The base set every count derives from: everything fetched, sale view narrows it */
function getBaseProducts() {
  return state.sale ? PRODUCTS.filter(isOnSale) : PRODUCTS;
}

/* Slider scale from real data: top is the true max price (step-rounded up) */
function setupPriceSlider() {
  var base = getBaseProducts();
  var maxCents = 0;
  base.forEach(function (p) {
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
  document.getElementById('priceMaxLabel').textContent = PRICE_MAX_LABEL;
}

/* Format the price-slider max label in DZD */
function sliderLabel(dzd) {
  return Number(dzd).toLocaleString('en-US') + ' DA';
}

/* ---------- CATALOG STATE ---------- */
const params = new URLSearchParams(window.location.search);
const state = {
  category: params.get('category') || 'all',
  sale: params.get('sale') || null,
  maxPrice: null,
  sort: 'featured'
};

var saleBanner = document.getElementById('saleBanner');
if (saleBanner && state.sale) saleBanner.style.display = '';

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

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + product.id + '" class="card-media">' +
        badge +
        '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + img + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
      '</a>' +
      '<div class="card-body">' +
        '<div class="card-category">' + escapeHtml(cat) + '</div>' +
        '<h3><a href="product.html?id=' + product.id + '">' + escapeHtml(product.name) + '</a></h3>' +
        '<div class="card-price-row">' +
          '<div class="card-price">' + price(product.price_cents || 0) + oldPriceHTML + '</div>' +
          '<button class="' + btnClass + '" type="button" data-add="' + product.id + '"' + btnDisabled + '>' + btnText + '</button>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

function renderCategoryList() {
  var base = getBaseProducts();
  var counts = { all: base.length };
  base.forEach(function (p) {
    var cat = getProductCategory(p).toLowerCase();
    counts[cat] = (counts[cat] || 0) + 1;
  });

  var items = Object.keys(CATEGORY_LABELS).map(function (key) {
    var isActive = state.category === key ? ' active' : '';
    var count = counts[key] || 0;
    return (
      '<li><button type="button" class="' + isActive.trim() + '" data-cat="' + key + '">' +
        '<span>' + CATEGORY_LABELS[key] + '</span>' +
        '<small>' + count + '</small>' +
      '</button></li>'
    );
  }).join('');

  document.getElementById('categoryList').innerHTML = items;
}

function renderProducts() {
  if (!PRODUCTS.length) return;
  var list = PRODUCTS.slice();

  if (state.sale) {
    list = list.filter(isOnSale);
  }

  if (state.category !== 'all') {
    list = list.filter(function (p) {
      return getProductCategory(p).toLowerCase() === state.category;
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

  var grid = document.getElementById('productGrid');

  if (list.length === 0) {
    grid.innerHTML =
      '<div class="empty-state">' +
        '<h3>Nothing matches those filters</h3>' +
        '<p>Try widening the price range or picking another category.</p>' +
        '<button type="button" class="btn btn-outline" id="emptyReset">Clear filters</button>' +
      '</div>';
    document.getElementById('emptyReset').addEventListener('click', clearFilters);
  } else {
    grid.innerHTML = list.map(productCardHTML).join('');
    if (typeof initLazyImages === 'function') initLazyImages();
  }

  document.getElementById('resultCount').textContent = list.length;
}

function clearFilters() {
  state.category = 'all';
  state.maxPrice = PRICE_MAX_DA;
  state.sort = 'featured';
  document.getElementById('priceSlider').value = PRICE_MAX_DA;
  document.getElementById('priceMaxLabel').textContent = PRICE_MAX_LABEL;
  document.getElementById('sortSelect').value = 'featured';
  renderCategoryList();
  renderProducts();
}

/* Delegated click: category buttons in the sidebar */
document.getElementById('categoryList').addEventListener('click', function (event) {
  const button = event.target.closest('[data-cat]');
  if (!button) return;
  state.category = button.getAttribute('data-cat');
  renderCategoryList();
  renderProducts();
});

/* Price slider */
document.getElementById('priceSlider').addEventListener('input', function () {
  state.maxPrice = Number(this.value);
  renderProducts();
});

/* Sort */
document.getElementById('sortSelect').addEventListener('change', function () {
  state.sort = this.value;
  renderProducts();
});

document.getElementById('clearFilters').addEventListener('click', clearFilters);

/* Delegated click: any "Add" button on any product card */
document.addEventListener('click', function (event) {
  const addButton = event.target.closest('[data-add]');
  if (!addButton) return;
  if (addButton.classList.contains('card-added')) {
    window.location.href = 'cart.html';
    return;
  }
  const product = PRODUCTS.find(function (p) { return String(p.id) === String(addButton.getAttribute('data-add')); });
  if (!product) return;
  if (!(product.stock > 0)) return;
  addToCart(product);
  showToast(product.name + ' added to cart');
  addButton.textContent = 'In Cart';
  addButton.className = 'card-added';
});

/* Keep add buttons in sync with cart state */
function renderCartState() {
  document.querySelectorAll('[data-add]').forEach(function (btn) {
    const inCart = isInCart(btn.getAttribute('data-add'));
    btn.textContent = inCart ? 'In Cart' : 'Add';
    btn.className = inCart ? 'card-added' : 'card-add';
  });
}
window.addEventListener('cart:updated', renderCartState);
window.addEventListener('pageshow', function (e) { if (e.persisted) { updateCartCount(); renderCartState(); } });
window.addEventListener('storage', function (e) { if (e.key === window.CART_KEY) { updateCartCount(); renderCartState(); } });

/* Initial paint */
renderCategoryList();
renderProducts();

/* ---------- UI HELPERS ---------- */

/* Mobile navbar toggle */
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

/* Mobile filters panel toggle */
document.getElementById('filtersToggle').addEventListener('click', function () {
  document.getElementById('filtersPanel').classList.toggle('open');
});
document.getElementById('filtersClose').addEventListener('click', function () {
  document.getElementById('filtersPanel').classList.remove('open');
});

/* Reveal-on-scroll (same behavior as homepage) */
const revealObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

/* Toast */
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
}

/* Init cart badge */
updateCartCount();

/* ---------- API DATA LOADING ---------- */
(function () {
  Promise.all([
    fetch('/api/products/browse').then(function (r) { return r.json(); }),
    fetch('/api/categories').then(function (r) { return r.json(); }).catch(function () { return []; })
  ]).then(function (results) {
    var productData = results[0];
    var categoryData = results[1];

    var items = productData.products || productData.data || productData;
    if (Array.isArray(items) && items.length) {
      PRODUCTS = items;
    }

    var cats = Array.isArray(categoryData) ? categoryData : (categoryData.categories || categoryData.data || []);
    if (Array.isArray(cats)) {
      CATEGORY_LABELS = { all: 'All Products' };
      var filtered = cats.filter(function(c){return (c.status||'active')==='active'});
      filtered.forEach(function (c) {
        var slug = (c.slug || c.name || '').toLowerCase();
        if (slug) CATEGORY_LABELS[slug] = c.name || slug;
      });
    }

    setupPriceSlider();
    renderCategoryList();
    renderProducts();
    if (typeof initLazyImages === 'function') initLazyImages();
  }).catch(function () {});
})();