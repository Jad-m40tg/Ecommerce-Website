/* cart.js — cart.html specific logic */

/* ---------- 1. CART STORAGE ---------- */
var CART_KEY = 'havenwood-cart';

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
  document.getElementById('cartCount').textContent = total;
}

/* ---------- 2. SAMPLE SEED ---------- */
function seedSampleCart() {
  var sample = [
    { key: '1|Emerald Green|3-Seater', id: 1,
      name: 'Oslo Velvet Sofa', price_cents: 129999, image: '/uploads/oslo-sofa-1.jpg',
      color: 'Emerald Green', size: '3-Seater', qty: 1 },
    { key: '2|Natural Oak|6-Seater', id: 2,
      name: 'Bergen Oak Dining Table', price_cents: 89999, image: '/uploads/bergen-table-1.jpg',
      color: 'Natural Oak', size: '6-Seater', qty: 1 },
    { key: '7|Brushed Brass|Standard', id: 7,
      name: 'Luna Arc Floor Lamp', price_cents: 19999, image: '/uploads/luna-lamp-1.jpg',
      color: 'Brushed Brass', size: 'Standard', qty: 2 }
  ];
  saveCart(sample);
}

/* ---------- 3. TOTALS MATH ---------- */
var SHIPPING_FLAT   = 3900;
var FREE_SHIP_OVER  = 50000;
var TAX_RATE        = 0.08;

var PROMOS = {
  HAVEN10:  { label: '10% off subtotal', pct: 0.10 },
  WELCOME5: { label: '5% off subtotal',  pct: 0.05 }
};
var appliedPromo = null;

function calcTotals(cart) {
  var subtotal = cart.reduce(function (s, i) { return s + (i.price_cents || 0) * i.qty; }, 0);
  var shipping = cart.length === 0 ? 0 : (subtotal >= FREE_SHIP_OVER ? 0 : SHIPPING_FLAT);
  var discount = appliedPromo ? Math.round(subtotal * appliedPromo.pct) : 0;
  var taxable  = Math.max(0, subtotal - discount);
  var tax      = Math.round(taxable * TAX_RATE);
  var total    = taxable + shipping + tax;
  return { subtotal: subtotal, shipping: shipping, discount: discount, tax: tax, total: total };
}

/* Small palette used to hint the color chip in each row */
var COLOR_HEX = {
  'natural linen': '#e8e0d3',
  'sage green':    '#6b7f5e',
  'charcoal':      '#2b2926',
  'wood tan':      '#a67c52',
  'natural oak':   '#c9a97a',
  'warm walnut':   '#7a5539',
  'cream':         '#f3eee6',
  'terracotta':    '#a67c52'
};
function colorHex(name) {
  return COLOR_HEX[(name || '').toLowerCase()] || '#e8e0d3';
}

/* ---------- 4. RENDER ---------- */

function renderCart() {
  var cart = getCart();
  var list = document.getElementById('cartItems');
  var subtitle = document.getElementById('pageSubtitle');

  if (cart.length === 0) {
    subtitle.textContent = 'Your cart is currently empty.';
    list.innerHTML =
      '<div class="empty-cart">' +
        '<div class="emoji" aria-hidden="true"><span class="material-symbols-outlined" style="font-size:48px;">shopping_bag</span></div>' +
        '<h2>Your cart is empty</h2>' +
        '<p>Discover pieces made to last and designed to be lived with.</p>' +
        '<a href="products.html" class="btn btn-primary">Browse the Shop</a>' +
      '</div>';
    renderSummary();
    return;
  }

  var itemCount = cart.reduce(function (s, i) { return s + i.qty; }, 0);
  subtitle.textContent = itemCount + (itemCount === 1 ? ' item' : ' items') + ' ready for checkout.';

  list.innerHTML = cart.map(function (item, index) {
    var color = item.color || 'Natural';
    var size  = item.size  || 'Standard';
    var line = (item.price_cents || 0) * item.qty;

    return (
      '<article class="cart-item" data-index="' + index + '" data-key="' + escapeHtml(item.key || '') + '">' +
        '<a href="product.html?id=' + item.id + '" class="item-media" aria-label="View ' + escapeHtml(item.name) + '">' +
          '<img src="' + item.image + '" alt="' + escapeHtml(item.name) + '" loading="lazy" onerror="handleImageError(this)" />' +
        '</a>' +

        '<div class="item-info">' +
          '<h3>' + escapeHtml(item.name) + '</h3>' +
          '<div class="item-meta">' +
            '<span class="tag"><span class="dot" style="background:' + colorHex(color) + '"></span>' + escapeHtml(color) + '</span>' +
            '<span class="tag">Size: ' + escapeHtml(size) + '</span>' +
          '</div>' +
          '<div class="item-controls">' +
            '<div class="qty">' +
              '<button type="button" data-action="dec" data-index="' + index + '" aria-label="Decrease quantity">&minus;</button>' +
              '<input type="number" value="' + item.qty + '" min="1" max="99" data-action="set" data-index="' + index + '" aria-label="Quantity" />' +
              '<button type="button" data-action="inc" data-index="' + index + '" aria-label="Increase quantity">+</button>' +
            '</div>' +
            '<button type="button" class="remove-btn" data-action="remove" data-index="' + index + '" data-key="' + escapeHtml(item.key || '') + '">&#10005; Remove</button>' +
          '</div>' +
        '</div>' +

        '<div class="item-price">' +
          '<div class="line-total">' + price(line) + '</div>' +
          '<small>' + price(item.price_cents || 0) + ' each</small>' +
        '</div>' +
      '</article>'
    );
  }).join('');

  renderSummary();
}

