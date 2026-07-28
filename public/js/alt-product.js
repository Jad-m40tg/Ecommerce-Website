/* alt-product.js — alt-prod.html specific logic */

/* ---------- 1. PRODUCT STATE ---------- */
var PRODUCT = {
  id: 'sofa-marlow',
  name: 'Marlow Linen Sofa',
  price_cents: 129900,
  image: '/assets/furn-sofa.png'
};

var selection = {
  color: 'Natural Linen',
  size:  '3-Seater',
  qty:   1
};

/* ---------- 2. CART HELPERS ---------- */
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
function isInCart(productId) {
  return getCart().some(function (item) { return item.id === productId; });
}
function addToCart(qty, color, size) {
  var cart = getCart();
  var key = PRODUCT.id + '|' + color + '|' + size;
  var existing = cart.find(function (item) { return item.key === key; });
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      key: key,
      id: PRODUCT.id,
      name: PRODUCT.name,
      price_cents: PRODUCT.price_cents,
      image: PRODUCT.image,
      color: color,
      size: size,
      qty: qty
    });
  }
  saveCart(cart);
}

/* ---------- 3. REVIEWS ---------- */
var allReviews = [];
var REVIEWS_VISIBLE_INITIAL = 3;

function fetchReviews(productId, callback) {
  fetch('/api/reviews?product_id=' + encodeURIComponent(productId))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      allReviews = data.reviews || [];
      if (callback) callback();
    })
    .catch(function () { allReviews = []; if (callback) callback(); });
}

function submitReviewApi(productId, name, rating, comment, onSuccess) {
  fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, customer_name: name, rating: rating, comment: comment })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.id) {
        allReviews.unshift(data);
        if (onSuccess) onSuccess();
      } else {
        showToast(data.error || 'Failed to submit review');
      }
    })
    .catch(function () { showToast('Failed to submit review'); });
}

function deleteReview(reviewId) {
  fetch('/api/reviews/' + reviewId, { method: 'DELETE' })
    .then(function () {
      allReviews = allReviews.filter(function (r) { return r.id !== reviewId; });
      renderReviewsIntoPage();
    })
    .catch(function () {});
}

function renderSingleReview(r) {
  var starStr = '\u2605'.repeat(r.rating) + '\u2606'.repeat(5 - r.rating);
  var dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  return '<div class="review-card" data-review-id="' + r.id + '">' +
    '<div class="review-head">' +
      '<span class="review-name">' + escapeHtml(r.customer_name) + '</span>' +
      '<span class="review-stars">' + starStr + '</span>' +
    '</div>' +
    '<div class="review-date">' + dateStr +
      ' <button type="button" class="review-delete-btn" data-delete-id="' + r.id + '" title="Delete review" aria-label="Delete review">&times;</button>' +
    '</div>' +
    '<div class="review-text">' + escapeHtml(r.comment) + '</div>' +
  '</div>';
}

function renderReviewsIntoPage() {
  var listEl = document.getElementById('reviewsList');
  if (!listEl) return;
  if (allReviews.length === 0) {
    listEl.innerHTML = '<div class="reviews-empty">No reviews yet. Be the first to share your thoughts!</div>';
    return;
  }
  var html = '';
  var toShow = allReviews.slice(0, REVIEWS_VISIBLE_INITIAL);
  html += toShow.map(renderSingleReview).join('');
  if (allReviews.length > REVIEWS_VISIBLE_INITIAL) {
    html += '<button type="button" class="btn btn-outline" id="viewAllReviewsBtn" style="width:100%;margin-top:10px;font-size:13px;padding:10px 20px;">View all ' + allReviews.length + ' comments</button>';
    html += '<div id="extraReviews" style="display:none;">' + allReviews.slice(REVIEWS_VISIBLE_INITIAL).map(renderSingleReview).join('') + '</div>';
  }
  listEl.innerHTML = html;
  wireUpReviewDeleteButtons();
  wireUpViewAllButton();
}

function wireUpReviewDeleteButtons() {
  document.querySelectorAll('[data-delete-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = parseInt(btn.getAttribute('data-delete-id'), 10);
      if (id) deleteReview(id);
    });
  });
}

function wireUpViewAllButton() {
  var viewAllBtn = document.getElementById('viewAllReviewsBtn');
  if (!viewAllBtn) return;
  viewAllBtn.addEventListener('click', function () {
    var extra = document.getElementById('extraReviews');
    if (extra) {
      extra.style.display = 'block';
      viewAllBtn.remove();
      wireUpReviewDeleteButtons();
    }
  });
}

