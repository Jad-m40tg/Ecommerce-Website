/* checkout.js — checkout.html specific logic */

/* ---------- 1. CART STORAGE ---------- */
var CART_KEY = 'boularas-cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}
function updateCartCount() {
  var total = getCart().reduce(function (sum, item) { return sum + item.qty; }, 0);
  var el = document.getElementById('cartCount');
  if (el) el.textContent = total;
}

/* ---------- 2. TOTALS MATH ---------- */
var SHIPPING_FLAT   = 999;
var FREE_SHIP_OVER  = 9999;
var TAX_RATE        = 0;

function calcTotals(cart) {
  var subtotal = cart.reduce(function (s, i) { return s + (i.price_cents || 0) * i.qty; }, 0);
  var shipping = cart.length === 0 ? 0 : (subtotal >= FREE_SHIP_OVER ? 0 : SHIPPING_FLAT);
  var tax      = Math.round(subtotal * TAX_RATE);
  var total    = subtotal + shipping + tax;
  return { subtotal: subtotal, shipping: shipping, tax: tax, total: total };
}

/* ---------- 3. RENDER SUMMARY ---------- */
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

  var shippingLabel = totals.shipping === 0 ? 'Free' : price(totals.shipping);

  var itemsHtml = cart.map(function (item) {
    return (
      '<div class="summary-item">' +
        '<div class="thumb"><img src="' + item.image + '" alt="' + escapeHtml(item.name) + '" /></div>' +
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

    '<div class="summary-line"><span>Subtotal</span><b>' + price(totals.subtotal) + '</b></div>' +
    '<div class="summary-line"><span>Shipping</span><b>' + shippingLabel + '</b></div>' +
    '<div class="summary-line"><span>Tax (est.)</span><b>' + price(totals.tax) + '</b></div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-total">' +
      '<span>Total</span>' +
      '<span class="value">' + price(totals.total) + '</span>' +
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
  var valid = test ? test(input.value) : input.value.trim().length > 0;
  if (!valid) {
    input.classList.add('error');
    if (error) error.classList.add('show');
  } else {
    input.classList.remove('error');
    if (error) error.classList.remove('show');
  }
  return valid;
}

function validateForm() {
  var valid = true;

  valid = validateField('email', 'emailError', function (v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }) && valid;

  valid = validateField('firstName', 'firstNameError') && valid;
  valid = validateField('lastName', 'lastNameError') && valid;
  valid = validateField('address', 'addressError') && valid;
  valid = validateField('city', 'cityError') && valid;

  return valid;
}

/* Clear errors on focus */
document.addEventListener('focusin', function (event) {
  var input = event.target.closest('.field input, .field select');
  if (!input) return;
  input.classList.remove('error');
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

  var orderData = {
    customer_name: (document.getElementById('firstName').value || '') + ' ' + (document.getElementById('lastName').value || ''),
    customer_email: document.getElementById('email').value || '',
    customer_phone: document.getElementById('phone').value || '',
    customer_address: [document.getElementById('address').value, document.getElementById('apt').value].filter(Boolean).join(', '),
    customer_city: document.getElementById('city').value || '',
    items: cart.map(function (item) { return { product_id: Number(item.id), quantity: item.qty }; }),
    notes: '',
    payment_method: paymentMethod
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

    if (paymentMethod === 'cash_on_delivery') {
      saveCart([]);
      renderSummary();
      document.getElementById('orderNumber').textContent = 'Order #' + orderId + (trackingCode ? ' — Tracking: ' + trackingCode : '');
      document.getElementById('confirmOverlay').classList.add('open');
      showToast('Order placed!');
    } else {
      saveCart([]);
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

/* Close confirmation on overlay click */
document.getElementById('confirmOverlay').addEventListener('click', function (event) {
  if (event.target === this) {
    this.classList.remove('open');
  }
});

/* ---------- 6. UI HELPERS ---------- */

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

/* Init */
updateCartCount();
renderSummary();