/* offers.js — offers.html specific logic */

var PRODUCTS = [];

/* ---------- PROMOTIONS DATA ---------- */
var PROMOTIONS = [
{
    icon: 'local_shipping', key: 'promo_delivery'
  },
  {
    icon: 'payments', key: 'promo_payment'
  },
  {
    icon: 'local_offer', key: 'promo_offers'
  },
  {
    icon: 'storefront', key: 'promo_store'
  },
  {
    icon: 'verified', key: 'promo_trusted'
  }
];

function renderPromotions() {
  var grid = document.getElementById('promoGrid');
  grid.innerHTML = PROMOTIONS.map(function (promo) {
    var titleKey = 'customer:offers.' + promo.key + '_title';
    var descKey = 'customer:offers.' + promo.key + '_desc';
    var codeHtml = promo.code
      ? '<div class="promo-code"><span class="code">' + escapeHtml(promo.code) + '</span><button class="copy-btn" type="button" data-code="' + promo.code + '">' + window.i18n('customer:offers.copy') + '</button></div>'
      : '';
    return (
      '<article class="promo-card reveal">' +
        '<div class="promo-icon" aria-hidden="true"><span class="material-symbols-outlined">' + promo.icon + '</span></div>' +
        '<h3>' + window.i18n(titleKey) + '</h3>' +
        '<p>' + window.i18n(descKey) + '</p>' +
        codeHtml +
      '</article>'
    );
  }).join('');
  var promoCards = grid.querySelectorAll('.promo-card.reveal');
  for (var ri = 0; ri < promoCards.length; ri++) revealObserver.observe(promoCards[ri]);
}

