/* home.js — index.html specific logic */

var _allProducts = [];

/* ---------- HIDE DRAFT CATEGORY TILES ---------- */
fetch('/api/categories').then(function(r){ return r.json(); }).then(function(data){
  var cats = data.categories || data || [];
  if (!Array.isArray(cats)) cats = [];
  var active = new Set(cats.filter(function(c){ return (c.status||'active')==='active'; }).map(function(c){ return c.slug; }));
  if (active.size === 0) return;
  document.querySelectorAll('.category-card, a[href*="products.html?category="]').forEach(function(el){
    var href = el.getAttribute('href');
    var m = href && href.match(/category=([^&"]+)/);
    if (m && !active.has(decodeURIComponent(m[1]))) el.style.display='none';
  });
}).catch(function(){});

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

function isNewBadge(p){
  if(!p || !p.featured) return false;
  if(!p.created_at) return true;
  var t = new Date(p.created_at).getTime();
  if(isNaN(t)) t = new Date(String(p.created_at).replace(' ','T')).getTime();
  if(isNaN(t)) return false;
  return Date.now() - t <= 7*86400000;
}
/* ---------- PRODUCT CARD HTML ---------- */
function productCardHTML(product) {
  var rating = product.rating || 0;
  var reviews = product.reviews || 0;
  var stars = '';
  for (var i = 0; i < Math.round(rating); i++) stars += '\u2605';

  var badge = '';
  if (product.badge === 'sale') badge = '<span class="card-badge sale">Sale</span>';
  else if (product.badge === 'new' && isNewBadge(product)) badge = '<span class="card-badge new">New</span>';
  if (!(product.stock > 0)) {
    var outBadge = '<span class="card-badge" style="background:#e41a1a;color:#fff;">unavailable</span>';
    badge = badge ? badge + ' ' + outBadge : outBadge;
  }

  var oldPrice = product.old_price_cents ? '<s>' + price(product.old_price_cents) + ' </s>' : '';
  var inCart = isInCart(product.id);
  var btnClass = inCart ? 'card-added' : 'card-add';
  var btnText = inCart ? 'In Cart' : 'Add';
  var btnDisabled = !(product.stock > 0) ? ' disabled style="opacity:0.5;pointer-events:none;"' : '';

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
          '<button class="' + btnClass + '" type="button" data-add="' + product.id + '"' + btnDisabled + '>' + btnText + '</button>' +
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
      p._image = (imgs.length > 0 ? imgs[0] : (window.DEFAULT_PRODUCT_IMAGE || '/assets/noImageForItem.jpg'));
      p.badge = p.on_sale ? 'sale' : (p.featured ? 'new' : null);
      return p;
    });

    _allProducts = products;

    /* Group by display_section with fallback - supports JSON array, comma-separated, or single string (backward compat) */
    function parseDisplay(p) {
      var ds = p.display_section;
      if (!ds) return [];
      if (Array.isArray(ds)) return ds;
      if (typeof ds === 'string') {
        var t = ds.trim();
        if (!t) return [];
        if (t.charAt(0) === '[') {
          try { var arr = JSON.parse(t); if (Array.isArray(arr)) return arr; } catch (e) {}
        }
        if (t.indexOf(',') !== -1) return t.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        return [t];
      }
      return [String(ds)];
    }
    var bestSellers = products.filter(function (p) {
      var disp = parseDisplay(p);
      if (disp.length) return disp.indexOf('best_sellers') !== -1;
      return !!p.featured;
    }).slice(0, 8);

    var popular = products.filter(function (p) {
      var disp = parseDisplay(p);
      if (disp.length) return disp.indexOf('popular') !== -1;
      return !!p.on_sale;
    }).slice(0, 8);
    function isNewProduct(p) {
      // Prefer explicit new_arrival_until if present
      if (p.new_arrival_until) {
        var until = new Date(p.new_arrival_until).getTime();
        if (!isNaN(until)) return Date.now() <= until;
      }
      var days = parseInt(p.new_arrival_days, 10);
      if (isNaN(days)) days = 3; // default at least 3 days
      if (days <= 0) return false;
      if (!p.created_at) return false;
      var created = new Date(p.created_at).getTime();
      if (isNaN(created)) return false;
      return (Date.now() - created) <= days * 86400000;
    }

    var newArrivals = products.filter(function (p) {
      var disp = parseDisplay(p);
      var isManualNew = disp.indexOf('new_arrivals') !== -1;
      var isAutoNew = isNewProduct(p);
      return isManualNew || isAutoNew;
    }).sort(function (a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
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

/* ---------- ANNOUNCEMENT BAR ---------- */
function loadAnnouncementBar() {
  fetch('/api/settings').then(function (r) { return r.json(); }).then(function (data) {
    var s = data.settings || data || {};
    var bar = document.getElementById('announcementBar');
    if (!bar) return;
    if (s.announcement_enabled === false) { bar.style.display = 'none'; return; }
    var text = s.announcement_text;
    if (!text) return;
    var track = document.getElementById('announcementTrack');
    if (track) track.innerHTML = '<span>' + escapeHtml(text) + '</span><span>' + escapeHtml(text) + '</span>';
  }).catch(function () {});
}

/* ---------- TESTIMONIALS (real reviews) ---------- */
function initialsOf(name) {
  var parts = String(name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return String(name || '?').slice(0, 2).toUpperCase();
}

function testimonialCardHTML(review) {
  var stars = '';
  for (var i = 0; i < 5; i++) stars += i < review.rating ? '\u2605' : '\u2606';
  return (
    '<article class="testimonial-card reveal">' +
      '<div class="stars" aria-label="' + review.rating + ' out of 5 stars">' + stars + '</div>' +
      '<blockquote>&ldquo;' + escapeHtml(review.comment || '') + '&rdquo;</blockquote>' +
      '<div class="who">' +
        '<div class="avatar" aria-hidden="true">' + initialsOf(review.customer_name) + '</div>' +
        '<div><b>' + escapeHtml(review.customer_name) + '</b><small>on ' + escapeHtml(review.product_name) + '</small></div>' +
      '</div>' +
    '</article>'
  );
}

function loadTestimonials() {
  fetch('/api/reviews/recent').then(function (r) { return r.json(); }).then(function (data) {
    var reviews = data.reviews || [];
    var grid = document.getElementById('testimonialGrid');
    if (!grid) return;
    if (reviews.length === 0) {
      var section = document.getElementById('testimonials');
      if (section) section.style.display = 'none';
      return;
    }
    grid.innerHTML = reviews.slice(0, 3).map(testimonialCardHTML).join('');
    document.querySelectorAll('#testimonialGrid .reveal').forEach(function (el) { revealObserver.observe(el); });
  }).catch(function () {
    var section = document.getElementById('testimonials');
    if (section) section.style.display = 'none';
  });
}

/* ---------- INIT ---------- */
loadHomeProducts();
loadAnnouncementBar();
loadTestimonials();

/* Delegated click: Add to cart */
document.addEventListener('click', function (event) {
  var addBtn = event.target.closest('[data-add]');
  if (!addBtn) return;
  if (addBtn.classList.contains('card-added')) {
    window.location.href = 'cart.html';
    return;
  }
  var product = _allProducts.find(function (p) { return String(p.id) === String(addBtn.getAttribute('data-add')); });
  if (!product) return;
  if (!(product.stock > 0)) return;
  addToCart(product);
  showToast(product.name + ' added to cart');
  addBtn.textContent = 'In Cart';
  addBtn.className = 'card-added';
});

/* Keep add buttons in sync with cart state */
function renderCartState() {
  document.querySelectorAll('[data-add]').forEach(function (btn) {
    var inCart = isInCart(btn.getAttribute('data-add'));
    btn.textContent = inCart ? 'In Cart' : 'Add';
    btn.className = inCart ? 'card-added' : 'card-add';
  });
}
window.addEventListener('cart:updated', renderCartState);
window.addEventListener('pageshow', function (e) { if (e.persisted) { updateCartCount(); renderCartState(); } });
window.addEventListener('storage', function (e) { if (e.key === window.CART_KEY) { updateCartCount(); renderCartState(); } });

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

/* Countdown timer + offer banner state machine.
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

/* Load the active sale into the LIMITED OFFER banner (soonest end date wins). */
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
    if (titleEl) titleEl.textContent = (effectiveSale.title && effectiveSale.title.trim()) ? effectiveSale.title.trim() : ('On Sale Now: Save up to ' + maxPct + '%');
    if (descEl) descEl.textContent = 'Shop selected products while stock lasts. The deal ends when the timer runs out.';
    if (shopEl) shopEl.href = 'products.html?sale=' + (effectiveSale.id || 1);
    var banner = campaignBanner || effectiveSale.banner_image_url || sale.banner_image_url;
    if (imgEl && banner) imgEl.src = banner;
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
loadActiveSale();

/* Init cart badge */
updateCartCount();
