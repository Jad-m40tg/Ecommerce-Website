// utils.js — Shared utility functions loaded by all HTML pages.
// Provides XSS protection by escaping user-controlled text before
// inserting it into the page via innerHTML.

// Converts dangerous characters into safe HTML entities so the browser
// displays them as text instead of running them as code.
// Example: "<script>alert(1)</script>" becomes "&lt;script&gt;&lt;/script&gt;"
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  const map = {
    '&': '&amp;',   // must be first to avoid double-escaping
    '<': '&lt;',     // opening tag
    '>': '&gt;',     // closing tag
    '"': '&quot;',   // double quote (breaks out of attributes)
    "'": '&#x27;',   // single quote (breaks out of attributes)
    '/': '&#x2F;',   // slash (used in closing tags)
    '`': '&#96;'     // backtick (template literals)
  };
  return str.replace(/[&<>"'`\/]/g, s => map[s]);
}

// Safe innerHTML setter
function safeInnerHTML(element, html) {
  element.innerHTML = html;
}

// ============================================================
// Currency formatting (DZD only)
// ============================================================

function formatPrice(priceCents) {
  return Math.round(priceCents / 100).toLocaleString('en-US') + ' DA';
}

function formatPriceFull(priceCents) {
  return Math.round(priceCents / 100).toLocaleString('en-US') + ' DA';
}

function price(cents) { return formatPrice(cents); }
function priceFull(cents) { return formatPriceFull(cents); }

// Expose to all HTML pages since this is loaded via <script src="utils.js">
window.escapeHtml = escapeHtml;
window.safeInnerHTML = safeInnerHTML;
window.formatPrice = formatPrice;
window.formatPriceFull = formatPriceFull;
window.price = price;
window.priceFull = priceFull;

// ============================================================
// Image fallback for products with missing upload images
// ============================================================

var DEFAULT_PRODUCT_IMAGE = '/assets/noImageForItem.png';

function getFallbackImage(category) {
  return DEFAULT_PRODUCT_IMAGE;
}

function getProductImage(product) {
  var images = [];
  try {
    images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
  } catch (e) { images = []; }
  if (images.length > 0 && images[0]) {
    return images[0];
  }
  return getFallbackImage(product.category);
}

function handleImageError(img) {
  if (img.dataset.fallback) return;
  img.dataset.fallback = '1';
  var cat = img.dataset.category || '';
  img.src = getFallbackImage(cat);
}

// ============================================================
// Color name → hex mapper for product swatches
// ============================================================

var COLOR_HEX = {
  'charcoal': '#2b2926',
  'black': '#111111',
  'matte black': '#171717',
  'all black': '#111111',
  'white': '#ffffff',
  'cream': '#f3eee6',
  'beige': '#d8c9a9',
  'linen beige': '#e6d8c0',
  'sage': '#6b7f5e',
  'green': '#4a6b4a',
  'emerald': '#046A38',
  'emerald green': '#046A38',
  'dusty rose': '#c08497',
  'rose': '#e8b4b8',
  'pink': '#e8b4b8',
  'navy': '#1e2a44',
  'navy blue': '#1e2a44',
  'blue': '#3b5e8c',
  'natural oak': '#c89b64',
  'oak': '#c89b64',
  'walnut': '#5b4234',
  'natural teak': '#a97040',
  'teak': '#a97040',
  'grey wash': '#b7b7b4',
  'gray': '#808080',
  'space gray': '#6b6b6f',
  'brushed brass': '#b5a642',
  'brass': '#b5a642',
  'chrome': '#c0c5cc',
  'terracotta': '#b5651d',
  'sand': '#d9c7a7',
  'black/raw pine': '#2b2926',
  'white/pine': '#f5efe4',
  'red': '#b03a2e',
  'yellow': '#d9a441',
  'purple': '#6f4e7c',
  'brown': '#6b4a2b',
  'wood': '#8b5e34'
};

function colorHex(name) {
  if (!name) return '';
  var key = String(name).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(COLOR_HEX, key)) return COLOR_HEX[key];
  return '#e8e0d3';
}

window.getFallbackImage = getFallbackImage;
window.getProductImage = getProductImage;
window.handleImageError = handleImageError;
window.COLOR_HEX = COLOR_HEX;
window.colorHex = colorHex;
