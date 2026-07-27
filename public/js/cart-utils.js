/* ============================================================
   CART UTILS — Shared cart functions (load on ALL pages)
   Single source of truth for localStorage key + cart shape
   ============================================================ */
const CART_KEY = 'havenwood-cart';

/** Get cart array from localStorage (never throws) */
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

/** Save cart + update navbar badge */
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

/** Unified addToCart:
 *  productId (number|string) — required
 *  options: { qty, color, size } — optional, used for variant matching
 *  Cart item shape:
 *    { key, id, name, price_cents, image, color, size, qty }
 *  `key` = `${id}|${color||''}|${size||''}` so variants stack separately
 */
function addToCart(productId, options = {}) {
  const { qty = 1, color = '', size = '' } = options;
  const product = findProductById(productId);
  if (!product) return;

  const cart = getCart();
  const key = String(productId) + '|' + color + '|' + size;
  const existing = cart.find(item => item.key === key);

  if (existing) {
    existing.qty += Math.max(1, qty);
  } else {
    cart.push({
      key,
      id: product.id,
      name: product.name,
      price_cents: product.price_cents,
      image: getProductImage(product),
      color,
      size,
      qty: Math.max(1, qty)
    });
  }
  saveCart(cart);
  showToast(product.name + ' added to cart');
}

/** Find product in whatever global PRODUCTS array exists on the page */
function findProductById(id) {
  if (typeof window.PRODUCTS !== 'undefined' && Array.isArray(window.PRODUCTS)) {
    return window.PRODUCTS.find(p => String(p.id) === String(id));
  }
  return null;
}

/** Update navbar cart badge */
function updateCartCount() {
  const total = getCart().reduce((sum, item) => sum + item.qty, 0);
  const el = document.getElementById('cartCount');
  if (el) el.textContent = total;
}

/** Check if product (by base id) is in cart — used for "In Cart" button state */
function isInCart(productId) {
  return getCart().some(item => String(item.id) === String(productId));
}

/** Expose to window for inline scripts */
window.CART_KEY = CART_KEY;
window.getCart = getCart;
window.saveCart = saveCart;
window.addToCart = addToCart;
window.updateCartCount = updateCartCount;
window.isInCart = isInCart;
window.findProductById = findProductById;