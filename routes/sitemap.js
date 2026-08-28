// routes/sitemap.js — Dynamic XML sitemap for SEO.
// Lists static high-value customer pages plus one entry per active product
// and per active category. Built from the DB via the shared db module.
// Absolute URLs are based on APP_URL from config.

const express = require('express');
const db = require('../db');
const { APP_URL } = require('../config');

const router = express.Router();

// escape a URL string for use inside an XML element's text content
function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// lastmod from ISO/datetime DB string, or null to omit
function lastmodValue(raw) {
  if (!raw) return null;
  const t = new Date(String(raw).replace(' ', 'T') + 'Z').getTime();
  return isNaN(t) ? null : new Date(t).toISOString();
}

function urlEntry(loc, lastmod) {
  let inner = '<loc>' + xmlEscape(loc) + '</loc>';
  if (lastmod) inner += '<lastmod>' + xmlEscape(lastmod) + '</lastmod>';
  return '  <url>' + inner + '</url>\n';
}

// GET /sitemap.xml
router.get('/sitemap.xml', (req, res) => {
  const base = (APP_URL || '').replace(/\/+$/, '');
  let body = '<?xml version="1.0" encoding="UTF-8"?>\n';
  body += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Static high-value pages
  const staticPages = [
    { path: '/', lastmod: null },
    { path: '/products.html', lastmod: null },
    { path: '/categories.html', lastmod: null },
    { path: '/offers.html', lastmod: null }
  ];
  for (const p of staticPages) {
    body += urlEntry(base + p.path, p.lastmod);
  }

  // One entry per active category
  const categories = db.prepare(
    "SELECT slug FROM categories WHERE status = 'active' OR status IS NULL ORDER BY sort_order ASC, name ASC"
  ).all();
  for (const cat of categories) {
    body += urlEntry(base + '/categories.html?category=' + encodeURIComponent(cat.slug), null);
  }

  // One entry per active product
  const products = db.prepare(
    "SELECT id, updated_at FROM products WHERE status = 'active' ORDER BY id ASC"
  ).all();
  for (const prod of products) {
    body += urlEntry(base + '/product.html?id=' + Number(prod.id), lastmodValue(prod.updated_at));
  }

  body += '</urlset>';

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(body);
});

module.exports = router;
