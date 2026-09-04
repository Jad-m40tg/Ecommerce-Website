const { ChargilyClient } = require('@chargily/chargily-pay');
const crypto = require('crypto');
const { CHARGILY_SECRET_KEY, CHARGILY_ENV, APP_URL } = require('../config');

const client = new ChargilyClient({
  api_key: CHARGILY_SECRET_KEY,
  mode: CHARGILY_ENV === 'live' ? 'live' : 'test'
});

const BASE_URL = CHARGILY_ENV === 'test'
  ? 'https://pay.chargily.net/test/api/v2'
  : 'https://pay.chargily.net/api/v2';

// Guard a Chargily SDK call with a timeout so a hung upstream never leaves a
// checkout/cleanup request hanging indefinitely.
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function createCheckout({ amount, orderId, customerEmail, customerName, baseUrl }) {
  const host = baseUrl || APP_URL;
  const checkout = await withTimeout(client.createCheckout({
    amount: amount,
    currency: 'dzd',
    success_url: host + '/payment-success.html?order_id=' + orderId,
    failure_url: host + '/payment-failed.html?order_id=' + orderId,
    metadata: { order_id: String(orderId) },
    description: 'Order #' + orderId
  }), 15000, 'Chargily createCheckout');

  if (checkout.checkout_url) {
    checkout.checkout_url = checkout.checkout_url.replace('http://', 'https://');
  }

  return checkout;
}

async function getCheckout(checkoutId) {
  return withTimeout(client.getCheckout(checkoutId), 15000, 'Chargily getCheckout');
}

function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !CHARGILY_SECRET_KEY) return false;
  const expected = crypto
    .createHmac('sha256', CHARGILY_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

module.exports = { createCheckout, getCheckout, verifyWebhookSignature, BASE_URL };
