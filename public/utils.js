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
// Currency formatting
// ============================================================

// Exchange rates relative to USD (1 USD = X foreign currency).
// Prices in the DB are always stored as USD cents (price_cents).
// This function converts and formats for display.
var EXCHANGE_RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  DZD: 133.40
};

var CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  DZD: 'DA'
};

// Format a price from cents (stored as USD) into the display currency.
// Usage: formatPrice(129999) → "$1,300" (USD by default)
//        formatPrice(129999, 'DZD') → "173,419 DA"
function formatPrice(priceCents, currency) {
  currency = currency || 'USD';
  var rate = EXCHANGE_RATES[currency] || 1.0;
  var symbol = CURRENCY_SYMBOLS[currency] || '$';
  var converted = (priceCents / 100) * rate;

  // DZD doesn't use decimals in everyday pricing — round to whole number
  if (currency === 'DZD') {
    converted = Math.round(converted);
    return converted.toLocaleString('en-US') + ' ' + symbol;
  }

  return symbol + converted.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Format price with cents (for admin panels where exact amounts matter)
function formatPriceFull(priceCents, currency) {
  currency = currency || 'USD';
  var rate = EXCHANGE_RATES[currency] || 1.0;
  var symbol = CURRENCY_SYMBOLS[currency] || '$';
  var converted = (priceCents / 100) * rate;

  if (currency === 'DZD') {
    converted = Math.round(converted);
    return converted.toLocaleString('en-US') + ' ' + symbol;
  }

  return symbol + converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper to get the current currency from settings (cached).
// Falls back to 'USD' if settings haven't loaded yet.
var _currentCurrency = 'USD';
function setCurrency(c) { _currentCurrency = c || 'USD'; }
function getCurrency() { return _currentCurrency; }

// Convenience: format using the globally-set currency
function price(cents) { return formatPrice(cents, _currentCurrency); }
function priceFull(cents) { return formatPriceFull(cents, _currentCurrency); }

// Expose to all HTML pages since this is loaded via <script src="utils.js">
window.escapeHtml = escapeHtml;
window.safeInnerHTML = safeInnerHTML;
window.formatPrice = formatPrice;
window.formatPriceFull = formatPriceFull;
window.setCurrency = setCurrency;
window.getCurrency = getCurrency;
window.price = price;
window.priceFull = priceFull;
window.EXCHANGE_RATES = EXCHANGE_RATES;
window.CURRENCY_SYMBOLS = CURRENCY_SYMBOLS;

// ============================================================
// Image fallback for products with missing upload images
// ============================================================

var _FALLBACK_IMAGE_MAP = {
  'living-room': '/assets/furn-sofa.png',
  'dining-room': '/assets/furn-table.png',
  'bedroom': '/assets/furn-bed.png',
  'office': '/assets/furn-desk.png',
  'outdoor': '/assets/furn-sofa.png',
  'storage': '/assets/furn-shelf.png',
  'lighting': '/assets/furn-lamp.png',
  'decor': '/assets/furn-decor.png',
  'seating': '/assets/furn-sofa.png',
  'tables': '/assets/furn-table.png'
};

function getFallbackImage(category) {
  return _FALLBACK_IMAGE_MAP[category] || '/assets/furn-sofa.png';
}

function getProductImage(product) {
  var images = [];
  try {
    images = typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []);
  } catch (e) { images = []; }
  if (images.length > 0 && images[0]) return images[0];
  return getFallbackImage(product.category);
}

function handleImageError(img) {
  if (img.dataset.fallback) return;
  img.dataset.fallback = '1';
  var cat = img.dataset.category || '';
  img.src = getFallbackImage(cat);
}

window.getFallbackImage = getFallbackImage;
window.getProductImage = getProductImage;
window.handleImageError = handleImageError;
