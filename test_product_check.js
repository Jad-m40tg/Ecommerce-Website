    /* ---------- 1. GLOBALS ---------- */
    var CART_KEY = 'boularas-cart';
    var currentProduct = null;

    function getCart() {
      try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
      catch (e) { return []; }
    }
    function saveCart(cart) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartCount();
    }
    function addToCart(productId, qty, color, size) {
      qty = Math.max(1, qty || 1);
      if (!currentProduct) return;
      var cart = getCart();
      var key = currentProduct.id + '|' + (color || '') + '|' + (size || '');
      var existing = cart.find(function (item) { return item.key === key; });
      if (existing) { existing.qty += qty; }
      else {
        cart.push({
          key: key,
          id: currentProduct.id,
          name: currentProduct.name,
          price_cents: currentProduct.price_cents,
          image: currentProduct.image,
          color: color || '',
          size: size || '',
          qty: qty
        });
      }
      saveCart(cart);
      showToast(currentProduct.name + ' added to cart');
    }
    function updateCartCount() {
      var total = getCart().reduce(function (sum, item) { return sum + item.qty; }, 0);
      var el = document.getElementById('cartCount');
      if (el) el.textContent = total;
    }
    function isInCart(productId) {
      return getCart().some(function (item) { return item.id === productId; });
    }

    var selection = { color: '', size: '', qty: 1 };

    /* ---------- 2. IMAGE HELPERS ---------- */
    var FALLBACK_IMAGES = {
      'living-room': '/assets/furn-sofa.png',
      'dining-room': '/assets/furn-table.png',
      'bedroom': '/assets/furn-bed.png',
      'office': '/assets/furn-desk.png',
      'outdoor': '/assets/furn-sofa.png',
      'storage': '/assets/furn-shelf.png',
      'lighting': '/assets/furn-lamp.png',
      'decor': '/assets/furn-decor.png'
    };

    function fallbackImage(category) {
      return FALLBACK_IMAGES[category] || '/assets/furn-sofa.png';
    }

    function getProductImage(product) {
      var images = [];
      try { images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []); }
      catch (e) { images = []; }
      if (images.length > 0 && images[0]) return images[0];
      return fallbackImage(product.category);
    }

    /* ---------- 3. CATEGORY LABELS ---------- */
    var CATEGORY_LABELS = {};
    function getCategoryLabel(slug) {
      if (CATEGORY_LABELS[slug]) return CATEGORY_LABELS[slug];
      return slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : '';
    }

    /* ---------- 4. LOAD CATEGORIES FROM API ---------- */
    fetch('/api/categories').then(function (r) { return r.json(); }).then(function (data) {
      var cats = data.categories || data;
      if (Array.isArray(cats)) {
        cats.forEach(function (c) { CATEGORY_LABELS[c.slug] = c.name; });
      }
    }).catch(function () {});

    /* ---------- 5. LOAD PRODUCT FROM API ---------- */
    var params = new URLSearchParams(window.location.search);
    var requestedId = params.get('id');

    function showNotFound() {
      document.getElementById('breadcrumb').innerHTML =
        '<a href="althome.html">Home</a><span class="sep">/</span>' +
        '<a href="products.html">Shop</a><span class="sep">/</span>' +
        '<span class="current">Product not found</span>';
      document.getElementById('productRoot').innerHTML =
        '<div class="not-found">' +
          '<h2>We couldn&rsquo;t find that product</h2>' +
          '<p>It may have been renamed or moved. Browse the full collection to find something you&rsquo;ll love.</p>' +
          '<a href="products.html" class="btn btn-primary">Back to Shop</a>' +
        '</div>';
    }

    if (!requestedId) {
      showNotFound();
    } else {
      document.getElementById('breadcrumb').innerHTML = '<span style="color:var(--gray)">Loading...</span>';
      fetch('/api/products/browse/' + encodeURIComponent(requestedId))
        .then(function (r) {
          if (!r.ok) throw new Error('Not found');
          return r.json();
        })
        .then(function (apiProduct) {
          currentProduct = {
            id: apiProduct.id,
            name: apiProduct.name,
            description: apiProduct.description || '',
            category: apiProduct.category || '',
            price_cents: apiProduct.price_cents || 0,
            old_price_cents: apiProduct.old_price_cents || null,
            stock: apiProduct.stock || 0,
            colors: [],
            sizes: [],
            tags: [],
            image: getProductImage(apiProduct),
            featured: apiProduct.featured,
            on_sale: apiProduct.on_sale
          };
          try { currentProduct.colors = typeof apiProduct.colors === 'string' ? JSON.parse(apiProduct.colors) : (apiProduct.colors || []); } catch (e) { currentProduct.colors = []; }
          try { currentProduct.sizes = typeof apiProduct.sizes === 'string' ? JSON.parse(apiProduct.sizes) : (apiProduct.sizes || []); } catch (e) { currentProduct.sizes = []; }
          try { currentProduct.tags = typeof apiProduct.tags === 'string' ? JSON.parse(apiProduct.tags) : (apiProduct.tags || []); } catch (e) { currentProduct.tags = []; }

          document.getElementById('orderSection').style.display = 'block';
          fetchReviewsAndRender(currentProduct);
          if (isInCart(currentProduct.id)) {
            var btn = document.getElementById('addToCartBtn');
            if (btn) { btn.textContent = 'In Cart'; btn.onclick = function () { window.location.href = 'cart.html'; }; }
          }
        })
        .catch(function () {
          showNotFound();
        });
    }

    /* ---------- 6. REVIEWS ---------- */
    var currentReviews = [];

    function fetchReviewsAndRender(product) {
      fetch('/api/reviews?product_id=' + product.id)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          currentReviews = data.reviews || [];
          renderProduct(product);
          renderRelated(product);
          wireUpReviewDeleteButtons();
          wireUpViewAllButton();
        })
        .catch(function () {
          currentReviews = [];
          renderProduct(product);
          renderRelated(product);
        });
    }

    function renderReviews(productId) {
      if (currentReviews.length === 0) {
        return '<div class="reviews-empty">No reviews yet. Be the first to share your thoughts!</div>';
      }
      return currentReviews.map(function (review) {
        var stars = '';
        for (var i = 0; i < 5; i++) {
          stars += i < review.rating ? '&#9733;' : '&#9734;';
        }
        var date = review.created_at ? new Date(review.created_at).toLocaleDateString() : '';
        return '<div class="review-card">' +
          '<div class="review-head">' +
            '<div><span class="review-name">' + escapeHtml(review.customer_name) + '</span> <span class="review-stars">' + stars + '</span></div>' +
            '<div><span class="review-date">' + date + '</span> <button type="button" class="review-delete-btn" data-review-id="' + review.id + '" aria-label="Delete review" title="Delete review">&#10005;</button></div>' +
          '</div>' +
          '<p class="review-text">' + escapeHtml(review.comment) + '</p>' +
        '</div>';
      }).join('');
    }

    function wireUpReviewDeleteButtons() {
      document.querySelectorAll('[data-review-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var reviewId = btn.getAttribute('data-review-id');
          if (!confirm('Delete this review?')) return;
          fetch('/api/reviews/' + reviewId, { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function () {
              currentReviews = currentReviews.filter(function (r) { return String(r.id) !== String(reviewId); });
              var list = document.getElementById('reviewsList');
              if (list) list.innerHTML = renderReviews(currentProduct ? currentProduct.id : 0);
              showToast('Review deleted');
            })
            .catch(function () { showToast('Could not delete review'); });
        });
      });
    }

    function wireUpViewAllButton() {
      var viewAll = document.getElementById('viewAllReviewsBtn');
      if (viewAll) {
        viewAll.addEventListener('click', function () {
          var list = document.getElementById('reviewsList');
          if (list) list.innerHTML = renderReviews(currentProduct ? currentProduct.id : 0);
        });
      }
    }

    function submitReview(productId) {
      var nameInput = document.getElementById('reviewName');
      var textInput = document.getElementById('reviewText');
      var starPicker = document.getElementById('starPicker');
      var name = nameInput ? nameInput.value.trim() : '';
      var comment = textInput ? textInput.value.trim() : '';
      var rating = starPicker ? starPicker.getAttribute('data-selected') || '5' : '5';

      if (!name) { showToast('Please enter your name'); return; }
      if (!comment) { showToast('Please write a review'); return; }

      fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, customer_name: name, rating: parseInt(rating), comment: comment })
      })
        .then(function (r) { return r.json(); })
        .then(function (newReview) {
          currentReviews.unshift(newReview);
          var list = document.getElementById('reviewsList');
          if (list) list.innerHTML = renderReviews(productId);
          if (nameInput) nameInput.value = '';
          if (textInput) textInput.value = '';
          showToast('Review submitted!');
          wireUpReviewDeleteButtons();
        })
        .catch(function () { showToast('Could not submit review'); });
    }

    /* ---------- 7. RENDER PRODUCT ---------- */

    function renderProduct(p) {
      var description = p.description || 'A thoughtfully designed piece from the Boularas collection.';
      var colors = p.colors && p.colors.length > 0 ? p.colors : ['Natural'];
      var sizes = p.sizes && p.sizes.length > 0 ? p.sizes : ['Standard'];

      var priceDollars = Math.round(p.price_cents / 100);
      var oldPriceDollars = p.old_price_cents ? Math.round(p.old_price_cents / 100) : null;

      var reviewCount = currentReviews.length;
      var avgRating = 4.7;
      if (reviewCount > 0) {
        var sum = currentReviews.reduce(function (s, r) { return s + r.rating; }, 0);
        avgRating = Math.round((sum / reviewCount) * 10) / 10;
      }
      var stars = '\u2605'.repeat(Math.round(avgRating)) + '\u2606'.repeat(5 - Math.round(avgRating));

      var catLabel = getCategoryLabel(p.category);
      document.getElementById('breadcrumb').innerHTML =
        '<a href="althome.html">Home</a><span class="sep">/</span>' +
        '<a href="products.html">Shop</a><span class="sep">/</span>' +
        '<a href="products.html?category=' + encodeURIComponent(p.category) + '">' + escapeHtml(catLabel) + '</a>' +
        '<span class="sep">/</span>' +
        '<span class="current">' + escapeHtml(p.name) + '</span>';

      var badgeHTML = '';
      if (p.on_sale) badgeHTML = '<span class="gallery-badge sale">Sale</span>';
      else if (p.featured) badgeHTML = '<span class="gallery-badge">New</span>';

      var oldPriceHTML = oldPriceDollars ? '<s>' + price(oldPriceDollars * 100) + '</s>' : '';
      var saveHTML = oldPriceDollars ? '<span class="save">Save ' + price((oldPriceDollars - priceDollars) * 100) + '</span>' : '';

      var thumbs = [0, 1, 2, 3].map(function (i) {
        return '<button type="button" class="' + (i === 0 ? 'active' : '') + '" data-thumb="' + i + '" aria-label="View image ' + (i + 1) + '"><img src="' + p.image + '" alt="" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" /></button>';
      }).join('');

      var swatches;
      if (typeof colors[0] === 'object') {
        swatches = colors.map(function (c, i) {
          var hex = c.hex || '#e8e0d3';
          var name = c.name || c;
          return '<button type="button" class="swatch ' + (i === 0 ? 'active' : '') + '" style="background:' + hex + '" data-color="' + escapeHtml(name) + '" aria-label="Color: ' + escapeHtml(name) + '"></button>';
        }).join('');
        selection.color = colors[0].name || colors[0];
      } else {
        var colorNames = ['#e8e0d3', '#6b7f5e', '#2b2926', '#a67c52', '#c9a97a'];
        swatches = colors.map(function (name, i) {
          return '<button type="button" class="swatch ' + (i === 0 ? 'active' : '') + '" style="background:' + (colorNames[i] || '#e8e0d3') + '" data-color="' + escapeHtml(name) + '" aria-label="Color: ' + escapeHtml(name) + '"></button>';
        }).join('');
        selection.color = colors[0];
      }

      var sizePills = sizes.map(function (s, i) {
        var label = typeof s === 'object' ? s.name : s;
        return '<button type="button" class="size-pill ' + (i === 0 ? 'active' : '') + '" data-size="' + escapeHtml(label) + '">' + escapeHtml(label) + '</button>';
      }).join('');
      selection.size = typeof sizes[0] === 'object' ? (sizes[0].name || sizes[0]) : sizes[0];
      selection.qty = 1;

      var reviewsHTML = renderReviews(p.id);

      var stockHTML = p.stock > 0
        ? '<div class="stock-note">In stock &middot; ships in 2&ndash;4 days</div>'
        : '<div class="stock-note" style="color:var(--wood)">Out of stock</div>';

      document.getElementById('productRoot').innerHTML =
        '<div class="product-detail">' +

          '<div class="reveal">' +
            '<div class="gallery-main">' +
              badgeHTML +
              '<img id="galleryMainImg" src="' + p.image + '" alt="' + escapeHtml(p.name) + '" onerror="handleImageError(this)" data-category="' + (p.category || '') + '" />' +
            '</div>' +
            '<div class="gallery-thumbs">' + thumbs + '</div>' +

            '<div class="reviews-section" id="reviewsSection">' +
              '<h2>Customer Reviews</h2>' +
              '<div class="review-form-card">' +
                '<div class="form-group">' +
                  '<label>Your Rating</label>' +
                  '<div class="star-picker" id="starPicker" data-selected="5">' +
                    '<button type="button" data-star="1" aria-label="1 star">&#9733;</button>' +
                    '<button type="button" data-star="2" aria-label="2 stars">&#9733;</button>' +
                    '<button type="button" data-star="3" aria-label="3 stars">&#9733;</button>' +
                    '<button type="button" data-star="4" aria-label="4 stars">&#9733;</button>' +
                    '<button type="button" data-star="5" aria-label="5 stars">&#9733;</button>' +
                  '</div>' +
                '</div>' +
                '<div class="form-group">' +
                  '<label for="reviewName">Your Name</label>' +
                  '<input type="text" id="reviewName" placeholder="Your name" />' +
                '</div>' +
                '<div class="form-group">' +
                  '<label for="reviewText">Your Review</label>' +
                  '<textarea id="reviewText" placeholder="Share your thoughts about this product&hellip;"></textarea>' +
                '</div>' +
                '<button type="button" class="btn btn-primary" id="submitReviewBtn">Submit Review</button>' +
              '</div>' +
              '<div id="reviewsList">' + reviewsHTML + '</div>' +
            '</div>' +
          '</div>' +

          '<div class="product-info reveal">' +
            '<div class="info-category">' + escapeHtml(catLabel) + '</div>' +
            '<h1>' + escapeHtml(p.name) + '</h1>' +

            '<div class="info-rating">' +
              '<span class="stars">' + stars + '</span>' +
              '<small>' + avgRating + ' &middot; ' + reviewCount + ' review' + (reviewCount !== 1 ? 's' : '') + '</small>' +
            '</div>' +

            '<div class="info-price">' +
              '<span class="price">' + price(p.price_cents) + '</span>' +
              oldPriceHTML +
              saveHTML +
            '</div>' +
            stockHTML +

            '<p class="info-desc">' + escapeHtml(description) + '</p>' +

            '<div class="option-block">' +
              '<label>Color <span>&mdash; <b id="selectedColor">' + escapeHtml(selection.color) + '</b></span></label>' +
              '<div class="swatches" id="swatchList">' + swatches + '</div>' +
            '</div>' +

            '<div class="option-block">' +
              '<label>Size <span>&mdash; <b id="selectedSize">' + escapeHtml(selection.size) + '</b></span></label>' +
              '<div class="size-list" id="sizeList">' + sizePills + '</div>' +
            '</div>' +

            '<div class="option-block">' +
              '<label>Quantity</label>' +
              '<div class="buy-row">' +
                '<div class="qty">' +
                  '<button type="button" data-qty="-1" aria-label="Decrease quantity">&minus;</button>' +
                  '<input type="number" id="qtyInput" value="1" min="1" max="99" aria-label="Quantity" />' +
                  '<button type="button" data-qty="1" aria-label="Increase quantity">+</button>' +
                '</div>' +
                '<button type="button" class="btn btn-primary" id="addToCartBtn"' + (p.stock <= 0 ? ' disabled style="opacity:0.5;pointer-events:none;"' : '') + '>Add to Cart</button>' +
                '<button type="button" class="btn-icon" id="wishlistBtn" aria-label="Add to wishlist" title="Add to wishlist"><span class="material-symbols-outlined">favorite_border</span></button>' +
              '</div>' +
            '</div>' +

            '<div class="perks">' +
              '<div><b>Free Delivery</b>On orders over $500</div>' +
              '<div><b>10-Year Warranty</b>On every frame</div>' +
              '<div><b>30-Day Returns</b>Hassle-free</div>' +
            '</div>' +

            '<div class="tabs">' +
              '<div class="tab-nav" role="tablist">' +
                '<button type="button" class="active" data-tab="desc" role="tab">Description</button>' +
                '<button type="button" data-tab="specs" role="tab">Specifications</button>' +
                '<button type="button" data-tab="ship" role="tab">Shipping &amp; Returns</button>' +
              '</div>' +
              '<div class="tab-panels">' +
                '<div class="tab-panel active" data-panel="desc">' +
                  '<h3>About this piece</h3>' +
                  '<p>' + escapeHtml(description) + '</p>' +
                '</div>' +
                '<div class="tab-panel" data-panel="specs">' +
                  '<h3>The details</h3>' +
                  '<table class="specs-table"><tbody>' +
                    '<tr><th>Brand</th><td>' + escapeHtml(p.brand || 'Boularas') + '</td></tr>' +
                    '<tr><th>Category</th><td>' + escapeHtml(catLabel) + '</td></tr>' +
                    (p.sku ? '<tr><th>SKU</th><td>' + escapeHtml(p.sku) + '</td></tr>' : '') +
                  '</tbody></table>' +
                '</div>' +
                '<div class="tab-panel" data-panel="ship">' +
                  '<h3>Delivery &amp; returns</h3>' +
                  '<p><b>Free delivery</b> on orders over $500. Standard delivery takes 2&ndash;4 business days; larger pieces are scheduled with a two-hour window.</p>' +
                  '<p><b>30-day returns.</b> Not the right fit? Send it back within 30 days for a full refund &mdash; we&rsquo;ll even collect it from your door.</p>' +
                  '<p><b>10-year warranty</b> covers frames, joinery, and mechanisms. Everyday wear on upholstery and finishes is normal and expected.</p>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      wireUpDetail(p, colors);
      updateOrderSummary(p);
    }

    /* ---------- WIRE UP INTERACTIONS ---------- */
    function wireUpDetail(p, colors) {
      document.querySelectorAll('[data-thumb]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('[data-thumb]').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
        });
      });

      document.getElementById('swatchList').addEventListener('click', function (event) {
        var swatch = event.target.closest('[data-color]');
        if (!swatch) return;
        document.querySelectorAll('#swatchList .swatch').forEach(function (s) { s.classList.remove('active'); });
        swatch.classList.add('active');
        selection.color = swatch.getAttribute('data-color');
        document.getElementById('selectedColor').textContent = selection.color;
        updateOrderSummary(p);
      });

      var sizeList = document.getElementById('sizeList');
      if (sizeList) {
        sizeList.addEventListener('click', function (event) {
          var pill = event.target.closest('[data-size]');
          if (!pill) return;
          document.querySelectorAll('#sizeList .size-pill').forEach(function (s) { s.classList.remove('active'); });
          pill.classList.add('active');
          selection.size = pill.getAttribute('data-size');
          document.getElementById('selectedSize').textContent = selection.size;
          updateOrderSummary(p);
        });
      }

      var qtyInput = document.getElementById('qtyInput');
      document.querySelectorAll('[data-qty]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var step = Number(btn.getAttribute('data-qty'));
          var next = Math.max(1, Math.min(99, Number(qtyInput.value) + step));
          qtyInput.value = next;
          selection.qty = next;
          updateOrderSummary(p);
        });
      });
      if (qtyInput) {
        qtyInput.addEventListener('change', function () {
          selection.qty = Math.max(1, Math.min(99, Number(qtyInput.value) || 1));
          qtyInput.value = selection.qty;
          updateOrderSummary(p);
        });
      }

      document.getElementById('addToCartBtn').addEventListener('click', function () {
        addToCart(p.id, selection.qty, selection.color, selection.size);
        this.textContent = 'In Cart';
        this.onclick = function () { window.location.href = 'cart.html'; };
      });

      var wishBtn = document.getElementById('wishlistBtn');
      var wished = false;
      if (wishBtn) {
        wishBtn.addEventListener('click', function () {
          wished = !wished;
          wishBtn.innerHTML = '<span class="material-symbols-outlined">' + (wished ? 'favorite' : 'favorite_border') + '</span>';
          wishBtn.style.color = wished ? 'var(--wood)' : '';
          wishBtn.style.borderColor = wished ? 'var(--wood)' : '';
          var icon = wishBtn.querySelector('.material-symbols-outlined');
          if (icon) icon.style.fontVariationSettings = wished ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";
          showToast(wished ? 'Added to wishlist' : 'Removed from wishlist');
        });
      }

      document.querySelectorAll('[data-tab]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var name = btn.getAttribute('data-tab');
          document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.remove('active'); });
          document.querySelectorAll('[data-panel]').forEach(function (panel) {
            panel.classList.toggle('active', panel.getAttribute('data-panel') === name);
          });
          btn.classList.add('active');
        });
      });

      /* Star picker for reviews */
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
        submitReview(p.id, name, currentRating, text, function () {
          showToast('Review submitted — thank you!');
          document.getElementById('reviewName').value = '';
          document.getElementById('reviewText').value = '';
          currentRating = 0;
          starBtns.forEach(function (b) { b.classList.remove('filled'); b.style.color = 'var(--beige)'; });
          reRenderReviews(p.id);
        });
      });
    }

    /* ---------- ORDER FORM ---------- */
    function updateOrderSummary(p) {
      var sumName = document.getElementById('sumName');
      var sumColor = document.getElementById('sumColor');
      var sumSize = document.getElementById('sumSize');
      var sumQty = document.getElementById('sumQty');
      var sumTotal = document.getElementById('sumTotal');
      if (sumName) sumName.textContent = p.name;
      if (sumColor) sumColor.textContent = selection.color;
      if (sumSize) sumSize.textContent = selection.size;
      if (sumQty) sumQty.textContent = selection.qty;
      if (sumTotal) sumTotal.textContent = price(p.price_cents * selection.qty);
    }

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
      openModal();
    });

    document.getElementById('modalCloseBtn').addEventListener('click', function () {
      closeModal();
      document.getElementById('orderForm').reset();
      if (document.getElementById('qtyInput')) document.getElementById('qtyInput').value = 1;
    });
    modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    /* ---------- RELATED PRODUCTS ---------- */
    function relatedProductCard(p) {
      var img = getProductImage(p);
      var badge = '';
      if (p.on_sale) badge = '<span class="card-badge sale">Sale</span>';
      else if (p.featured) badge = '<span class="card-badge">New</span>';
      var oldPriceHTML = p.old_price_cents ? '<s>' + price(p.old_price_cents) + '</s>' : '';
      var inCart = isInCart(p.id);
      var btnClass = inCart ? 'card-added' : 'card-add';
      var btnText = inCart ? 'In Cart' : 'Add';
      return '<article class="product-card">' +
        '<a href="product.html?id=' + p.id + '" class="card-media">' + badge +
        '<img src="' + img + '" alt="' + escapeHtml(p.name) + '" loading="lazy" onerror="imgOnError(this)" /></a>' +
        '<div class="card-body">' +
          '<div class="card-category">' + escapeHtml(getCategoryLabel(p.category)) + '</div>' +
          '<h3><a href="product.html?id=' + p.id + '">' + escapeHtml(p.name) + '</a></h3>' +
          '<div class="card-price-row">' +
            '<div class="card-price">' + price(p.price_cents) + oldPriceHTML + '</div>' +
            '<button class="' + btnClass + '" type="button" data-add="' + p.id + '">' + btnText + '</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }

    function renderRelated(cur) {
      var fetchUrl = '/api/products/browse?limit=8';
      if (cur.category) fetchUrl += '&category=' + encodeURIComponent(cur.category);
      fetch(fetchUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var items = data.products || [];
          var related = items.filter(function (p) { return p.id !== cur.id; }).slice(0, 6);
          if (related.length === 0) return;
          document.getElementById('relatedSection').style.display = 'block';
          document.getElementById('relatedRow').innerHTML = related.map(relatedProductCard).join('');
        })
        .catch(function () {});
    }

    document.addEventListener('click', function (event) {
      var addButton = event.target.closest('[data-add]');
      if (!addButton) return;
      if (addButton.classList.contains('card-added')) { window.location.href = 'cart.html'; return; }
      var productId = parseInt(addButton.getAttribute('data-add'), 10);
      fetch('/api/products/browse/' + productId)
        .then(function (r) { return r.json(); })
        .then(function (prod) {
          var cart = getCart();
          var existing = cart.find(function (item) { return item.id === productId; });
          if (existing) { existing.qty += 1; }
          else {
            cart.push({
              key: productId + '|',
              id: productId,
              name: prod.name,
              price_cents: prod.price_cents,
              image: getProductImage(prod),
              color: '',
              size: '',
              qty: 1
            });
          }
          saveCart(cart);
          addButton.textContent = 'In Cart';
          addButton.className = 'card-added';
          showToast(prod.name + ' added to cart');
        })
        .catch(function () {});
    });

    document.querySelectorAll('[data-scroll]').forEach(function (button) {
      button.addEventListener('click', function () {
        var row = document.getElementById(button.getAttribute('data-target'));
        if (!row) return;
        var dir = button.getAttribute('data-scroll') === 'left' ? -1 : 1;
        row.scrollBy({ left: dir * (row.clientWidth * 0.8), behavior: 'smooth' });
      });
    });

    /* ---------- UI HELPERS ---------- */
    document.getElementById('menuToggle').addEventListener('click', function () {
      document.getElementById('navLinks').classList.toggle('open');
    });

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); revealObserver.unobserve(entry.target); }
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

    updateCartCount();