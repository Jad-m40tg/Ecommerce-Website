const express = require('express');
const db = require('../db');
const { getCheckout, verifyWebhookSignature } = require('../services/payment');

const router = express.Router();

router.get('/status/:checkoutId', async (req, res) => {
  try {
    const checkout = await getCheckout(req.params.checkoutId);
    if (!checkout) return res.status(404).json({ error: 'Checkout not found' });

    let order = null;
    if (checkout.metadata && checkout.metadata.order_id) {
      order = db.prepare('SELECT * FROM orders WHERE id = ?').get(checkout.metadata.order_id);
    }
    if (!order) {
      order = db.prepare('SELECT * FROM orders WHERE payment_reference = ?').get(checkout.id);
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (checkout.status === 'paid' && order.payment_status !== 'paid') {
      db.prepare("UPDATE orders SET payment_status = 'paid', payment_reference = ?, paid_at = CURRENT_TIMESTAMP, payment_payload = ? WHERE id = ?")
        .run(checkout.id, JSON.stringify(checkout), order.id);
      order.payment_status = 'paid';
    }

    res.json({
      checkout_status: checkout.status,
      order_id: order.id,
      payment_status: order.payment_status,
      tracking_code: order.tracking_code
    });
  } catch (err) {
    console.error('Payment status error:', err);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.headers['signature'] || req.headers['x-webhook-signature'] || '';
    const rawBody = req.body;

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString());

    if (event.type === 'checkout.paid' || (event.data && event.data.status === 'paid')) {
      const checkout = event.data || event;
      const orderId = checkout.metadata && checkout.metadata.order_id;

      if (orderId) {
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (order && order.payment_status !== 'paid') {
          db.prepare("UPDATE orders SET payment_status = 'paid', payment_reference = ?, paid_at = CURRENT_TIMESTAMP, payment_payload = ? WHERE id = ?")
            .run(checkout.id || checkout.checkout_id || '', JSON.stringify(checkout), orderId);
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.get('/track', (req, res) => {
  const { code } = req.query;
  if (!code || code.length < 4) {
    return res.status(400).json({ error: 'Please provide a valid tracking code' });
  }

  const order = db.prepare('SELECT id, order_status, payment_status, payment_method, tracking_number, carrier, tracking_url, tracking_code, created_at, updated_at, items, total_cents FROM orders WHERE tracking_code = ?').get(code.toUpperCase());

  if (!order) return res.status(404).json({ error: 'Order not found. Please check your tracking code.' });

  res.json({ order });
});

module.exports = router;
