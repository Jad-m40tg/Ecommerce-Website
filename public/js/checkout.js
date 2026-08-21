/* checkout.js — checkout.html specific logic */

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
    if (subtitle) subtitle.textContent = 'Your cart is empty. Add items before checking out.';
    panel.innerHTML =
      '<h2>Order Summary</h2>' +
      '<p style="color: var(--gray); font-size: 14px; margin-bottom: 16px;">Your cart is empty.</p>' +
      '<a href="products.html" class="btn btn-primary" style="width:100%;">Browse Products</a>';
    return;
  }

  if (subtitle) subtitle.textContent = cart.reduce(function (s, i) { return s + i.qty; }, 0) + ' item(s) ready for checkout.';

  var shippingLabel = totals.shipping === 0 ? 'Free' : priceHTML(totals.shipping);

  var itemsHtml = cart.map(function (item) {
    var prod = PRODUCT_CATALOG[String(item.id)];
    var img = prod ? getProductImage(prod) : (item.image || DEFAULT_PRODUCT_IMAGE);
    var cat = prod ? (prod.category || '') : (item.category || '');
    return (
      '<div class="summary-item">' +
        '<div class="thumb"><img src="' + img + '" alt="' + escapeHtml(item.name) + '" data-category="' + escapeHtml(cat) + '" onerror="handleImageError(this)" /></div>' +
        '<div class="info">' +
          '<div class="name">' + escapeHtml(item.name) + '</div>' +
          '<div class="qty-label">Qty: ' + item.qty + '</div>' +
        '</div>' +
        '<div class="line-price">' + price((item.price_cents || 0) * item.qty) + '</div>' +
      '</div>'
    );
  }).join('');

  panel.innerHTML =
    '<h2>Order Summary</h2>' +
    '<div class="summary-items">' + itemsHtml + '</div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-line"><span>Subtotal</span><b>' + priceHTML(totals.subtotal) + '</b></div>' +
    (totals.discount > 0 ? '<div class="summary-line"><span>Discount (' + escapeHtml(appliedPromo.code) + ')</span><b style="color: var(--sage)">' + priceHTML(-totals.discount) + '</b></div>' : '') +
    '<div class="summary-line"><span>Shipping</span><b>' + shippingLabel + '</b></div>' +
    '<div class="summary-line"><span>Tax (est.)</span><b>' + priceHTML(totals.tax) + '</b></div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-total">' +
      '<span>Total</span>' +
      '<span class="value">' + priceHTML(totals.total) + '</span>' +
    '</div>' +

    '<button type="button" class="btn btn-primary" id="placeOrderBtn">Place Order</button>' +

    '<div class="summary-note">' +
      'Secure checkout &middot; Free returns within 30 days<br />' +
      'Free shipping on orders over ' + price(FREE_SHIP_OVER) +
    '</div>' +

    '<a href="cart.html" class="back-link">&#8592; Back to Cart</a>';
}

/* ---------- 4. FORM VALIDATION ---------- */
function validateField(id, errorId, test) {
  var input = document.getElementById(id);
  var error = document.getElementById(errorId);
  if (!input) return true;
  var result = test ? test(input.value) : input.value.trim().length > 0;
  var valid = result === true || result === null || result === undefined;
  var message = typeof result === 'string' ? result : '';
  if (!valid) {
    input.classList.add('error', 'invalid');
    input.classList.remove('valid');
    if (error) {
      if (message) error.textContent = message;
      error.classList.add('show');
    }
  } else {
    input.classList.remove('error', 'invalid');
    input.classList.add('valid');
    if (error) error.classList.remove('show');
  }
  return valid;
}

function emailTest(v) {
  v = v.trim();
  if (!v) return 'Email is required.';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? true : 'Please enter a valid email.';
}
function phoneTest(v) {
  var digits = v.replace(/\D/g, '');
  if (digits.length === 0) return 'Phone number is required.';
  return digits.length >= 7 ? true : 'Please enter a valid phone number.';
}
function firstNameTest(v) {
  v = v.trim();
  if (!v) return 'First name is required.';
  return v.length >= 3 ? true : 'Name must be at least 3 characters.';
}
function lastNameTest(v) {
  v = v.trim();
  if (!v) return 'Last name is required.';
  return v.length >= 3 ? true : 'Name must be at least 3 characters.';
}
function addressTest(v) {
  v = v.trim();
  if (!v) return 'Address is required.';
  return v.length >= 5 ? true : 'Please enter your delivery address.';
}
function cityTest(v) {
  v = v.trim();
  if (!v) return 'City is required.';
  return v.length >= 2 ? true : 'Please enter your city.';
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
  var error = input.parentNode.querySelector('.error-msg');
  if (error) error.classList.remove('show');
});

/* ---------- 5. PLACE ORDER FLOW ---------- */
document.addEventListener('click', function (event) {
  if (event.target.id !== 'placeOrderBtn') return;

  if (!validateForm()) {
    showToast('Please fix the highlighted fields.');
    return;
  }

  var btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Processing\u2026';

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
    items: cart.map(function (item) { return { product_id: Number(item.id), quantity: item.qty }; }),
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
    btn.innerHTML = 'Place Order';
    btn.disabled = false;
    showToast(err.message || 'Failed to place order. Please try again.');
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
updateCartCount();
renderSummary();

window.addEventListener('cart:updated', renderSummary);
window.addEventListener('storage', function (e) { if (e.key === window.CART_KEY) { renderSummary(); } });
window.addEventListener('pageshow', function (e) { if (e.persisted) { updateCartCount(); renderSummary(); } });