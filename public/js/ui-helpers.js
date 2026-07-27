/* ============================================================
   UI HELPERS — Shared UI behaviors (load on ALL pages)
   ============================================================ */

/* ---------- Mobile hamburger menu toggle ---------- */
function initMenuToggle() {
  const toggle = document.getElementById('menuToggle');
  const links  = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }
}

/* ---------- Reveal-on-scroll (IntersectionObserver) ---------- */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

function observeReveals() {
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => revealObserver.observe(el));
}

/* ---------- Toast notification ---------- */
let _toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ---------- Delegated add-to-cart for product cards ---------- */
/* Uses unified addToCart from cart-utils.js */
function initDelegatedAddToCart() {
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-add]');
    if (!btn) return;

    // If already "In Cart", navigate to cart
    if (btn.classList.contains('card-added')) {
      window.location.href = 'cart.html';
      return;
    }

    const productId = btn.getAttribute('data-add');
    if (typeof addToCart === 'function') {
      addToCart(productId);
    }
    btn.textContent = 'In Cart';
    btn.className = 'card-added';
  });
}

/* ---------- Arrow button scrolling for horizontal rows ---------- */
function initRowScrollButtons() {
  document.querySelectorAll('[data-scroll]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = document.getElementById(btn.getAttribute('data-target'));
      if (!row) return;
      const dir = btn.getAttribute('data-scroll') === 'left' ? -1 : 1;
      row.scrollBy({ left: dir * (row.clientWidth * 0.8), behavior: 'smooth' });
    });
  });
}

/* ---------- Boot all helpers on DOM ready ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initMenuToggle();
  observeReveals();
  initDelegatedAddToCart();
  initRowScrollButtons();
  updateCartCount(); // ensure badge shows on load
});

/* Expose for inline scripts that need to re-observe after dynamic content */
window.observeReveals = observeReveals;
window.showToast = showToast;