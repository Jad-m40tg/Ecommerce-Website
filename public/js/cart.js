/* cart.js â€” cart.html specific logic */

/* ---------- 2. TOTALS MATH ---------- */
var SHIPPING_FLAT   = 999;    // default, overridden by API
var FREE_SHIP_OVER  = 9999;   // default, overridden by API
var TAX_RATE        = 0;

var storeSettings = {};
fetch('/api/settings').then(function (r) { return r.json(); }).then(function (s) {
  storeSettings = s || {};
  if (s.delivery_fee_cents != null) SHIPPING_FLAT = s.delivery_fee_cents;
  if (s.free_delivery_threshold_cents != null) FREE_SHIP_OVER = s.free_delivery_threshold_cents;
  if (getCart().length > 0) renderCart();
}).catch(function () {});

/* ---------- 2.5. PRODUCT CATALOG (live image + stock) ---------- */
var PRODUCT_CATALOG = {};

function loadCatalog() {
  return fetch('/api/products/browse?limit=1000')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var items = data.products || data.data || data;
      if (Array.isArray(items)) {
        items.forEach(function (p) { PRODUCT_CATALOG[String(p.id)] = p; });
      }
      renderCart();
    })
    .catch(function () {});
}

/* Stock for a cart item: null means unknown (no limit beyond 99) */
function stockOf(item) {
  var prod = PRODUCT_CATALOG[String(item.id)];
  if (prod && typeof prod.stock === 'number' && prod.stock >= 0) return prod.stock;
  return null;
}

/* Max purchasable qty for a cart item */
function maxQtyOf(item) {
  var stock = stockOf(item);
  if (stock == null) return 99;
  return Math.max(0, Math.min(stock, 99));
}

var PROMOS = {
  BOUL10:   { label: '10% off subtotal', pct: 0.10 },
  WELCOME5: { label: '5% off subtotal',  pct: 0.05 }
};
var PROMO_STORAGE_KEY = 'boularas-promo';
var appliedPromo = null;

function savePromo(promo) {
  if (promo) { localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(promo)); }
  else { localStorage.removeItem(PROMO_STORAGE_KEY); }
}
function loadPromo() {
  try { return JSON.parse(localStorage.getItem(PROMO_STORAGE_KEY)) || null; } catch { return null; }
}

/* Restore promo from previous page */
appliedPromo = loadPromo();

function calcTotals(cart) {
  var subtotal = cart.reduce(function (s, i) { return s + (i.price_cents || 0) * i.qty; }, 0);
  var shipping = cart.length === 0 ? 0 : (subtotal >= FREE_SHIP_OVER ? 0 : SHIPPING_FLAT);
  var discount = appliedPromo ? Math.round(subtotal * appliedPromo.pct) : 0;
  var taxable  = Math.max(0, subtotal - discount);
  var tax      = Math.round(taxable * TAX_RATE);
  var total    = taxable + shipping + tax;
  return { subtotal: subtotal, shipping: shipping, discount: discount, tax: tax, total: total };
}

/* Color dot rendering uses window.colorHex from utils.js (loaded first) */

/* ---------- 4. RENDER ---------- */

