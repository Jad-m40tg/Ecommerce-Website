/* offers.js — offers.html specific logic */

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

/* ---------- PROMOTIONS DATA ---------- */
var PROMOTIONS = [
  { icon: 'local_shipping', title: 'Free Delivery', desc: 'On all orders over 66,700 DA. White-glove delivery included \u2014 we set everything up and remove packaging.', code: 'FREESHIP' },
  { icon: 'card_giftcard', title: 'New Customer', desc: 'Welcome to Boularas! Get 15% off your first order of 26,680 DA or more when you sign up for our list.', code: 'WELCOME15' },
  { icon: 'layers', title: 'Bundle & Save', desc: 'Buy 3 or more items from the same collection and save 20% automatically at checkout. No code needed.', code: null },
  { icon: 'school', title: 'Student Discount', desc: 'Full-time students get 10% off site-wide year-round. Verify your .edu email and enjoy a better study space.', code: 'STUDENT10' },
  { icon: 'event', title: 'Seasonal Flash Sale', desc: 'New deals drop every Friday at 10 AM. A different category goes on sale each week \u2014 check back often.', code: null },
  { icon: 'group_add', title: 'Refer a Friend', desc: 'Give 6,670 DA, get 6,670 DA. When a friend places their first order over 40,020 DA using your referral link, you both earn credit.', code: 'GIFT50' }
];

function renderPromotions() {
  var grid = document.getElementById('promoGrid');
  grid.innerHTML = PROMOTIONS.map(function (promo) {
    var codeHtml = promo.code
      ? '<div class="promo-code"><span class="code">' + escapeHtml(promo.code) + '</span><button class="copy-btn" type="button" data-code="' + promo.code + '">Copy</button></div>'
      : '';
    return (
      '<article class="promo-card reveal">' +
        '<div class="promo-icon" aria-hidden="true"><span class="material-symbols-outlined">' + promo.icon + '</span></div>' +
        '<h3>' + escapeHtml(promo.title) + '</h3>' +
        '<p>' + promo.desc + '</p>' +
        codeHtml +
      '</article>'
    );
  }).join('');
}

/* ---------- PRODUCT CARDS ---------- */
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
        '<img src="' + (product.image || window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.png') + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
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

/* Copy promo code to clipboard */
document.addEventListener('click', function (event) {
  var copyBtn = event.target.closest('[data-code]');
  if (!copyBtn) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(copyBtn.getAttribute('data-code')).then(function () {
      showToast('Code copied to clipboard!');
    });
  } else {
    showToast('Code copied to clipboard!');
  }
});

/* Arrow buttons for the sale row */
document.querySelectorAll('[data-scroll]').forEach(function (button) {
  button.addEventListener('click', function () {
    var row = document.getElementById(button.getAttribute('data-target'));
    var direction = button.getAttribute('data-scroll') === 'left' ? -1 : 1;
    row.scrollBy({ left: direction * (row.clientWidth * 0.8), behavior: 'smooth' });
  });
});

/* ---------- COUNTDOWN TIMER ---------- */
var COUNTDOWN_KEY = 'boularas-sale-end';
var DEFAULT_DURATION = 3 * 24 * 60 * 60 * 1000;

function getSaleEndDate() {
  var stored = localStorage.getItem(COUNTDOWN_KEY);
  if (stored) {
    var ts = parseInt(stored, 10);
    if (!isNaN(ts) && ts > Date.now()) return ts;
  }
  var end = Date.now() + DEFAULT_DURATION;
  localStorage.setItem(COUNTDOWN_KEY, String(end));
  return end;
}

var saleEnd = getSaleEndDate();

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

/* ---------- RENDER PROMOTIONS ---------- */
renderPromotions();

/* ---------- API DATA ---------- */
fetch('/api/products/browse/on-sale')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    var items = data.products || data.data || data;
    if (!Array.isArray(items) || !items.length) return;
    PRODUCTS = items.map(function (p) {
      var imgs = []; try { imgs = JSON.parse(p.images || '[]'); } catch(e) { imgs = []; }
      var img = imgs[0] || p.image || window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.png';
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
        badge: 'sale'
      };
    });
    renderRow('saleRow', PRODUCTS);
  })
  .catch(function () {});