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
export async function fetchProducts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch('/products/browse' + (qs ? '?' + qs : ''));
}

export async function fetchProduct(id) {
  return apiFetch('/products/browse/' + encodeURIComponent(id));
}

export async function fetchOnSaleProducts() {
  return apiFetch('/products/browse/on-sale');
}

export async function fetchFeaturedProducts() {
  return apiFetch('/products/browse/featured');
}

/* ---------- Categories ---------- */
export async function fetchCategories() {
  return apiFetch('/categories');
}

/* ---------- Reviews ---------- */
export async function fetchReviews(productId) {
  return apiFetch('/reviews?product_id=' + encodeURIComponent(productId));
}

export async function postReview(productId, payload) {
  return apiFetch('/reviews', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, ...payload })
  });
}

export async function deleteReview(reviewId) {
  return apiFetch('/reviews/' + reviewId, { method: 'DELETE' });
}

/* ---------- Orders (checkout) ---------- */
export async function placeOrder(orderData) {
  return apiFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(orderData)
  });
}

/* ---------- Settings ---------- */
export async function fetchSettings() {
  return apiFetch('/settings');
}

export async function updateSettings(key, value) {
  return apiFetch('/settings/' + key, {
    method: 'PUT',
    body: JSON.stringify({ value })
  });
}