function wireUpStarPicker() {
  var starBtns = document.querySelectorAll('#starPicker button');
  var currentRating = 0;
  starBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentRating = Number(btn.getAttribute('data-star'));
      starBtns.forEach(function (b, i) {
        b.classList.toggle('filled', i < currentRating);
      });
    });
    btn.addEventListener('mouseenter', function () {
      var hover = Number(btn.getAttribute('data-star'));
      starBtns.forEach(function (b, i) {
        b.style.color = i < hover ? 'var(--wood)' : '';
      });
    });
    btn.addEventListener('mouseleave', function () {
      starBtns.forEach(function (b, i) {
        b.style.color = i < currentRating ? 'var(--wood)' : 'var(--beige)';
      });
    });
  });
  document.getElementById('submitReviewBtn').addEventListener('click', function () {
    var name = document.getElementById('reviewName').value.trim();
    var text = document.getElementById('reviewText').value.trim();
    if (!currentRating) { showToast('Please select a rating'); return; }
    if (!name) { showToast('Please enter your name'); return; }
    if (!text) { showToast('Please write a review'); return; }
    submitReviewApi(PRODUCT.id, name, currentRating, text, function () {
      showToast('Review submitted \u2014 thank you!');
      document.getElementById('reviewName').value = '';
      document.getElementById('reviewText').value = '';
      currentRating = 0;
      starBtns.forEach(function (b) { b.classList.remove('filled'); b.style.color = 'var(--beige)'; });
      renderReviewsIntoPage();
    });
  });
}

/* ---------- 4. HELPERS ---------- */
function money(n) { return '$' + n.toLocaleString('en-US'); }

function updateSummary() {
  document.getElementById('sumColor').textContent = selection.color;
  document.getElementById('sumSize').textContent  = selection.size;
  document.getElementById('sumQty').textContent   = selection.qty;
  document.getElementById('sumTotal').textContent = money(PRODUCT.price_cents * selection.qty / 100);
}

/* ---------- 5. DETAIL INTERACTIONS ---------- */

/* Gallery thumbnails */
var mainImg = document.getElementById('galleryMainImg');
document.querySelectorAll('#galleryThumbs button').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('#galleryThumbs button').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var thumbImg = btn.querySelector('img');
    if (thumbImg) mainImg.src = thumbImg.src;
  });
});

/* Color swatches */
document.getElementById('swatchList').addEventListener('click', function (event) {
  var swatch = event.target.closest('[data-color]');
  if (!swatch) return;
  document.querySelectorAll('#swatchList .swatch').forEach(function (s) { s.classList.remove('active'); });
  swatch.classList.add('active');
  selection.color = swatch.getAttribute('data-color');
  document.getElementById('selectedColor').textContent = selection.color;
  updateSummary();
});

/* Size selector */
document.getElementById('sizeList').addEventListener('click', function (event) {
  var size = event.target.closest('[data-size]');
  if (!size) return;
  document.querySelectorAll('#sizeList .size-pill').forEach(function (b) { b.classList.remove('active'); });
  size.classList.add('active');
  selection.size = size.getAttribute('data-size');
  document.getElementById('selectedSize').textContent = selection.size;
  updateSummary();
});

/* Quantity stepper */
var qtyInput = document.getElementById('qtyInput');
function commitQty(v) {
  var next = Math.max(1, Math.min(99, Number(v) || 1));
  qtyInput.value = next;
  selection.qty = next;
  updateSummary();
}
document.querySelectorAll('[data-qty]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    commitQty(Number(qtyInput.value) + Number(btn.getAttribute('data-qty')));
  });
});
qtyInput.addEventListener('change', function () { commitQty(qtyInput.value); });

/* Add to cart */
document.getElementById('addToCartBtn').addEventListener('click', function () {
  addToCart(selection.qty, selection.color, selection.size);
  showToast(PRODUCT.name + ' added to cart');
  this.textContent = 'In Cart';
  this.onclick = function () { window.location.href = 'cart.html'; };
});

/* Wishlist toggle */
var wishBtn = document.getElementById('wishlistBtn');
var wished = false;
wishBtn.addEventListener('click', function () {
  wished = !wished;
  wishBtn.innerHTML = '<span class="material-symbols-outlined">' + (wished ? 'favorite' : 'favorite_border') + '</span>';
  wishBtn.style.color = wished ? 'var(--wood)' : '';
  wishBtn.style.borderColor = wished ? 'var(--wood)' : '';
  showToast(wished ? 'Added to wishlist' : 'Removed from wishlist');
});