/* ---------- PRODUCT CARDS ---------- */
function productCardHTML(product) {
  var stars = '\u2605'.repeat(Math.round(product.rating || 0));
  var badge = '';
  if (product.badge === 'sale') badge = '<span class="card-badge sale">' + window.i18n('customer:product.sale') + '</span>';
  if (product.badge === 'new')  badge = '<span class="card-badge">' + window.i18n('customer:product.new') + '</span>';
  if (!(product.stock > 0)) {
    var outBadge = '<span class="card-badge" style="background:#e41a1a;color:#fff;">' + window.i18n('customer:product.unavailable') + '</span>';
    badge = badge ? badge + ' ' + outBadge : outBadge;
  }
  var oldPrice = product.price_cents && product.old_price_cents
    ? '<s>' + price(product.old_price_cents) + '</s>' : '';
  var priceHtml = product.price_cents ? price(product.price_cents) : '';
  var inCart = isInCart(product.id);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? window.i18n('customer:product.in_cart') : window.i18n('customer:product.add');
  var btnDisabled = !(product.stock > 0) ? ' disabled style="opacity:0.5;pointer-events:none;"' : '';

  var nameEscaped = escapeHtml(product.name);
  return (
    '<article class="product-card">' +
      '<a class="card-hit" href="product.html?id=' + product.id + '" aria-label="' + window.i18n('customer:product.view', { name: nameEscaped }) + '">' +
        '<span class="card-media">' +
          badge +
          '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E" data-src="' + (product.image || window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.jpg') + '" alt="' + nameEscaped + '" loading="lazy" onerror="handleImageError(this)" data-category="' + (product.category || '') + '" />' +
        '</span>' +
        '<span class="card-body">' +
          '<span class="card-category">' + escapeHtml(product.category_name || '') + '</span>' +
          '<span class="card-title">' + nameEscaped + '</span>' +
          '<span class="card-rating"><span aria-hidden="true">' + stars + '</span><span class="sr-only">' + window.i18n('customer:product.rated', { rating: Math.round(product.rating || 0) }) + '</span><span>(' + (product.reviews || 0) + ')</span></span>' +
        '</span>' +
      '</a>' +
      '<span class="card-price-row">' +
        '<span class="card-price">' + priceHtml + oldPrice + '</span>' +
        '<button class="' + btnClass + '" type="button" data-add="' + product.id + '" data-name="' + nameEscaped + '"' + btnDisabled + ' aria-label="' + window.i18n('customer:product.' + (inCart ? 'remove_from_cart' : 'add_label'), { name: nameEscaped }) + '">' + btnText + '</button>' +
      '</span>' +
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
  if (product) {
    if (!(product.stock > 0)) return;
    addToCart(product);
    showToast(window.i18n('customer:product.added_to_cart', { name: escapeHtml(product.name) }));
  }
  addButton.textContent = window.i18n('customer:product.in_cart');
  addButton.className = 'card-added';
  addButton.setAttribute('aria-label', window.i18n('customer:product.remove_from_cart', { name: addButton.getAttribute('data-name') || '' }));
});

/* ---------- CART STATE ---------- */
function renderCartState() {
  document.querySelectorAll('[data-add]').forEach(function (addButton) {
    var inCart = isInCart(addButton.getAttribute('data-add'));
    var name = addButton.getAttribute('data-name') || '';
    addButton.textContent = inCart ? window.i18n('customer:product.in_cart') : window.i18n('customer:product.add');
    addButton.className = inCart ? 'card-added' : 'card-add';
    addButton.setAttribute('aria-label', window.i18n('customer:product.' + (inCart ? 'remove_from_cart' : 'add_label'), { name: name }));
  });
}
window.addEventListener('cart:updated', renderCartState);
window.addEventListener('pageshow', function (e) { if (e.persisted) { updateCartCount(); renderCartState(); } });
window.addEventListener('storage', function (e) { if (e.key === window.CART_KEY) { updateCartCount(); renderCartState(); } });

/* Copy promo code to clipboard */
document.addEventListener('click', function (event) {
  var copyBtn = event.target.closest('[data-code]');
  if (!copyBtn) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(copyBtn.getAttribute('data-code')).then(function () {
      showToast(window.i18n('customer:offers.code_copied'));
    });
  } else {
    showToast(window.i18n('customer:offers.code_copied'));
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

/* ---------- COUNTDOWN TIMER + OFFER STATE ----------
   Empty state is the default; sale content only appears when a live sale
   is confirmed. Ticker runs only while a sale is shown. */
var saleEnd = null;
var tickHandle = null;
var recheckedOnExpiry = false;

function showEmptyState() {
  document.getElementById('offerSale').hidden = true;
  document.getElementById('offerEmpty').hidden = false;
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

function showSaleState() {
  document.getElementById('offerEmpty').hidden = true;
  document.getElementById('offerSale').hidden = false;
}

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
  if (remaining <= 0 && !recheckedOnExpiry) {
    recheckedOnExpiry = true;
    loadActiveSale(); // one re-fetch, in case a new sale just started
  }
}

function loadActiveSale() {
  var saleData = null;
  var saleFailed = false;
  var campaignBanner = '';
  var settingsFailed = false;

  function settle() {
    if (saleFailed && settingsFailed) showEmptyState();
  }

  function apply() {
    if (!saleData) return;
    var sales = saleData.sales || [];
    if (sales.length === 0) { showEmptyState(); return; }
    var sale = sales[0];
    var titleSale = null;
    for (var ti = 0; ti < sales.length; ti++) {
      if (sales[ti].title && sales[ti].title.trim()) { titleSale = sales[ti]; break; }
    }
    var effectiveSale = titleSale || sale;
    var end = new Date(effectiveSale.end_at).getTime();
    if (isNaN(end)) { showEmptyState(); return; }
    showSaleState();
    saleEnd = end;
    recheckedOnExpiry = false;
    var titleEl = document.getElementById('offerTitle');
    var descEl  = document.getElementById('offerDesc');
    var shopEl  = document.getElementById('offerShop');
    var imgEl   = document.getElementById('offerImg');
    var maxPct = 0;
    for (var i = 0; i < sales.length; i++) {
      if ((sales[i].discount_percent || 0) > maxPct) maxPct = sales[i].discount_percent;
    }
    if (titleEl) titleEl.textContent = (effectiveSale.title && effectiveSale.title.trim()) ? effectiveSale.title.trim() : window.i18n('customer:home.on_sale_now', { percent: maxPct });
    if (descEl) descEl.textContent = window.i18n('customer:home.sale_desc');
    var banner = campaignBanner || effectiveSale.banner_image_url || sale.banner_image_url;
    if (imgEl && banner) imgEl.src = banner;
    if (shopEl) shopEl.href = 'products.html?sale=' + (effectiveSale.id || sale.id);
    updateCountdown();
    if (!tickHandle) tickHandle = setInterval(updateCountdown, 1000);
  }

  fetch('/api/sales/active').then(function (r) { return r.json(); }).then(function (data) {
    saleData = data;
    apply();
  }).catch(function () { saleFailed = true; settle(); });
  fetch('/api/settings').then(function (r) { return r.json(); }).then(function (data) {
    campaignBanner = data.offer_banner_url || '';
    apply();
  }).catch(function () { settingsFailed = true; settle(); });
}

function bootOffers() {
  loadActiveSale();
  renderPromotions();
  loadOnSaleProducts();
}

function rerenderOffers() {
  loadActiveSale();
  renderPromotions();
  renderCartState();
}

if (window.i18n) bootOffers();
else window.addEventListener('i18n:ready', bootOffers, { once: true });
window.addEventListener('i18n:changed', rerenderOffers);

/* ---------- UI HELPERS ---------- */

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

/* Init cart badge */
updateCartCount();

/* ---------- API DATA ---------- */
function renderSaleEmpty() {
  var row = document.getElementById('saleRow');
  if (row) row.innerHTML = '<div style="width:100%;padding:36px 24px;text-align:center;color:var(--gray);font-size:14px">' + window.i18n('customer:offers.sale_empty') + '</div>';
}

function loadOnSaleProducts() {
  fetch('/api/products/browse/on-sale')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var items = data.products || data.data || data;
      if (!Array.isArray(items) || !items.length) { renderSaleEmpty(); return; }
      PRODUCTS = items.map(function (p) {
        var imgs = []; try { imgs = JSON.parse(p.images || '[]'); } catch(e) { imgs = []; }
        var img = imgs[0] || p.image || window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.jpg';
        return {
          id: p.id,
          name: p.name || 'Untitled',
          slug: p.slug || '',
          category_name: (p.category_name || p.category || 'Uncategorized'),
          price_cents: p.price_cents || 0,
          old_price_cents: p.old_price_cents || null,
          stock: p.stock || 0,
          on_sale: !!p.on_sale,
          rating: parseFloat(p.rating) || 0,
          reviews: parseInt(p.reviews, 10) || 0,
          image: img,
          badge: 'sale',
          colors: p.colors || [],
          sizes: p.sizes || []
        };
      });
      renderRow('saleRow', PRODUCTS);
      if (typeof initLazyImages === 'function') initLazyImages();
    })
    .catch(function () {});
}

/* ---------- KEYBOARD: arrow-key navigation for promo + product cards ---------- */
(function () {
  function promoCols() {
    var w = window.innerWidth;
    if (w <= 520) return 1;
    if (w <= 900) return 2;
    return 3;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    var active = document.activeElement;

    // 1) Promo grid: arrows move between promo-cards (grid: 3 / 2 / 1 cols)
    var promoGrid = document.getElementById('promoGrid');
    var promoCards = promoGrid ? Array.prototype.slice.call(promoGrid.querySelectorAll('.promo-card')) : [];
    // If skip link landed on #promotions itself, arrow goes to first promo card
    if (active && active.id === 'promotions' && promoCards.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault(); promoCards[0].focus(); promoCards[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
    }
    var promoCard = active ? active.closest('.promo-card') : null;
    if (promoCard && promoGrid && promoGrid.contains(promoCard) && promoCards.length) {
      var idx = promoCards.indexOf(promoCard);
      if (idx === -1) return;
      var cols = promoCols();
      var next = -1;
      if (e.key === 'ArrowRight') next = idx + 1;
      else if (e.key === 'ArrowLeft') next = idx - 1;
      else if (e.key === 'ArrowDown') next = idx + cols;
      else if (e.key === 'ArrowUp') next = idx - cols;
      if (next >= 0 && next < promoCards.length) {
        e.preventDefault();
        promoCards[next].focus();
        promoCards[next].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
      return;
    }

    // 2) Sale row (horizontal scroller): arrows move between product cards
    var saleRow = document.getElementById('saleRow');
    if (saleRow) {
      var cards = Array.prototype.slice.call(saleRow.querySelectorAll('.product-card'));
      if (cards.length) {
        var curCard = active ? active.closest('.product-card') : null;
        // Only handle if focus is inside the sale row
        if (curCard && saleRow.contains(curCard)) {
          var cIdx = cards.indexOf(curCard);
          if (cIdx === -1) return;
          var nIdx = -1;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nIdx = cIdx + 1;
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nIdx = cIdx - 1;
          if (nIdx >= 0 && nIdx < cards.length) {
            e.preventDefault();
            var hit = cards[nIdx].querySelector('.card-hit');
            if (hit) { hit.focus(); hit.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }
            else { cards[nIdx].focus(); }
          }
          return;
        }
      }
    }
  });
})();