const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getCheckout, verifyWebhookSignature } = require('../services/payment');

const router = express.Router();

// GET /api/payments/status/:id — Admin only. Check payment status for an order.
router.get('/status/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const param = req.params.id;

    // Try looking up by order ID first
    let order = db.prepare('SELECT * FROM orders WHERE id = ?').get(param);
    let checkout = null;

    if (order && order.payment_reference) {
      try { checkout = await getCheckout(order.payment_reference); } catch (e) { /* ignore */ }
    }

    // If not found as order, try as Chargily checkout ID
    if (!checkout) {
      try { checkout = await getCheckout(param); } catch (e) { /* ignore */ }
    }

    if (checkout && !order) {
      if (checkout.metadata && checkout.metadata.order_id) {
        order = db.prepare('SELECT * FROM orders WHERE id = ?').get(checkout.metadata.order_id);
      }
      if (!order) {
        order = db.prepare('SELECT * FROM orders WHERE payment_reference = ?').get(checkout.id);
      }
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Sync payment status from Chargily if checkout exists and payment was completed
    // Do NOT overwrite refunded status — admin may have intentionally refunded
    if (checkout && checkout.status === 'paid' && order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
      db.prepare("UPDATE orders SET payment_status = 'paid', payment_reference = ?, paid_at = CURRENT_TIMESTAMP, payment_payload = ? WHERE id = ?")
        .run(checkout.id, JSON.stringify(checkout), order.id);
      order.payment_status = 'paid';
    }

    res.json({
      checkout_status: checkout ? checkout.status : null,
      order_id: order.id,
      payment_status: order.payment_status,
      order_status: order.order_status,
      tracking_code: order.noest_tracking || null,
      lookup_code: order.tracking_code,
      noest_status: order.noest_status || null
    });
  } catch (err) {
    console.error('Payment status error:', err);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

router.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['signature'] || req.headers['x-webhook-signature'] || '';
    // Use raw body captured by express.json verify callback in server.js
    // This preserves the exact bytes Chargily signed, avoiding re-serialization issues
    const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    if (event.type === 'checkout.paid' || (event.data && event.data.status === 'paid')) {
      const checkout = event.data || event;
      const orderId = checkout.metadata && checkout.metadata.order_id;

      if (orderId) {
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (order && order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
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

module.exports = router;
