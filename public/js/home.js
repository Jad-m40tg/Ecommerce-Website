/* home.js — althome.html specific logic */

const PRODUCTS = [
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
const CART_KEY = 'boularas-cart';

function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartCount(); }
function updateCartCount() {
  const total = getCart().reduce((s, i) => s + i.qty, 0);
  const el = document.getElementById('cartCount');
  if (el) el.textContent = total;
}
function isInCart(productId) { return getCart().some(i => String(i.id) === String(productId)); }

/* ---------- UNIFIED ADD TO CART ---------- */
function addToCart(productId, options = {}) {
  const product = PRODUCTS.find(p => String(p.id) === String(productId));
  if (!product) return;

  const qty = Math.max(1, options.qty || 1);
  const color = options.color || '';
  const size  = options.size  || '';

  const cart = getCart();
  const key = String(productId) + '|' + color + '|' + size;
  const existing = cart.find(i => i.key === key);

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      key, id: product.id, name: product.name,
      price_cents: product.price_cents,
      image: product.image,
      color, size, qty
    });
  }
  saveCart(cart);
  showToast(product.name + ' added to cart');
}

/* ---------- TOAST ---------- */
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ---------- PRODUCT CARD HTML ---------- */
function productCardHTML(product) {
  const stars = '★'.repeat(Math.round(product.rating));
  let badge = '';
  if (product.badge === 'sale') badge = '<span class="card-badge sale">Sale</span>';
  if (product.badge === 'new')  badge = '<span class="card-badge">New</span>';

  const oldPrice = product.old_price_cents ? '<s>' + price(product.old_price_cents) + ' </s>' : '';
  const inCart = isInCart(product.id);
  const btnClass = inCart ? 'card-added' : 'card-add';
  const btnText = inCart ? 'In Cart' : 'Add';

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + product.id + '" class="card-media">' +
        badge +
        '<img src="' + product.image + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
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

/* ---------- INIT ---------- */
renderRow('bestRow', PRODUCTS.slice(0, 4));
renderRow('popularRow', PRODUCTS.slice(4, 8));

/* Delegated click: Add to cart */
document.addEventListener('click', function (event) {
  const addBtn = event.target.closest('[data-add]');
  if (!addBtn) return;
  if (addBtn.classList.contains('card-added')) {
    window.location.href = 'cart.html';
    return;
  }
  addToCart(addBtn.getAttribute('data-add'));
  addBtn.textContent = 'In Cart';
  addBtn.className = 'card-added';
});

/* Arrow buttons scroll */
document.querySelectorAll('[data-scroll]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const row = document.getElementById(btn.getAttribute('data-target'));
    const dir = btn.getAttribute('data-scroll') === 'left' ? -1 : 1;
    row.scrollBy({ left: dir * (row.clientWidth * 0.8), behavior: 'smooth' });
  });
});

/* Mobile menu toggle */
document.getElementById('menuToggle').addEventListener('click', function () {
  document.getElementById('navLinks').classList.toggle('open');
});

/* Reveal on scroll */
const revealObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

/* Newsletter fake submit */
document.getElementById('newsletterForm').addEventListener('submit', function (e) {
  e.preventDefault();
  document.getElementById('newsletterSuccess').style.display = 'block';
  this.reset();
});

/* Countdown timer (3 days from load) */
const saleEnd = Date.now() + 3 * 24 * 60 * 60 * 1000;
function updateCountdown() {
  let remaining = Math.max(0, saleEnd - Date.now());
  const days  = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const mins  = Math.floor((remaining % 3600000) / 60000);
  const secs  = Math.floor((remaining % 60000) / 1000);
  document.getElementById('cdDays').textContent  = days;
  document.getElementById('cdHours').textContent = hours;
  document.getElementById('cdMins').textContent  = mins;
  document.getElementById('cdSecs').textContent  = secs;
}
updateCountdown();
setInterval(updateCountdown, 1000);

/* Init cart badge */
updateCartCount();