function renderCart() {
  var cart = getCart();
  var list = document.getElementById('cartItems');
  var subtitle = document.getElementById('pageSubtitle');

  if (cart.length === 0) {
    subtitle.textContent = window.i18n('customer:cart.empty_subtitle');
    list.innerHTML =
      '<div class="empty-cart">' +
        '<div class="emoji" aria-hidden="true"><span class="material-symbols-outlined" style="font-size:48px;">shopping_bag</span></div>' +
        '<h2>' + window.i18n('customer:cart.empty_title') + '</h2>' +
        '<p>' + window.i18n('customer:cart.empty_sub') + '</p>' +
        '<a href="products.html" class="btn btn-primary">' + window.i18n('customer:cart.browse_shop') + '</a>' +
      '</div>';
    renderSummary();
    return;
  }

  var itemCount = cart.reduce(function (s, i) { return s + i.qty; }, 0);
  subtitle.textContent = window.i18n('customer:cart.item_count', { count: itemCount });

  list.innerHTML = cart.map(function (item, index) {
    var color = item.color || '';
    var size  = item.size  || '';
    var line = (item.price_cents || 0) * item.qty;
    var metaTags = '';
    if (color) metaTags += '<span class="tag"><span class="dot" style="background:' + colorHex(color) + '"></span>' + escapeHtml(color) + '</span>';
    if (size) metaTags += '<span class="tag">' + window.i18n('customer:cart.size') + ': ' + escapeHtml(size) + '</span>';

    var prod = PRODUCT_CATALOG[String(item.id)];
    var img = prod ? getProductImage(prod) : (item.image || DEFAULT_PRODUCT_IMAGE);
    var cat = prod ? (prod.category || '') : (item.category || '');
    var maxQty = maxQtyOf(item);
    var plusDisabled = item.qty >= maxQty ? ' disabled' : '';
    var minusDisabled = item.qty <= 1 ? ' disabled' : '';

    return (
      '<article class="cart-item" data-index="' + index + '" data-key="' + escapeHtml(item.key || '') + '">' +
        '<a href="product.html?id=' + item.id + '" class="item-media" aria-label="View ' + escapeHtml(item.name) + '">' +
          '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + img + '" alt="' + escapeHtml(item.name) + '" loading="lazy" data-category="' + escapeHtml(cat) + '" onerror="handleImageError(this)" />' +
        '</a>' +

        '<div class="item-info">' +
          '<h3>' + escapeHtml(item.name) + '</h3>' +
          (metaTags ? '<div class="item-meta">' + metaTags + '</div>' : '') +
          '<div class="item-controls">' +
            '<div class="qty">' +
              '<button type="button" data-action="dec" data-index="' + index + '" aria-label="' + window.i18n('customer:cart.qty_dec') + '"' + minusDisabled + '>&minus;</button>' +
              '<input type="number" value="' + item.qty + '" min="1" max="' + maxQty + '" data-action="set" data-index="' + index + '" aria-label="' + window.i18n('customer:cart.qty') + '" />' +
              '<button type="button" data-action="inc" data-index="' + index + '" aria-label="' + window.i18n('customer:cart.qty_inc') + '"' + plusDisabled + '>+</button>' +
            '</div>' +
            '<button type="button" class="remove-btn" data-action="remove" data-index="' + index + '" data-key="' + escapeHtml(item.key || '') + '">&#10005; ' + window.i18n('customer:cart.remove') + '</button>' +
          '</div>' +
          (item.qty >= maxQty ? '<div class="stock-note">' + window.i18n('customer:cart.only_in_stock', { count: maxQty }) + '</div>' : '') +
        '</div>' +

        '<div class="item-price">' +
          '<div class="line-total">' + price(line) + '</div>' +
          '<small>' + price(item.price_cents || 0) + ' ' + window.i18n('customer:cart.each') + '</small>' +
        '</div>' +
      '</article>'
    );
  }).join('');

  renderSummary();
  if (typeof initLazyImages === 'function') initLazyImages();
}

function renderSummary() {
  var cart = getCart();
  var totals = calcTotals(cart);
  var panel = document.getElementById('summaryPanel');
  var isEmpty = cart.length === 0;

  function priceHTML(cents) {
    var s = price(cents);
    var m = s.match(/^(-?[\d.,]+)\s+DA$/);
    return m ? '<span class="amount">' + m[1] + '</span><span class="unit">DA</span>' : s;
  }

  var shippingLabel = isEmpty
    ? window.i18n('customer:cart.free')
    : (totals.shipping === 0 ? window.i18n('customer:cart.free') : priceHTML(totals.shipping));

  var discountLine = appliedPromo
    ? '<div class="summary-line"><span>' + window.i18n('customer:cart.discount') + ' (' + escapeHtml(appliedPromo.code) + ')</span><b style="color: var(--sage)">' + priceHTML(-totals.discount) + '</b></div>'
    : '';

  panel.innerHTML =
    '<h2>' + window.i18n('customer:cart.order_summary') + '</h2>' +

    '<div class="summary-line"><span>' + window.i18n('customer:cart.subtotal') + '</span><b>' + priceHTML(totals.subtotal) + '</b></div>' +
    discountLine +
    '<div class="summary-line"><span>' + window.i18n('customer:cart.shipping') + '</span><b>' + shippingLabel + '</b></div>' +
    '<div class="summary-line"><span>' + window.i18n('customer:cart.tax_est') + '</span><b>' + priceHTML(totals.tax) + '</b></div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-line" style="font-size: 12.5px;">' +
      '<span>' + window.i18n('customer:cart.promo_code') + '</span>' +
    '</div>' +
    '<div class="promo">' +
      '<input type="text" id="promoInput" aria-label="' + window.i18n('customer:cart.promo_code') + '" placeholder="' + window.i18n('customer:cart.promo_placeholder') + '" ' +
        (appliedPromo ? 'value="' + escapeHtml(appliedPromo.code) + '" disabled' : '') + ' />' +
      '<button type="button" id="promoBtn">' + (appliedPromo ? window.i18n('customer:cart.remove') : window.i18n('customer:cart.apply')) + '</button>' +
    '</div>' +
    '<div class="promo-msg" id="promoMsg" role="status" aria-live="polite">' +
      (appliedPromo ? '&#10003; ' + escapeHtml(appliedPromo.label) + ' ' + window.i18n('customer:cart.applied') : window.i18n('customer:cart.promo_try')) +
    '</div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-total">' +
      '<span>' + window.i18n('customer:cart.total') + '</span>' +
      '<span class="value">' + priceHTML(totals.total) + '</span>' +
    '</div>' +

    '<button type="button" class="btn btn-primary" id="checkoutBtn" ' + (isEmpty ? 'disabled style="opacity:0.5;cursor:not-allowed"' : '') + '>' +
      window.i18n('customer:cart.continue_checkout') +
    '</button>' +

    '<div class="summary-note">' +
      window.i18n('customer:cart.secure_checkout') + ' &middot; ' + window.i18n('customer:cart.free_returns') + '<br />' +
      window.i18n('customer:cart.free_shipping_over', { amount: price(FREE_SHIP_OVER) })
    '</div>';
}

