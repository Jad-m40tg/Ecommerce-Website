/* checkout.js â€” checkout.html specific logic */

/* ---------- 2. TOTALS MATH ---------- */
var SHIPPING_FLAT   = 999;    // default, overridden by API
var FREE_SHIP_OVER  = 9999;   // default, overridden by API
var TAX_RATE        = 0;
var PROMO_STORAGE_KEY = 'boularas-promo';
var appliedPromo = null;
try { appliedPromo = JSON.parse(localStorage.getItem(PROMO_STORAGE_KEY)) || null; } catch (e) { appliedPromo = null; }

var storeSettings = {};
fetch('/api/settings').then(function (r) { return r.json(); }).then(function (s) {
  storeSettings = s || {};
  if (s.delivery_fee_cents != null) SHIPPING_FLAT = s.delivery_fee_cents;
  if (s.free_delivery_threshold_cents != null) FREE_SHIP_OVER = s.free_delivery_threshold_cents;
  renderSummary();
}).catch(function () {});

/* ---------- 2.5. PRODUCT CATALOG (live image resolution) ---------- */
var PRODUCT_CATALOG = {};
fetch('/api/products/browse?limit=1000').then(function (r) { return r.json(); }).then(function (data) {
  var items = data.products || data.data || data;
  if (Array.isArray(items)) {
    items.forEach(function (p) { PRODUCT_CATALOG[String(p.id)] = p; });
  }
  renderSummary();
}).catch(function () {});

function calcTotals(cart) {
  var subtotal = cart.reduce(function (s, i) { return s + (i.price_cents || 0) * i.qty; }, 0);
  var shipping = cart.length === 0 ? 0 : (subtotal >= FREE_SHIP_OVER ? 0 : SHIPPING_FLAT);
  var discount = appliedPromo ? Math.round(subtotal * appliedPromo.pct) : 0;
  var taxable  = Math.max(0, subtotal - discount);
  var tax      = Math.round(taxable * TAX_RATE);
  var total    = taxable + shipping + tax;
  return { subtotal: subtotal, shipping: shipping, discount: discount, tax: tax, total: total };
}

/* ---------- 3. RENDER SUMMARY ---------- */
function priceHTML(cents) {
  var s = price(cents);
  var m = s.match(/^(-?[\d.,]+)\s+DA$/);
  return m ? '<span class="amount">' + m[1] + '</span><span class="unit">DA</span>' : s;
}

function renderSummary() {
  var cart = getCart();
  var totals = calcTotals(cart);
  var panel = document.getElementById('summaryPanel');
  var subtitle = document.getElementById('pageSubtitle');

  if (cart.length === 0) {
    if (subtitle) subtitle.textContent = window.i18n('customer:checkout.empty_subtitle');
    panel.innerHTML =
      '<h2>' + window.i18n('customer:cart.order_summary') + '</h2>' +
      '<p style="color: var(--gray); font-size: 14px; margin-bottom: 16px;">' + window.i18n('customer:checkout.empty_cart') + '</p>' +
      '<a href="products.html" class="btn btn-primary" style="width:100%;">' + window.i18n('customer:cart.browse_shop') + '</a>';
    return;
  }

  if (subtitle) subtitle.textContent = window.i18n('customer:checkout.item_count', { count: cart.reduce(function (s, i) { return s + i.qty; }, 0) });

  var shippingLabel = totals.shipping === 0 ? window.i18n('customer:cart.free') : priceHTML(totals.shipping);

  var itemsHtml = cart.map(function (item) {
    var prod = PRODUCT_CATALOG[String(item.id)];
    var img = prod ? getProductImage(prod) : (item.image || DEFAULT_PRODUCT_IMAGE);
    var cat = prod ? (prod.category || '') : (item.category || '');
    return (
      '<div class="summary-item">' +
        '<div class="thumb"><img src="' + img + '" alt="' + escapeHtml(item.name) + '" data-category="' + escapeHtml(cat) + '" onerror="handleImageError(this)" /></div>' +
        '<div class="info">' +
          '<div class="name">' + escapeHtml(item.name) + '</div>' +
          '<div class="qty-label">' + window.i18n('customer:checkout.qty') + ': ' + item.qty + '</div>' +
        '</div>' +
        '<div class="line-price">' + price((item.price_cents || 0) * item.qty) + '</div>' +
      '</div>'
    );
  }).join('');

  panel.innerHTML =
    '<h2>' + window.i18n('customer:cart.order_summary') + '</h2>' +
    '<div class="summary-items">' + itemsHtml + '</div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-line"><span>' + window.i18n('customer:cart.subtotal') + '</span><b>' + priceHTML(totals.subtotal) + '</b></div>' +
    (totals.discount > 0 ? '<div class="summary-line"><span>' + window.i18n('customer:cart.discount') + ' (' + escapeHtml(appliedPromo.code) + ')</span><b style="color: var(--sage)">' + priceHTML(-totals.discount) + '</b></div>' : '') +
    '<div class="summary-line"><span>' + window.i18n('customer:cart.shipping') + '</span><b>' + shippingLabel + '</b></div>' +
    '<div class="summary-line"><span>' + window.i18n('customer:cart.tax_est') + '</span><b>' + priceHTML(totals.tax) + '</b></div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-total">' +
      '<span>' + window.i18n('customer:cart.total') + '</span>' +
      '<span class="value">' + priceHTML(totals.total) + '</span>' +
    '</div>' +

    '<button type="button" class="btn btn-primary" id="placeOrderBtn">' + window.i18n('customer:checkout.place_order') + '</button>' +

    '<div class="summary-note">' +
      window.i18n('customer:cart.secure_checkout') + ' &middot; ' + window.i18n('customer:cart.free_returns') + '<br />' +
      window.i18n('customer:cart.free_shipping_over', { amount: price(FREE_SHIP_OVER) })
    '</div>' +

    '<a href="cart.html" class="back-link">&#8592; ' + window.i18n('customer:checkout.back_to_cart') + '</a>';
}