function renderSummary() {
  var cart = getCart();
  var totals = calcTotals(cart);
  var panel = document.getElementById('summaryPanel');
  var isEmpty = cart.length === 0;

  var shippingLabel = isEmpty
    ? 'Free'
    : (totals.shipping === 0 ? 'Free' : price(totals.shipping));

  var discountLine = appliedPromo
    ? '<div class="summary-line"><span>Discount (' + escapeHtml(appliedPromo.code) + ')</span><b style="color: var(--sage)">-' + price(totals.discount) + '</b></div>'
    : '';

  panel.innerHTML =
    '<h2>Order Summary</h2>' +

    '<div class="summary-line"><span>Subtotal</span><b>' + price(totals.subtotal) + '</b></div>' +
    discountLine +
    '<div class="summary-line"><span>Shipping</span><b>' + shippingLabel + '</b></div>' +
    '<div class="summary-line"><span>Tax (est.)</span><b>' + price(totals.tax) + '</b></div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-line" style="font-size: 12.5px;">' +
      '<span>Promo code</span>' +
    '</div>' +
    '<div class="promo">' +
      '<input type="text" id="promoInput" placeholder="e.g. HAVEN10" ' +
        (appliedPromo ? 'value="' + escapeHtml(appliedPromo.code) + '" disabled' : '') + ' />' +
      '<button type="button" id="promoBtn">' + (appliedPromo ? 'Remove' : 'Apply') + '</button>' +
    '</div>' +
    '<div class="promo-msg" id="promoMsg">' +
      (appliedPromo ? '&#10003; ' + escapeHtml(appliedPromo.label) + ' applied.' : 'Try HAVEN10 or WELCOME5.') +
    '</div>' +

    '<div class="summary-divider"></div>' +

    '<div class="summary-total">' +
      '<span>Total</span>' +
      '<span class="value">' + price(totals.total) + '</span>' +
    '</div>' +

    '<button type="button" class="btn btn-primary" id="checkoutBtn" ' + (isEmpty ? 'disabled style="opacity:0.5;cursor:not-allowed"' : '') + '>' +
      'Continue to Checkout' +
    '</button>' +

    '<div class="summary-note">' +
      'Secure checkout &middot; Free returns within 30 days<br />' +
      'Free shipping on orders over ' + price(FREE_SHIP_OVER) +
    '</div>';
}

/* ---------- 5. EVENT HANDLERS ---------- */

/* Delegated clicks / input on the items list */
document.getElementById('cartItems').addEventListener('click', function (event) {
  var btn = event.target.closest('[data-action]');
  if (!btn) return;
  var action = btn.getAttribute('data-action');
  var index  = Number(btn.getAttribute('data-index'));
  var cart   = getCart();
  if (!cart[index]) return;

  if (action === 'inc') {
    cart[index].qty = Math.min(99, cart[index].qty + 1);
    saveCart(cart); renderCart();
  } else if (action === 'dec') {
    cart[index].qty = Math.max(1, cart[index].qty - 1);
    saveCart(cart); renderCart();
  } else if (action === 'remove') {
    var row = btn.closest('.cart-item');
    var itemKey = btn.getAttribute('data-key');
    if (row && itemKey) {
      row.classList.add('removing');
      setTimeout(function () {
        var fresh = getCart();
        var idx = fresh.findIndex(function (c) { return c.key === itemKey; });
        if (idx !== -1) fresh.splice(idx, 1);
        saveCart(fresh);
        renderCart();
        showToast('Item removed from cart');
      }, 280);
    }
  }
});

document.getElementById('cartItems').addEventListener('change', function (event) {
  var input = event.target.closest('input[data-action="set"]');
  if (!input) return;
  var index = Number(input.getAttribute('data-index'));
  var cart  = getCart();
  if (!cart[index]) return;
  var next = Math.max(1, Math.min(99, Number(input.value) || 1));
  cart[index].qty = next;
  saveCart(cart); renderCart();
});

/* Delegated clicks inside the summary panel (promo, checkout) */
document.getElementById('summaryPanel').addEventListener('click', function (event) {
  if (event.target.id === 'promoBtn') {
    var input = document.getElementById('promoInput');
    var msg   = document.getElementById('promoMsg');

    if (appliedPromo) {
      appliedPromo = null;
      showToast('Promo code removed');
      renderSummary();
      return;
    }

    var code  = (input.value || '').trim().toUpperCase();
    if (!code) {
      msg.textContent = 'Enter a code to apply.';
      msg.style.color = 'var(--wood)';
      return;
    }
    if (PROMOS[code]) {
      appliedPromo = Object.assign({ code: code }, PROMOS[code]);
      showToast('Promo code applied');
      renderSummary();
    } else {
      msg.textContent = 'Sorry, that code isn\'t valid.';
      msg.style.color = 'var(--wood)';
    }
  }

  if (event.target.id === 'checkoutBtn') {
    showToast('Redirecting to checkout\u2026');
    setTimeout(function () { window.location.href = 'checkout.html'; }, 600);
  }
});

/* ---------- 6. UI HELPERS ---------- */

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
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2000);
}

/* ---------- BOOT ---------- */
if (getCart().length === 0) seedSampleCart();

updateCartCount();
renderCart();