/* api-helpers.js — Centralized fetch wrappers for all backend calls */

const API_BASE = '/api';

/** Generic JSON fetch with error handling */
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---------- Products ---------- */
function fetchProducts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch('/products/browse' + (qs ? '?' + qs : ''));
}

function fetchProduct(id) {
  return apiFetch('/products/browse/' + encodeURIComponent(id));
}

function fetchOnSaleProducts() {
  return apiFetch('/products/browse/on-sale');
}

function fetchFeaturedProducts() {
  return apiFetch('/products/browse/featured');
}

/* ---------- Categories ---------- */
function fetchCategories() {
  return apiFetch('/categories');
}

/* ---------- Reviews ---------- */
function fetchReviews(productId) {
  return apiFetch('/reviews?product_id=' + encodeURIComponent(productId));
}

function postReview(productId, payload) {
  return apiFetch('/reviews', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, ...payload })
  });
}

function deleteReview(reviewId) {
  return apiFetch('/reviews/' + reviewId, { method: 'DELETE' });
}

/* ---------- Orders (checkout) ---------- */
function placeOrder(orderData) {
  return apiFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(orderData)
  });
}

/* ---------- Settings ---------- */
function fetchSettings() {
  return apiFetch('/settings');
}

function updateSettings(key, value) {
  return apiFetch('/settings/' + key, {
    method: 'PUT',
    body: JSON.stringify({ value })
  });
}