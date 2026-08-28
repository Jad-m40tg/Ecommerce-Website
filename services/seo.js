// services/seo.js — Server-side SEO helpers.
// Currently hosts the logic that injects per-product <head> metadata into the
// static product.html template and turns invalid product ids into real 404s.
// Prices are stored as integer cents; amounts are converted to DZD by /100,
// matching the same convention used across the frontend.

const path = require('path');
const fs = require('fs');
const db = require('../db');
const { APP_URL } = require('../config');
const { activeSalesMap, withSalePrice } = require('./pricing');

// Escape a value for safe inclusion inside an HTML attribute value.
function escapeAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Escape a value for safe inclusion inside an HTML text node (title/meta content).
// Reuses the same escaping set as attribute escaping since both live between tags
// or inside quoted attributes where " and < are the main concerns.
const escapeHtml = escapeAttr;

// Neutralize the literal "</script" sequence inside a JSON-LD payload so it can
// never prematurely close the <script> block even if a product name/description
// contains something that looks like it.
function safeJsonLd(value) {
  return String(value)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');
}

// Serialize an object as compact JSON-LD with the injection guarded above.
function jsonLd(obj) {
  return '<script type="application/ld+json">' + safeJsonLd(JSON.stringify(obj)) + '</script>';
}

function firstImage(images) {
  try {
    const arr = Array.isArray(images) ? images : JSON.parse(images || '[]');
    if (Array.isArray(arr) && arr.length) return String(arr[0]);
  } catch (e) {}
  return '/assets/noImageForItem.jpg';
}

function baseUrl() {
  return (APP_URL || 'http://localhost:5000').replace(/\/+$/, '');
}

function absoluteUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return baseUrl() + url;
  return baseUrl() + '/' + url;
}

// Build the per-product metadata block to inject into the static <head>.
// markers: tokens present in product.html that get replaced with real values.
function buildProductMetaMarkup(product, rawCount, rawRating) {
  const reviewsCount = Number(rawCount) || 0;
  const avgRating = Number(rawRating) || 0;

  const name = product.name || 'Product';
  const description = (product.description || '').slice(0, 155);
  const image = absoluteUrl(firstImage(product.images));
  const canonical = baseUrl() + '/product.html?id=' + Number(product.id);

  const priceCents = Number(product.price_cents) || 0;
  const priceDZD = Math.round(priceCents / 100);

  const title = name + ' | Boularas Modern Furniture & Home';
  const ogDesc = description || ('Shop ' + name + ' at Boularas premium furniture.');

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: name,
    image: image,
    description: description,
    sku: product.sku || String(product.id)
  };
  if (product.brand) schema.brand = { '@type': 'Brand', name: String(product.brand) };
  schema.offers = {
    '@type': 'Offer',
    priceCurrency: 'DZD',
    price: priceDZD,
    availability: 'https://schema.org/InStock',
    url: canonical,
    itemCondition: 'https://schema.org/NewCondition'
  };
  if (reviewsCount > 0 && avgRating > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: avgRating,
      reviewCount: reviewsCount
    };
  }

  return [
    '<title>' + escapeHtml(title) + '</title>',
    '<meta name="description" content="' + escapeAttr(ogDesc) + '" />',
    '<link rel="canonical" href="' + escapeAttr(canonical) + '" />',
    '<meta property="og:title" content="' + escapeAttr(title) + '" />',
    '<meta property="og:description" content="' + escapeAttr(ogDesc) + '" />',
    '<meta property="og:type" content="product" />',
    '<meta property="og:url" content="' + escapeAttr(canonical) + '" />',
    '<meta property="og:image" content="' + escapeAttr(image) + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + escapeAttr(title) + '" />',
    '<meta name="twitter:description" content="' + escapeAttr(ogDesc) + '" />',
    '<meta name="twitter:image" content="' + escapeAttr(image) + '" />',
    jsonLd(schema)
  ].join('\n  ');
}

// Send the product page HTML with product-specific <head> metadata injected.
// Reuses the cached read of the static template so we don't hit disk on each request.
const TEMPLATE_PATH = path.join(__dirname, '..', 'public', 'product.html');
let templatePromise = null;

function loadTemplate() {
  if (!templatePromise) {
    templatePromise = fs.promises.readFile(TEMPLATE_PATH, 'utf8');
  }
  return templatePromise;
}

async function sendProductPage(req, res, next) {
  const idRaw = req.query.id;
  const id = Number(idRaw);
  if (!idRaw || !Number.isInteger(id) || id <= 0) {
    // No valid id — keep current static behavior but let it resolve normally.
    // If no id is provided at all, the page is a generic template, not a 404.
    return next();
  }

  let product;
  try {
    product = db.prepare(
      "SELECT *, (SELECT COALESCE(ROUND(AVG(rating),1),0) FROM reviews WHERE product_id = products.id) AS rating, (SELECT COUNT(*) FROM reviews WHERE product_id = products.id) AS reviews FROM products WHERE id = ? AND status = 'active'"
    ).get(id);
  } catch (err) {
    return next(err);
  }

  if (!product) {
    // Soft-404 fix: invalid id → real 404 with a friendly body.
    res.status(404);
    return res.sendFile(path.join(__dirname, '..', 'public', '404.html'));
  }

  const saleMap = activeSalesMap(Date.now());
  const priced = withSalePrice(product, saleMap);

  const meta = buildProductMetaMarkup(priced, priced.reviews, priced.rating);

  try {
    let html = await loadTemplate();
    // Remove the static (non-product-specific) head tags so the injected
    // metadata doesn't produce duplicate <title>/description/canonical/og tags.
    html = html
      .replace(/<title>Product \| Boularas Modern Furniture &amp; Home<\/title>/, '')
      .replace(/<meta name="description" content="Product details, specs and reviews on Boularas premium furniture: natural materials, timeless design, and free delivery over 66,700 DA\."[^>]*\/>/, '')
      .replace(/<meta property="og:title" content="Product \| Boularas Modern Furniture &amp; Home"[^>]*\/>/, '')
      .replace(/<meta property="og:description" content="Product details, specs and reviews on Boularas premium furniture: natural materials, timeless design, and free delivery over 66,700 DA\."\s*\/>/, '')
      .replace(/<meta property="og:type" content="website"[^>]*\/>/, '')
      .replace(/<meta property="og:image" content="\/assets\/Boularas_Logo.png"[^>]*\/>/, '')
      .replace(/<meta name="twitter:card" content="summary"[^>]*\/>/, '')
      .replace(/<link rel="canonical" href="product.html"[^>]*\/>/, '');
    // Inject real values in place of the placeholder comment token.
    html = html.replace('<!--SEO:HEAD-->', meta);
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendProductPage,
  buildProductMetaMarkup,
  escapeHtml,
  escapeAttr,
  safeJsonLd,
  baseUrl,
  absoluteUrl
};
