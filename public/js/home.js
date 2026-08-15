/* home.js — althome.html specific logic */

var _allProducts = [];

/* ---------- CART HELPERS (unified) ---------- */
var CART_KEY = 'boularas-cart';

function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartCount(); }
function updateCartCount() {
  var total = getCart().reduce(function (s, i) { return s + i.qty; }, 0);
  var el = document.getElementById('cartCount');
  if (el) el.textContent = total;
}
function isInCart(productId) { return getCart().some(function (i) { return String(i.id) === String(productId); }); }

/* ---------- UNIFIED ADD TO CART ---------- */
function addToCart(productId, options) {
  options = options || {};
  var product = _allProducts.find(function (p) { return String(p.id) === String(productId); });
  if (!product) return;

  var qty = Math.max(1, options.qty || 1);
  var color = options.color || '';
  var size  = options.size  || '';

  var cart = getCart();
  var key = String(productId) + '|' + color + '|' + size;
  var existing = cart.find(function (i) { return i.key === key; });

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      key: key, id: product.id, name: product.name,
      price_cents: product.price_cents,
      image: product._image,
      color: color, size: size, qty: qty
    });
  }
  saveCart(cart);
  showToast(product.name + ' added to cart');
}

/* ---------- TOAST ---------- */
var toastTimer = null;
function showToast(msg) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
}

/* ---------- PRODUCT CARD HTML ---------- */
function productCardHTML(product) {
  var rating = product.rating || 4.5;
  var reviews = product.reviews || 0;
  var stars = '';
  for (var i = 0; i < Math.round(rating); i++) stars += '\u2605';

  var badge = '';
  if (product.badge === 'sale') badge = '<span class="card-badge sale">Sale</span>';
  if (product.badge === 'new')  badge = '<span class="card-badge">New</span>';

  var oldPrice = product.old_price_cents ? '<s>' + price(product.old_price_cents) + ' </s>' : '';
  var inCart = isInCart(product.id);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? 'In Cart' : 'Add';

  return (
    '<article class="product-card">' +
      '<a href="product.html?id=' + product.id + '" class="card-media">' +
        badge +
        '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + product._image + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
      '</a>' +
      '<div class="card-body">' +
        '<div class="card-category">' + escapeHtml(product.category) + '</div>' +
        '<h3><a href="product.html?id=' + product.id + '">' + escapeHtml(product.name) + '</a></h3>' +
        '<div class="card-rating">' + stars + '<span>(' + reviews + ')</span></div>' +
        '<div class="card-price-row">' +
          '<div class="card-price">' + price(product.price_cents) + oldPrice + '</div>' +
          '<button class="' + btnClass + '" type="button" data-add="' + product.id + '">' + btnText + '</button>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

function renderRow(containerId, products) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!products || products.length === 0) {
    el.innerHTML = '<p style="padding:1rem;color:#999;">No products to show yet.</p>';
    return;
  }
  el.innerHTML = products.map(productCardHTML).join('');
}

/* ---------- FETCH & RENDER HOME PRODUCTS ---------- */
function loadHomeProducts() {
  fetch('/api/products/browse?limit=9999').then(function (r) { return r.json(); }).then(function (data) {
    var products = data.products || data || [];

    /* Parse images JSON string + derive badge from featured/on_sale */
    products = products.filter(function (p) { return p.status === 'active'; }).map(function (p) {
      var imgs = [];
      try { imgs = JSON.parse(p.images || '[]'); } catch { imgs = []; }
      p._image = (imgs.length > 0 ? imgs[0] : (window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.png'));
      p.badge = p.on_sale ? 'sale' : (p.featured ? 'new' : null);
      return p;
    });

    _allProducts = products;

    /* Group by display_section with fallback */
    var bestSellers = products.filter(function (p) {
      return p.display_section === 'best_sellers' || (!p.display_section && p.featured);
    }).slice(0, 8);

    var popular = products.filter(function (p) {
      return p.display_section === 'popular' || (!p.display_section && p.on_sale);
    }).slice(0, 8);

    var newArrivals = products.filter(function (p) {
      return p.display_section === 'new_arrivals';
    }).slice(0, 8);

    /* If display_section groups are empty, fall back to newest products */
    if (newArrivals.length === 0) {
      newArrivals = products.slice().sort(function (a, b) {
        return (b.created_at || '').localeCompare(a.created_at || '');
      }).slice(0, 8);
    }
    if (bestSellers.length === 0) bestSellers = products.slice(0, 4);
    if (popular.length === 0) popular = products.slice(4, 8);

    renderRow('bestRow', bestSellers);
    renderRow('popularRow', popular);
    renderRow('newArrivalsRow', newArrivals);
    if (typeof initLazyImages === 'function') initLazyImages();

    /* Category counts */
    var cats = { 'living-room': 0, 'dining-room': 0, 'bedroom': 0, 'lighting': 0 };
    products.forEach(function (p) {
      if (cats.hasOwnProperty(p.category)) cats[p.category]++;
    });
    Object.keys(cats).forEach(function (key) {
      var el = document.getElementById('cat-' + key + '-count');
      if (el) el.textContent = cats[key] + ' items';
    });
  }).catch(function () {
    /* On error, leave skeleton placeholders or show message */
    renderRow('bestRow', []);
    renderRow('popularRow', []);
    renderRow('newArrivalsRow', []);
  });
}

/* ---------- INIT ---------- */
loadHomeProducts();

/* Delegated click: Add to cart */
document.addEventListener('click', function (event) {
  var addBtn = event.target.closest('[data-add]');
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
    var row = document.getElementById(btn.getAttribute('data-target'));
    var dir = btn.getAttribute('data-scroll') === 'left' ? -1 : 1;
    row.scrollBy({ left: dir * (row.clientWidth * 0.8), behavior: 'smooth' });
  });
});

/* Mobile menu toggle */
document.getElementById('menuToggle').addEventListener('click', function () {
  document.getElementById('navLinks').classList.toggle('open');
});

/* Reveal on scroll */
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
document.getElementById('newsletterForm').addEventListener('submit', function (e) {
  e.preventDefault();
  document.getElementById('newsletterSuccess').style.display = 'block';
  this.reset();
});

/* Countdown timer (defaults to 3 days from load, driven by the active sale when one exists) */
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

/* Load the active sale into the LIMITED OFFER banner (soonest end date wins). */
function loadActiveSale() {
  fetch('/api/sales/active').then(function (r) { return r.json(); }).then(function (data) {
    var sales = data.sales || [];
    if (sales.length === 0) return;
    var sale = sales[0]; // server sorts by end_at ascending
    var end = new Date(sale.end_at).getTime();
    if (isNaN(end)) return;
    saleEnd = end;
    updateCountdown();
    var titleEl = document.getElementById('offerTitle');
    var descEl  = document.getElementById('offerDesc');
    var shopEl  = document.getElementById('offerShop');
    var imgEl   = document.getElementById('offerImg');
    var name = sale.product_name || 'selected furniture';
    if (titleEl) titleEl.textContent = 'On Sale Now \u2014 ' + name;
    if (descEl) descEl.textContent = 'Save on ' + name + ' while stock lasts. The deal ends when the timer runs out.';
    if (shopEl && sale.product_id) shopEl.href = 'product.html?id=' + sale.product_id;
    if (imgEl && sale.banner_image_url) imgEl.src = sale.banner_image_url;
  }).catch(function () {});
}
loadActiveSale();

/* Init cart badge */
updateCartCount();
