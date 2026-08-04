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

async function createCheckout({ amount, orderId, customerEmail, customerName }) {
  const checkout = await client.createCheckout({
    amount: amount,
    currency: 'dzd',
    success_url: APP_URL + '/payment-success.html?order_id=' + orderId,
    failure_url: APP_URL + '/payment-failed.html?order_id=' + orderId,
    metadata: { order_id: String(orderId) },
    description: 'Order #' + orderId
  });

  if (checkout.checkout_url) {
    checkout.checkout_url = checkout.checkout_url.replace('http://', 'https://');
  }

  return checkout;
}

async function getCheckout(checkoutId) {
  const checkout = await client.getCheckout(checkoutId);
  return checkout;
}

function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !CHARGILY_SECRET_KEY) return false;
  const expected = crypto
    .createHmac('sha256', CHARGILY_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

module.exports = { createCheckout, getCheckout, verifyWebhookSignature, BASE_URL };