/* ---------- 5. EVENT HANDLERS ---------- */
var removeTimers = {};

/* Delegated clicks / input on the items list */
document.getElementById('cartItems').addEventListener('click', function (event) {
  var btn = event.target.closest('[data-action]');
  if (!btn) return;
  var action = btn.getAttribute('data-action');
  var index  = Number(btn.getAttribute('data-index'));
  var cart   = getCart();
  if (!cart[index]) return;

  if (action === 'inc') {
    var maxQty = maxQtyOf(cart[index]);
    if (cart[index].qty >= maxQty) {
      if (stockOf(cart[index]) == null) showToast(window.i18n('customer:cart.max_per_item'));
      else showToast(window.i18n('customer:cart.only_in_stock', { count: maxQty }));
      return;
    }
    updateQty(cart[index].key, cart[index].qty + 1);
    renderCart();
  } else if (action === 'dec') {
    updateQty(cart[index].key, cart[index].qty - 1);
    renderCart();
  } else if (action === 'remove') {
    var itemKey = btn.getAttribute('data-key');
    if (!itemKey || removeTimers[itemKey]) return;
    var row = btn.closest('.cart-item');
    if (row) row.classList.add('removing');
    removeTimers[itemKey] = setTimeout(function () {
      delete removeTimers[itemKey];
      removeFromCart(itemKey);
      renderCart();
      showToast(window.i18n('customer:cart.removed'));
    }, 280);
  }
});

document.getElementById('cartItems').addEventListener('change', function (event) {
  var input = event.target.closest('input[data-action="set"]');
  if (!input) return;
  var index = Number(input.getAttribute('data-index'));
  var cart  = getCart();
  if (!cart[index]) return;
  var maxQty = maxQtyOf(cart[index]);
  var next = Math.max(1, Math.min(maxQty, Number(input.value) || 1));
  updateQty(cart[index].key, next);
  renderCart();
});

/* Delegated clicks inside the summary panel (promo, checkout) */
document.getElementById('summaryPanel').addEventListener('click', function (event) {
  if (event.target.id === 'promoBtn') {
    var input = document.getElementById('promoInput');
    var msg   = document.getElementById('promoMsg');

    if (appliedPromo) {
      appliedPromo = null;
      savePromo(null);
      showToast(window.i18n('customer:cart.promo_removed'));
      renderSummary();
      return;
    }

    var code  = (input.value || '').trim().toUpperCase();
    if (!code) {
      msg.textContent = window.i18n('customer:cart.promo_enter');
      msg.style.color = 'var(--wood)';
      return;
    }
    if (PROMOS[code]) {
      appliedPromo = Object.assign({ code: code }, PROMOS[code]);
      savePromo(appliedPromo);
      showToast(window.i18n('customer:cart.promo_applied'));
      renderSummary();
    } else {
      msg.textContent = window.i18n('customer:cart.promo_invalid');
      msg.style.color = 'var(--wood)';
    }
  }

  if (event.target.id === 'checkoutBtn') {
    showToast(window.i18n('customer:cart.redirecting'));
    setTimeout(function () { window.location.href = 'checkout.html'; }, 600);
  }
});

/* ---------- 6. UI HELPERS ---------- */

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
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2000);
}

/* ---------- BOOT ---------- */
function bootCart() {
  updateCartCount();
  renderCart();
  loadCatalog();
}

if (window.i18n) bootCart();
else window.addEventListener('i18n:ready', bootCart, { once: true });
window.addEventListener('i18n:changed', function () { renderCart(); });

/* Stale-state sync: cross-tab, bfcache back-navigation, and in-page cart:updated */
window.addEventListener('cart:updated', function () { renderCart(); });
window.addEventListener('storage', function (e) { if (e.key === window.CART_KEY) { updateCartCount(); renderCart(); } });
window.addEventListener('pageshow', function (e) { if (e.persisted) { updateCartCount(); renderCart(); } });