/* ---------- 4. FORM VALIDATION ---------- */
function validateField(id, errorId, test) {
  var input = document.getElementById(id);
  var error = document.getElementById(errorId);
  if (!input) return true;
  var result = test ? test(input.value) : input.value.trim().length > 0;
  var valid = result === true || result === null || result === undefined;
  var message = typeof result === 'string' ? result : '';
  // Accessibility: expose the invalid state and link the field to its error text.
  if (error && !input.getAttribute('aria-describedby')) {
    input.setAttribute('aria-describedby', errorId);
  }
  if (!valid) {
    input.classList.add('error', 'invalid');
    input.classList.remove('valid');
    input.setAttribute('aria-invalid', 'true');
    if (error) {
      if (message) error.textContent = message;
      error.classList.add('show');
    }
  } else {
    input.classList.remove('error', 'invalid');
    input.classList.add('valid');
    input.removeAttribute('aria-invalid');
    if (error) error.classList.remove('show');
  }
  return valid;
}

function emailTest(v) {
  v = v.trim();
  if (!v) return window.i18n('customer:checkout.req_email');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? true : window.i18n('customer:checkout.err_email');
}
function phoneTest(v) {
  var digits = v.replace(/\D/g, '');
  if (digits.length === 0) return window.i18n('customer:checkout.req_phone');
  return digits.length >= 7 ? true : window.i18n('customer:checkout.err_phone');
}
function firstNameTest(v) {
  v = v.trim();
  if (!v) return window.i18n('customer:checkout.req_first_name');
  return v.length >= 3 ? true : window.i18n('customer:checkout.err_name_length');
}
function lastNameTest(v) {
  v = v.trim();
  if (!v) return window.i18n('customer:checkout.req_last_name');
  return v.length >= 3 ? true : window.i18n('customer:checkout.err_name_length');
}
function addressTest(v) {
  v = v.trim();
  if (!v) return window.i18n('customer:checkout.req_address');
  return v.length >= 5 ? true : window.i18n('customer:checkout.err_address');
}
function cityTest(v) {
  v = v.trim();
  if (!v) return window.i18n('customer:checkout.req_city');
  return v.length >= 2 ? true : window.i18n('customer:checkout.err_city');
}

var LIVE_FIELDS = [
  ['email', 'emailError', emailTest],
  ['phone', 'phoneError', phoneTest],
  ['firstName', 'firstNameError', firstNameTest],
  ['lastName', 'lastNameError', lastNameTest],
  ['address', 'addressError', addressTest],
  ['city', 'cityError', cityTest]
];
LIVE_FIELDS.forEach(function (f) {
  var input = document.getElementById(f[0]);
  if (input) input.addEventListener('input', function () { validateField(f[0], f[1], f[2]); });
});

