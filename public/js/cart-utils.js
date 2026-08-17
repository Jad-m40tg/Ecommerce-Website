/* ============================================================
   CART UTILS — Shared cart functions (load on ALL pages)
   Single source of truth for localStorage key + cart shape
   ============================================================ */
var CART_KEY = 'boularas-cart';

/* Build a cart line key: String(id) + '::' + (color || '') + '::' + (size || '') */
function buildCartKey(id, color, size) {
  return String(id) + '::' + (color || '') + '::' + (size || '');
}

/* Parse a product's variant lists (arrays OR JSON strings), always returns arrays */
function parseVariants(product) {
  var colors = [];
  var sizes = [];
  if (!product) return { colors: colors, sizes: sizes };
  try { colors = typeof product.colors === 'string' ? JSON.parse(product.colors) : product.colors; }
  catch (e) { colors = []; }
  try { sizes = typeof product.sizes === 'string' ? JSON.parse(product.sizes) : product.sizes; }
  catch (e) { sizes = []; }
  if (!Array.isArray(colors)) colors = [];
  if (!Array.isArray(sizes)) sizes = [];
  return { colors: colors, sizes: sizes };
}

/* Variant entry to string: objects ({name,hex}) yield their name */
function variantName(v) {
  return (typeof v === 'object' && v !== null) ? String(v.name || '') : String(v);
}

/* Default variant selection: first color / first size, both '' when none */
function resolveVariantDefaults(product) {
  var variants = parseVariants(product);
  var color = '';
  var size = '';
  if (variants.colors.length > 0) color = variantName(variants.colors[0]);
  if (variants.sizes.length > 0) size = variantName(variants.sizes[0]);
  return { color: color, size: size };
}

/* One-time migration for legacy keys ('|'-separated, bare ids, random suffixes).
   Rebuilds every key, merges duplicates, returns the ORIGINAL array when nothing changed. */
function migrateCart(cart) {
  if (!Array.isArray(cart)) return [];
  var out = [];
  var seen = {};
  var changed = false;
  for (var i = 0; i < cart.length; i++) {
    var item = cart[i] || {};
    var color = item.color === undefined ? '' : item.color;
    var size = item.size === undefined ? '' : item.size;
    var key = buildCartKey(item.id, color, size);
    if (key !== item.key || color !== item.color || size !== item.size) changed = true;
    if (seen.hasOwnProperty(key)) {
      var existing = seen[key];
      changed = true;
      for (var p in item) {
        if (!item.hasOwnProperty(p)) continue;
        if (typeof item[p] === 'number' && p !== 'id' && p !== 'price_cents') {
          existing[p] = (existing[p] || 0) + item[p];
        }
      }
    } else {
      item.key = key;
      item.color = color;
      item.size = size;
      seen[key] = item;
      out.push(item);
    }
  }
  return changed ? out : cart;
}

/* Read the cart from localStorage (never throws), migrating legacy data on read */
function getCart() {
  var cart;
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch (e) { cart = []; }
  var migrated = migrateCart(cart);
  if (migrated !== cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(migrated)); } catch (e) {}
  }
  return migrated;
}

/* Persist cart + refresh badge + notify listeners */
function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  updateCartCount();
  try { window.dispatchEvent(new CustomEvent('cart:updated', { detail: cart })); } catch (e) {}
}

/* Update the navbar badge */
function updateCartCount() {
  var el = document.getElementById('cartCount');
  if (!el) return;
  el.textContent = getCartCount();
}

/* Add a product (or bump qty of an existing line). Returns true on success. */
function addToCart(product, opts) {
  opts = opts || {};
  if (!product || product.id === undefined) return false;
  var qty = Math.max(1, parseInt(opts.qty, 10) || 1);
  var color = opts.color || '';
  var size = opts.size || '';
  var defs = resolveVariantDefaults(product);
  if (!color && defs.color) color = defs.color;
  if (!size && defs.size) size = defs.size;
  var key = buildCartKey(product.id, color, size);
  var cart = getCart();
  var existing = cart.find(function (item) { return item.key === key; });
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      key: key,
      id: product.id,
      name: product.name,
      price_cents: product.price_cents,
      image: (typeof getProductImage === 'function' ? getProductImage(product) : (product.image || '')),
      color: color,
      size: size,
      qty: qty
    });
  }
  saveCart(cart);
  return true;
}

/* Remove a cart line by key */
function removeFromCart(key) {
  var cart = getCart().filter(function (item) { return item.key !== key; });
  saveCart(cart);
}

/* Set a line's quantity; qty <= 0 removes the line */
function updateQty(key, qty) {
  var cart = getCart();
  var item = cart.find(function (i) { return i.key === key; });
  if (!item) return;
  qty = parseInt(qty, 10);
  if (isNaN(qty)) qty = 1;
  if (qty <= 0) cart = cart.filter(function (i) { return i.key !== key; });
  else item.qty = qty;
  saveCart(cart);
}

/* Any-variant match when both color & size are undefined, else exact variant match */
function isInCart(id, color, size) {
  var cart = getCart();
  if (color === undefined && size === undefined) {
    return cart.some(function (item) { return String(item.id) === String(id); });
  }
  var key = buildCartKey(id, color || '', size || '');
  return cart.some(function (item) { return item.key === key; });
}

/* Total quantity across all lines */
function getCartCount() {
  return getCart().reduce(function (sum, item) { return sum + (item.qty || 0); }, 0);
}

window.CART_KEY = CART_KEY;
window.buildCartKey = buildCartKey;
window.parseVariants = parseVariants;
window.resolveVariantDefaults = resolveVariantDefaults;
window.getCart = getCart;
window.saveCart = saveCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQty = updateQty;
window.isInCart = isInCart;
window.getCartCount = getCartCount;
window.updateCartCount = updateCartCount;
