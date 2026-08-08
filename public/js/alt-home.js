/* alt-home.js — fable.html specific logic */

var PRODUCTS = [
  { id: 'sofa-marlow',  name: 'Marlow Linen Sofa',      category: 'seating',  price_cents: 129900, old_price_cents: 159900, rating: 4.9, reviews: 214, image: '/assets/furn-sofa.png',  badge: 'sale' },
  { id: 'chair-sage',   name: 'Sage Curve Armchair',    category: 'seating',  price_cents: 54900,  old_price_cents: null, rating: 4.8, reviews: 167, image: '/assets/furn-chair.png', badge: 'new'  },
  { id: 'table-arden',  name: 'Arden Oak Dining Table', category: 'tables',   price_cents: 89900,  old_price_cents: null, rating: 4.9, reviews: 132, image: '/assets/furn-table.png', badge: null   },
  { id: 'desk-walden',  name: 'Walden Walnut Desk',     category: 'tables',   price_cents: 64900,  old_price_cents: 74900,  rating: 4.7, reviews: 98,  image: '/assets/furn-desk.png',  badge: 'sale' },
  { id: 'bed-haven',    name: 'Haven Upholstered Bed',  category: 'bedroom',  price_cents: 109900, old_price_cents: null, rating: 4.8, reviews: 143, image: '/assets/furn-bed.png',   badge: null   },
  { id: 'lamp-lumen',   name: 'Lumen Linen Floor Lamp', category: 'lighting', price_cents: 22900,  old_price_cents: null, rating: 4.6, reviews: 88,  image: '/assets/furn-lamp.png',  badge: 'new'  },
  { id: 'shelf-nordic', name: 'Nordic Oak Bookshelf',   category: 'tables',   price_cents: 47900,  old_price_cents: null, rating: 4.7, reviews: 76,  image: '/assets/furn-shelf.png', badge: null   },
  { id: 'decor-terra',  name: 'Terra Vase Duo',         category: 'lighting', price_cents: 8900,   old_price_cents: 11900,  rating: 4.8, reviews: 201, image: '/assets/furn-decor.png', badge: 'sale' }
];

/* ---------- CART HELPERS (unified) ---------- */
var CART_KEY = 'boularas-cart';

function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartCount(); }
function addToCart(productId) {
  var product = PRODUCTS.find(function (p) { return p.id === productId; });
  if (!product) return;
  var cart = getCart();
  var existing = cart.find(function (item) { return item.id === productId; });
  if (existing) { existing.qty += 1; }
  else {
    cart.push({ id: product.id, name: product.name, price_cents: product.price_cents, image: product.image, key: String(product.id), qty: 1 });
  }
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

/* ---------- PRODUCT CARD HTML ---------- */
function productCardHTML(product) {
  var stars = '\u2605'.repeat(Math.round(product.rating));
  var badge = '';
  if (product.badge === 'sale') badge = '<span class="card-badge sale">Sale</span>';
  if (product.badge === 'new')  badge = '<span class="card-badge">New</span>';
  var oldPrice = product.old_price_cents ? '<s>' + price(product.old_price_cents) + '</s>' : '';
  var inCart = isInCart(product.id);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? 'In Cart' : 'Add';

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + product.id + '" class="card-media">' +
        badge +
        '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + product.image + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
      '</a>' +
      '<div class="card-body">' +
        '<div class="card-category">' + escapeHtml(product.category) + '</div>' +
        '<h3><a href="product.html?id=' + product.id + '">' + escapeHtml(product.name) + '</a></h3>' +
        '<div class="card-rating">' + stars + '<span>(' + product.reviews + ')</span></div>' +
        '<div class="card-price-row">' +
          '<div class="card-price">' + price(product.price_cents) + oldPrice + '</div>' +
          '<button class="' + btnClass + '" type="button" data-add="' + product.id + '">' + btnText + '</button>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

function renderRow(containerId, products) {
  document.getElementById(containerId).innerHTML = products.map(productCardHTML).join('');
}

renderRow('bestRow', PRODUCTS.slice(0, 4));
renderRow('popularRow', PRODUCTS.slice(4, 8));

/* Delegated click: Add to cart */
document.addEventListener('click', function (event) {
  var addButton = event.target.closest('[data-add]');
  if (!addButton) return;
  if (addButton.classList.contains('card-added')) {
    window.location.href = 'cart.html';
    return;
  }
  addToCart(addButton.getAttribute('data-add'));
  addButton.textContent = 'In Cart';
  addButton.className = 'card-added';
});

/* Arrow buttons scroll */
document.querySelectorAll('[data-scroll]').forEach(function (button) {
  button.addEventListener('click', function () {
    var row = document.getElementById(button.getAttribute('data-target'));
    var direction = button.getAttribute('data-scroll') === 'left' ? -1 : 1;
    row.scrollBy({ left: direction * (row.clientWidth * 0.8), behavior: 'smooth' });
  });
});

/* ---------- COUNTDOWN TIMER ---------- */
var saleEnd = Date.now() + 3 * 24 * 60 * 60 * 1000;
function updateCountdown() {
  var remaining = Math.max(0, saleEnd - Date.now());
  var days  = Math.floor(remaining / 86400000);
  var hours = Math.floor((remaining % 86400000) / 3600000);
  var mins  = Math.floor((remaining % 3600000) / 60000);
  var secs  = Math.floor((remaining % 60000) / 1000);
  document.getElementById('cdDays').textContent  = days;
  document.getElementById('cdHours').textContent = hours;
  document.getElementById('cdMins').textContent  = mins;
  document.getElementById('cdSecs').textContent  = secs;
}
updateCountdown();
setInterval(updateCountdown, 1000);

/* ---------- UI HELPERS ---------- */

/* Mobile menu toggle */
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

/* Newsletter fake submit */
document.getElementById('newsletterForm').addEventListener('submit', function (event) {
  event.preventDefault();
  document.getElementById('newsletterSuccess').style.display = 'block';
  this.reset();
});

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
  fetch('/api/products/browse')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var items = data.products || data.data || data;
      if (!Array.isArray(items) || !items.length) return;
      PRODUCTS.length = 0;
      items.forEach(function (p) {
        PRODUCTS.push({
          id: String(p.id || p.slug || ''),
          name: p.name || 'Untitled',
          category: (p.category || p.category_name || 'uncategorized').toLowerCase(),
          price_cents: p.price_cents || Math.round((p.price || 0) * 100),
          old_price_cents: p.compare_at_price_cents || p.old_price_cents || null,
          rating: parseFloat(p.rating) || 4.7,
          reviews: parseInt(p.reviews, 10) || Math.floor(Math.random() * 200) + 10,
          image: (p.images && p.images[0]) ? p.images[0] : (p.image || window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.png'),
          badge: (p.compare_at_price_cents || p.on_sale) ? 'sale' : (p.is_new ? 'new' : null)
        });
      });
      renderRow('bestRow', PRODUCTS.slice(0, 4));
      renderRow('popularRow', PRODUCTS.slice(4, 8));
      if (typeof initLazyImages === 'function') initLazyImages();
    })
    .catch(function () {});
})();