/* ---------- 6. ORDER FORM ---------- */
var formRules = {
  fName:    function (v) { return v.trim().length < 2 ? 'Please enter your full name.' : ''; },
  fPhone:   function (v) { var d = v.replace(/[^0-9]/g, ''); return d.length < 7 ? 'Please enter a valid phone number.' : ''; },
  fEmail:   function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Please enter a valid email.'; },
  fAddress: function (v) { return v.trim().length < 5 ? 'Please enter your delivery address.' : ''; },
  fCity:    function (v) { return v.trim().length < 2 ? 'Please enter your city.' : ''; }
};

function setFieldError(name, message) {
  var input = document.getElementById(name);
  var msg = document.querySelector('[data-msg-for="' + name + '"]');
  if (message) { if (input) input.classList.add('error'); if (msg) msg.textContent = message; }
  else { if (input) input.classList.remove('error'); if (msg) msg.textContent = ''; }
}

Object.keys(formRules).forEach(function (name) {
  var input = document.getElementById(name);
  if (!input) return;
  input.addEventListener('blur', function () { setFieldError(name, formRules[name](input.value)); });
  input.addEventListener('input', function () { if (input.classList.contains('error')) setFieldError(name, ''); });
});

var modal = document.getElementById('orderModal');

function openModal() {
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(function () { document.getElementById('modalCloseBtn').focus(); }, 200);
}
function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('orderForm').addEventListener('submit', function (event) {
  event.preventDefault();
  var firstInvalid = null;
  Object.keys(formRules).forEach(function (name) {
    var input = document.getElementById(name);
    if (!input) return;
    var error = formRules[name](input.value);
    setFieldError(name, error);
    if (error && !firstInvalid) firstInvalid = input;
  });
  if (firstInvalid) { firstInvalid.focus(); showToast('Please fix the highlighted fields'); return; }

  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: document.getElementById('fName').value,
      customer_email: document.getElementById('fEmail').value,
      customer_phone: document.getElementById('fPhone').value,
      customer_address: document.getElementById('fAddress').value,
      customer_city: document.getElementById('fCity').value,
      items: [{ product_id: PRODUCT.id, quantity: selection.qty }],
      notes: (document.getElementById('fNotes') && document.getElementById('fNotes').value) || ''
    })
  }).then(function (r) { return r.json(); }).then(function () {
    openModal();
  }).catch(function () {
    openModal();
  });
});

document.getElementById('modalCloseBtn').addEventListener('click', function () {
  closeModal();
  document.getElementById('orderForm').reset();
});
modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

/* ---------- 7. UI HELPERS ---------- */
document.getElementById('menuToggle').addEventListener('click', function () {
  document.getElementById('navLinks').classList.toggle('open');
});

var revealObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

var toastTimer = null;
function showToast(message) {
  var toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
}

/* ---------- 8. API PRODUCT LOADING ---------- */
function loadProductFromAPI() {
  var params = new URLSearchParams(window.location.search);
  var requestedId = params.get('id');
  if (!requestedId) return;
  fetch('/api/products/browse')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var items = data.products || data.data || data;
      if (!Array.isArray(items)) return;
      var found = items.find(function (p) { return String(p.id) === requestedId || p.slug === requestedId; });
      if (!found) return;
      var imgs = [];
      try { imgs = JSON.parse(found.images || '[]'); } catch (e) { imgs = []; }
      var img = imgs[0] || found.image || '/assets/furn-sofa.png';
      PRODUCT.id = String(found.id || found.slug);
      PRODUCT.name = found.name || PRODUCT.name;
      PRODUCT.price_cents = found.price_cents || PRODUCT.price_cents;
      PRODUCT.image = img;
      var nameEl = document.getElementById('productName');
      if (nameEl) nameEl.textContent = PRODUCT.name;
      var priceEl = document.getElementById('productPrice');
      if (priceEl) priceEl.textContent = '$' + Math.round(PRODUCT.price_cents / 100).toLocaleString();
      var imgEl = document.getElementById('galleryMainImg');
      if (imgEl) { imgEl.src = PRODUCT.image; imgEl.alt = PRODUCT.name; }
      var crumb = document.getElementById('crumbName');
      if (crumb) crumb.textContent = PRODUCT.name;
    })
    .catch(function () {});
}

/* ---------- 9. INIT ---------- */
loadProductFromAPI();
updateCartCount();
fetchReviews(PRODUCT.id, function () {
  renderReviewsIntoPage();
  wireUpStarPicker();
});