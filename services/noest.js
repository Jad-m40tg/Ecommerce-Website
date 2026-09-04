// services/noest.js — NOEST Express API wrapper for Algerian delivery.
// Handles order creation, validation, cancellation, tracking, and label retrieval.

const { NOEST_API_TOKEN, NOEST_USER_GUID, ENABLE_NOEST_VALIDATION } = require('../config');

const BASE_URL = 'https://app.noest-dz.com';
const REQUEST_TIMEOUT_MS = 15000;

function isConfigured() {
  return !!(NOEST_API_TOKEN && NOEST_USER_GUID);
}

async function noestRequest(endpoint, options) {
  const url = BASE_URL + endpoint;
  const headers = Object.assign({
    'Authorization': 'Bearer ' + NOEST_API_TOKEN,
    'Content-Type': 'application/json'
  }, options.headers || {});

  console.log('[NOEST] ' + (options.method || 'GET') + ' ' + url);

  // Abort the request if NOEST does not respond within REQUEST_TIMEOUT_MS so a
  // hung upstream cannot leave an admin/cleanup request hanging indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timeout);
    throw new Error('NOEST request timed out or failed: ' + (e && e.message ? e.message : String(e)));
  }
  clearTimeout(timeout);

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

  if (!response.ok) {
    console.error('[NOEST] HTTP ' + response.status + ':', data);
    throw new Error('NOEST API error ' + response.status + ': ' + (data.message || data.raw || 'Unknown'));
  }

  return data;
}

// Create a single delivery order on NOEST.
// Returns { tracking, status } on success.
async function createOrder({ client, phone, phone2, adresse, wilaya_id, commune, montant, produit, type_id, stop_desk, station_code, poids, can_open, id_externe }) {
  const body = {
    user_guid: NOEST_USER_GUID,
    client: String(client).slice(0, 120),
    phone: String(phone),
    adresse: String(adresse),
    wilaya_id: Number(wilaya_id),
    commune: String(commune),
    montant: Number(montant) || 0,
    produit: String(produit).slice(0, 200),
    type_id: Number(type_id) || 1,
    stop_desk: Number(stop_desk) || 0,
    poids: Number(poids) || 1,
    can_open: !!can_open
  };

  if (phone2) body.phone2 = String(phone2);
  if (stop_desk && station_code) body.station_code = String(station_code);
  if (id_externe) body.id_externe = String(id_externe);

  // ENABLE_NOEST_VALIDATION controls whether we auto-confirm orders.
  // When true, we set confirmed:1 so logistics sees them immediately.
  // When false, orders are created as drafts (safe for testing).
  if (ENABLE_NOEST_VALIDATION) {
    body.confirmed = 1;
  }

  const data = await noestRequest('/api/public/create/order', {
    method: 'POST',
    body
  });

  return {
    success: data.success !== false,
    tracking: data.tracking || (data.data ? data.data.tracking : ''),
    status: (data.data ? data.data.status : data.status) || 'PENDING',
    raw: data
  };
}

// Validate (confirm) an order so logistics picks it up.
async function validateOrder(tracking) {
  const data = await noestRequest('/api/public/valid/order', {
    method: 'POST',
    body: { user_guid: NOEST_USER_GUID, tracking }
  });
  return { success: data.success !== false, raw: data };
}

// Cancel/delete an order (only works before validation).
async function cancelOrder(tracking) {
  const data = await noestRequest('/api/public/delete/order', {
    method: 'POST',
    body: { user_guid: NOEST_USER_GUID, tracking }
  });
  return { success: data.success !== false, raw: data };
}

// Get tracking info for one or more tracking numbers.
async function getTrackingInfo(trackings) {
  const arr = Array.isArray(trackings) ? trackings : [trackings];
  const data = await noestRequest('/api/public/get/trackings/info', {
    method: 'POST',
    body: { trackings: arr }
  });
  return data;
}

// Get list of all 58 wilayas.
async function getWilayas() {
  const data = await noestRequest('/api/public/get/wilayas', { method: 'GET' });
  return Array.isArray(data) ? data : (data.data || []);
}

// Get communes for a specific wilaya.
async function getCommunes(wilayaId) {
  const data = await noestRequest('/api/public/get/communes/' + Number(wilayaId), { method: 'GET' });
  return Array.isArray(data) ? data : (data.data || []);
}

// Get delivery fees/pricing per wilaya.
async function getFees() {
  const data = await noestRequest('/api/public/fees', { method: 'GET' });
  return data.tarifs || data.data || data || {};
}

// Build the label (bordereau) download URL.
function getLabelUrl(tracking) {
  return BASE_URL + '/api/public/bordereau/' + encodeURIComponent(tracking) + '?token=' + encodeURIComponent(NOEST_API_TOKEN);
}

module.exports = {
  isConfigured,
  createOrder,
  validateOrder,
  cancelOrder,
  getTrackingInfo,
  getWilayas,
  getCommunes,
  getFees,
  getLabelUrl
};
