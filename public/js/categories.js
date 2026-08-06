/* categories.js — categories.html specific logic */

var CATEGORIES = [];
var PRODUCTS = [];

/* ---------- CART HELPERS (unified) ---------- */
var CART_KEY = 'boularas-cart';

function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartCount(); }
function addToCart(product) {
  var cart = getCart();
  var existing = cart.find(function (item) { return item.id === product.id; });
  if (existing) { existing.qty += 1; }
  else { cart.push({ id: product.id, name: product.name, price_cents: product.price_cents, image: product.image, key: String(product.id), qty: 1 }); }
  saveCart(cart);
  showToast(product.name + ' added to cart');
}
function updateCartCount() {
  var total = getCart().reduce(function (sum, item) { return sum + item.qty; }, 0);
  document.getElementById('cartCount').textContent = total;
}
function isInCart(productId) {
  return getCart().some(function (item) { return item.id === productId; });
}

/* ---------- RENDER CATEGORIES ---------- */
function renderCategories() {
  var grid = document.getElementById('categoriesGrid');
  grid.innerHTML = CATEGORIES.map(function (cat) {
    var slug = cat.slug || '';
    var count = cat.product_count || 0;
    var img = cat.image || '/assets/furn-sofa.png';
    return (
      '<a href="products.html?category=' + encodeURIComponent(slug) + '" class="category-card reveal">' +
        '<img class="card-img" src="' + img + '" alt="' + escapeHtml(cat.name) + '" loading="lazy" />' +
        '<div class="card-body">' +
          '<h3>' + escapeHtml(cat.name) + '</h3>' +
          '<span class="count">' + count + ' product' + (count !== 1 ? 's' : '') + '</span>' +
          '<div class="arrow" aria-hidden="true">&rarr;</div>' +
        '</div>' +
      '</a>'
    );
  }).join('');
  document.querySelectorAll('.category-card.reveal').forEach(function (el) { revealObserver.observe(el); });
}

/* ---------- PRODUCT CARDS + ROW ---------- */
function productCardHTML(product) {
  var stars = '\u2605'.repeat(Math.round(product.rating || 0));
  var badge = '';
  if (product.badge === 'sale') badge = '<span class="card-badge sale">Sale</span>';
  if (product.badge === 'new')  badge = '<span class="card-badge">New</span>';
  var oldPrice = product.price_cents && product.old_price_cents
    ? '<s>' + price(product.old_price_cents) + '</s>' : '';
  var priceHtml = product.price_cents ? price(product.price_cents) : '';
  var inCart = isInCart(product.id);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? 'In Cart' : 'Add';

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + product.id + '" class="card-media">' +
        badge +
        '<img src="' + (product.image || '/assets/furn-sofa.png') + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
      '</a>' +
      '<div class="card-body">' +
        '<div class="card-category">' + escapeHtml(product.category_name || '') + '</div>' +
        '<h3><a href="product.html?id=' + product.id + '">' + escapeHtml(product.name) + '</a></h3>' +
        '<div class="card-rating">' + stars + '<span>(' + (product.reviews || 0) + ')</span></div>' +
        '<div class="card-price-row">' +
          '<div class="card-price">' + priceHtml + oldPrice + '</div>' +
          '<button class="' + btnClass + '" type="button" data-add="' + product.id + '">' + btnText + '</button>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

function renderRow(containerId, products) {
  document.getElementById(containerId).innerHTML = products.map(productCardHTML).join('');
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
  if (product) addToCart(product);
  addButton.textContent = 'In Cart';
  addButton.className = 'card-added';
});

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
  document.getElementById('navLinks').classList.toggle('open');
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
fetch('/api/categories')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    var cats = data.categories || data.data || data;
    if (!Array.isArray(cats) || !cats.length) return;
    CATEGORIES = cats.filter(function (c) { return c.status !== 'inactive'; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    renderCategories();
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
      var img = (imgs[0]) ? imgs[0] : (p.image || '/assets/furn-sofa.png');
      return {
        id: p.id,
        name: p.name || 'Untitled',
        slug: p.slug || '',
        category_name: (p.category_name || p.category || 'Uncategorized'),
        price_cents: p.price_cents || 0,
        old_price_cents: p.old_price_cents || null,
        on_sale: !!p.on_sale,
        rating: parseFloat(p.rating) || 0,
        reviews: parseInt(p.reviews, 10) || 0,
        image: img,
        badge: p.on_sale ? 'sale' : null
      };
    });
    var counts = {};
    PRODUCTS.forEach(function (p) {
      var key = (p.category_name || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    CATEGORIES.forEach(function (cat) {
      var key = (cat.name || '').toLowerCase();
      cat.product_count = counts[key] || 0;
    });
    renderCategories();
    var shuffled = PRODUCTS.slice().sort(function () { return Math.random() - 0.5; });
    renderRow('popularRow', shuffled.slice(0, 8));
  })
  .catch(function () {});