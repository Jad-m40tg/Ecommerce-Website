'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

function flat(o, p, out) {
  out = out || {};
  for (const k in o) {
    const kk = p ? p + '.' + k : k;
    if (o[k] && typeof o[k] === 'object') flat(o[k], kk, out);
    else out[kk] = o[k];
  }
  return out;
}

const namespaces = ['en', 'ar', 'fr', 'common'];

function loadDict(lng) {
  const f = path.join(ROOT, 'public', 'locales', lng, 'customer.json');
  if (!fs.existsSync(f)) return {};
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

const en = flat(loadDict('en'));
const ar = flat(loadDict('ar'));

const keys = new Set(Object.keys(en));

const files = [
  'public/cart.html',
  'public/checkout.html',
  'public/wishlist.html',
  'public/js/cart.js',
  'public/js/checkout.js'
];

const refs = new Set();
const re = /(?:data-i18n="|i18n\('|tr\(')(?:customer:|admin:)?([a-zA-Z0-9_.]+)/g;
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let m;
  while ((m = re.exec(s))) refs.add(m[1]);
}

console.log('Referenced keys:', refs.size);
const missing = [...refs].filter(k => !keys.has(k));
console.log('Referenced but NOT in en customer.json:', missing);

// Check title/data-i18n attrs
console.log('\n--- EN keys actually present ---');
console.log('total en keys:', keys.size);
console.log('total ar keys:', Object.keys(ar).length);