function validateForm() {
  var valid = true;

  valid = validateField('email', 'emailError', emailTest) && valid;
  valid = validateField('phone', 'phoneError', phoneTest) && valid;
  valid = validateField('firstName', 'firstNameError', firstNameTest) && valid;
  valid = validateField('lastName', 'lastNameError', lastNameTest) && valid;
  valid = validateField('address', 'addressError', addressTest) && valid;
  valid = validateField('city', 'cityError', cityTest) && valid;

  return valid;
}

/* Clear errors on focus */
document.addEventListener('focusin', function (event) {
  var input = event.target.closest('.field input, .field select');
  if (!input) return;
  input.classList.remove('error', 'invalid');
  input.removeAttribute('aria-invalid');
  var error = input.parentNode.querySelector('.error-msg');
  if (error) error.classList.remove('show');
});

/* ---------- 5. PLACE ORDER FLOW ---------- */
document.addEventListener('click', function (event) {
  if (event.target.id !== 'placeOrderBtn') return;

  if (!validateForm()) {
    showToast(window.i18n('customer:checkout.fix_fields'));
    var firstInvalid = document.querySelector('[aria-invalid="true"]');
    if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();
    return;
  }

  var btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ' + window.i18n('customer:checkout.processing');

  var cart = getCart();
  var paymentMethod = 'cash_on_delivery';
  var radios = document.querySelectorAll('input[name="payment_method"]');
  radios.forEach(function (r) { if (r.checked) paymentMethod = r.value; });

  var orderNonce = localStorage.getItem('boularas_order_nonce');
  if (!orderNonce) {
    orderNonce = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('boularas_order_nonce', orderNonce);
  }

  var orderData = {
    customer_name: (document.getElementById('firstName').value || '') + ' ' + (document.getElementById('lastName').value || ''),
    customer_email: document.getElementById('email').value || '',
    customer_phone: document.getElementById('phone').value || '',
    customer_address: [document.getElementById('address').value, document.getElementById('apt').value].filter(Boolean).join(', '),
    customer_city: document.getElementById('city').value || '',
    items: cart.map(function (item) { return { product_id: Number(item.id), quantity: item.qty, color: item.color || null, size: item.size || null }; }),
    notes: '',
    payment_method: paymentMethod,
    promo_code: appliedPromo ? appliedPromo.code : null,
    nonce: orderNonce
  };

  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  }).then(function (res) {
    return res.text().then(function (text) {
      var body;
      try { body = JSON.parse(text); } catch (e) { body = { error: text || 'Empty response from server' }; }
      if (!res.ok) throw new Error(body.error || 'Order failed');
      return body;
    });
  }).then(function (data) {
    var orderId = (data.order && data.order.id) || data.id;
    var trackingCode = (data.order && data.order.tracking_code) || data.tracking_code || '';

    localStorage.removeItem('boularas_order_nonce');

    if (data.duplicate === true && data.payment_url) {
      window.location.href = data.payment_url;
    } else if (data.duplicate === true || paymentMethod === 'cash_on_delivery') {
      saveCart([]);
      localStorage.removeItem(PROMO_STORAGE_KEY);
      window.location.href = 'order-placed.html?order_id=' + encodeURIComponent(orderId) + '&code=' + encodeURIComponent(trackingCode);
    } else {
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error('Payment URL not received from server');
      }
    }
  }).catch(function (err) {
    btn.innerHTML = window.i18n('customer:checkout.place_order');
    btn.disabled = false;
    showToast(err.message || window.i18n('customer:checkout.place_failed'));
  });
});

/* ---------- 6. UI HELPERS ---------- */

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

/* Init */
function bootCheckout() {
  updateCartCount();
  renderSummary();
}

if (window.i18n) bootCheckout();
else window.addEventListener('i18n:ready', bootCheckout, { once: true });
window.addEventListener('i18n:changed', function () { renderSummary(); });

window.addEventListener('cart:updated', renderSummary);
window.addEventListener('storage', function (e) { if (e.key === window.CART_KEY) { renderSummary(); } });
window.addEventListener('pageshow', function (e) { if (e.persisted) { updateCartCount(); renderSummary(); } });