#!/usr/bin/env node
/* i18n-scan.js — find un-translated English-looking literals.
 *
 * Scopes (per recon):
 *   1. Static text nodes in .html files (outside <script>/<style>)
 *   2. innerHTML string-concatenation in public/js/*.js and inline
 *      <script> blocks inside .html files
 *
 * Usage: node scripts/i18n-scan.js [--min-len N] [--include-untagged]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

const MIN_LEN = Number(process.argv.find(a => a.startsWith('--min-len=') || a === '--min-len') 
  ? (Number(process.argv.find(a => a.startsWith('--min-len=')).split('=')[1]) || 18)
  : 18);

function isProbablyEnglish(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < MIN_LEN) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  // Skip pure numbers, URLs, camelCase identifiers, CSS selectors, code-y strings
  if (/^[\d\s.,%$€£DA:/-]+$/.test(trimmed)) return false;
  if (/^[a-z][A-Za-z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(trimmed)) return false; // dotted keys
  if (/^['"]?[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+['"]?$/.test(trimmed)) return false; // key-like
  if (/^[{\[\('"]/.test(trimmed)) return false;
  if (/\b(function|var|const|let|return|=>|if\s*\(|forEach|map\(|querySelector)/.test(trimmed)) return false;
  // Heuristic: must contain spaces and look like natural English
  const wordCount = (trimmed.match(/\b[A-Za-z]{2,}\b/g) || []).length;
  if (wordCount < 2) return false;
  return true;
}

function walk(dir, out, exts) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'vendor') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out, exts);
    } else if (exts.some(e => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
}

function scanHtml(files) {
  const hits = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const stripped = src
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    // Pull text from tags
    const textMatches = stripped.match(/>(?!\s*<)[^<>]+</g) || [];
    for (const m of textMatches) {
      const raw = m.replace(/^>/, '').replace(/<$/, '').replace(/&[a-z]+;/gi, ' ').trim();
      if (isProbablyEnglish(raw)) {
        hits.push({ file, text: raw });
      }
    }
  }
  return hits;
}

function scanJs(files, label) {
  const hits = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const raw = m[1] !== undefined ? m[1] : m[2];
      if (isProbablyEnglish(raw)) {
        const lineNo = src.slice(0, m.index).split('\n').length;
        hits.push({ file, line: lineNo, text: raw });
      }
    }
  }
  return hits;
}

function scanInlineScripts(htmlFiles) {
  const hits = [];
  const empty = [];
  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, 'utf8');
    const scripts = content.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi) || [];
    for (const script of scripts) {
      const body = script.replace(/^<script(?:\s[^>]*)?>/, '').replace(/<\/script>$/, '');
      const trimmed = body.trim();
      if (!trimmed) continue;
      // Only scan actual JS (not json-ld, not src-only)
      if (script.indexOf('application/ld+json') !== -1) continue;
      empty.push({ file, body });
    }
  }
  // Scan the concatenated-inline-script files as JS
  for (const { file, body } of empty) {
    const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    let m;
    while ((m = re.exec(body))) {
      const raw = m[1] !== undefined ? m[1] : m[2];
      if (isProbablyEnglish(raw)) {
        const lineNo = body.slice(0, m.index).split('\n').length;
        hits.push({ file, line: lineNo, text: raw, inline: true });
      }
    }
  }
  return hits;
}

function main() {
  const htmlFiles = [];
  walk(path.join(PUBLIC), htmlFiles, ['.html']);
  const jsFiles = [];
  walk(path.join(PUBLIC, 'js'), jsFiles, ['.js']);

  const htmlHits = scanHtml(htmlFiles);
  const jsHits = scanJs(jsFiles, 'js');
  const inlineHits = scanInlineScripts(htmlFiles);

  const group = {};

  function add(h) {
    const key = h.file;
    if (!group[key]) group[key] = { html: [], js: [], inline: [] };
  }
  // not used; keep simple below

  console.log('=== i18n scan: un-wrapped English-looking literals ===\n');

  for (const fileKey of Object.keys(group) ) {}

  function emit(title, hits) {
    if (!hits.length) return;
    console.log(`\n--- ${title} (${hits.length}) ---`);
    for (const h of hits) {
      const loc = h.line ? `:${h.line}` : '';
      console.log(`${path.relative(ROOT, h.file)}${loc}: ${JSON.stringify(h.text)}`);
    }
  }

  emit('STATIC HTML TEXT NODES', htmlHits);
  emit('JS innerHTML STRING LITERALS (public/js)', jsHits);
  emit('INLINE <script> STRING LITERALS (in .html)', inlineHits);

  console.log(`\nTotal: HTML=${htmlHits.length}  JS=${jsHits.length}  inline=${inlineHits.length}`);
}

main();
