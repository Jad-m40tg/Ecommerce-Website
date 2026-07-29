/* products.js — products.html specific logic */

var PRODUCTS = [];
var CATEGORY_LABELS = { all: 'All Products' };

function getProductImage(product) {
  try {
    var imgs = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
    if (Array.isArray(imgs) && imgs.length && imgs[0]) {
      return imgs[0];
    }
    return '/assets/furn-sofa.png';
  } catch (e) { return '/assets/furn-sofa.png'; }
}
function getProductCategory(product) {
  return (product.category || product.category_name || 'uncategorized');
}

/* ---------- CART HELPERS (unified) ---------- */
var CART_KEY = 'havenwood-cart';

function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartCount(); }
function addToCart(productId) {
  var product = PRODUCTS.find(function (p) { return String(p.id) === String(productId); });
  if (!product) return;
  var cart = getCart();
  var existing = cart.find(function (item) { return String(item.id) === String(productId); });
  if (existing) { existing.qty += 1; }
  else {
    cart.push({ id: product.id, name: product.name, price_cents: product.price_cents, image: getProductImage(product), key: String(product.id), qty: 1 });
  }
  saveCart(cart);
  showToast(product.name + ' added to cart');
}
function updateCartCount() {
  var total = getCart().reduce(function (sum, item) { return sum + item.qty; }, 0);
  document.getElementById('cartCount').textContent = total;
}
function isInCart(productId) {
  return getCart().some(function (item) { return String(item.id) === String(productId); });
}

/* ---------- CATALOG STATE ---------- */
const params = new URLSearchParams(window.location.search);
const state = {
  category: params.get('category') || 'all',
  maxPrice: 1600,
  sort: 'featured'
};

function productCardHTML(product) {
  var img = getProductImage(product);
  var cat = getProductCategory(product);
  var isSale = product.on_sale || product.on_sale === 1;
  var oldPrice = product.old_price_cents ? product.old_price_cents : null;
  var badge = '';
  if (isSale && oldPrice) badge = '<span class="card-badge sale">Sale</span>';
  else if (product.featured) badge = '<span class="card-badge">Featured</span>';
  var oldPriceHTML = oldPrice ? '<s>' + price(oldPrice) + '</s>' : '';
  var inCart = isInCart(product.id);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? 'In Cart' : 'Add';

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + product.id + '" class="card-media">' +
        badge +
        '<img src="' + img + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
      '</a>' +
      '<div class="card-body">' +
        '<div class="card-category">' + escapeHtml(cat) + '</div>' +
        '<h3><a href="product.html?id=' + product.id + '">' + escapeHtml(product.name) + '</a></h3>' +
        '<div class="card-price-row">' +
          '<div class="card-price">' + price(product.price_cents || 0) + oldPriceHTML + '</div>' +
          '<button class="' + btnClass + '" type="button" data-add="' + product.id + '">' + btnText + '</button>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

function renderCategoryList() {
  var counts = { all: PRODUCTS.length };
  PRODUCTS.forEach(function (p) {
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
  var list = PRODUCTS.slice();

  if (state.category !== 'all') {
    list = list.filter(function (p) {
      return getProductCategory(p).toLowerCase() === state.category;
    });
  }
  list = list.filter(function (p) {
    return (p.price_cents || 0) <= state.maxPrice * 100;
  });

  if (state.sort === 'price-asc')  list.sort(function (a, b) { return (a.price_cents || 0) - (b.price_cents || 0); });
  if (state.sort === 'price-desc') list.sort(function (a, b) { return (b.price_cents || 0) - (a.price_cents || 0); });
  if (state.sort === 'name')       list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

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
  }

  document.getElementById('resultCount').textContent = list.length;
}

function clearFilters() {
  state.category = 'all';
  state.maxPrice = 1600;
  state.sort = 'featured';
  document.getElementById('priceSlider').value = 1600;
  document.getElementById('priceMaxLabel').textContent = 1600;
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
  document.getElementById('priceMaxLabel').textContent = this.value;
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
  addToCart(addButton.getAttribute('data-add'));
  addButton.textContent = 'In Cart';
  addButton.className = 'card-added';
});

/* Initial paint */
renderCategoryList();
renderProducts();

/* ---------- UI HELPERS ---------- */

/* Mobile navbar toggle */
document.getElementById('menuToggle').addEventListener('click', function () {
  document.getElementById('navLinks').classList.toggle('open');
});

/* Mobile filters panel toggle */
document.getElementById('filtersToggle').addEventListener('click', function () {
  document.getElementById('filtersPanel').classList.toggle('open');
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
      cats.forEach(function (c) {
        var slug = (c.slug || c.name || '').toLowerCase();
        if (slug) CATEGORY_LABELS[slug] = c.name || slug;
      });
    }

    renderCategoryList();
    renderProducts();
  }).catch(function () {});
})();