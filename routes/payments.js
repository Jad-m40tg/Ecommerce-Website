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
      try { checkout = await getCheckout(order.payment_reference); } catch (e) { console.error('Chargily getCheckout failed:', e.message); }
    }

    // If not found as order, try as Chargily checkout ID
    if (!checkout) {
      try { checkout = await getCheckout(param); } catch (e) { console.error('Chargily getCheckout failed:', e.message); }
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
    // Uses conditional UPDATE for atomicity — only one concurrent call can transition the order
    if (checkout && checkout.status === 'paid') {
      const result = db.prepare(
        "UPDATE orders SET payment_status = 'paid', payment_reference = ?, paid_at = CURRENT_TIMESTAMP, payment_payload = ? WHERE id = ? AND payment_status NOT IN ('paid', 'refunded')"
      ).run(checkout.id, JSON.stringify(checkout), order.id);
      if (result.changes > 0) {
        order.payment_status = 'paid';
      }
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
        // Atomic conditional UPDATE — only transitions if not already paid/refunded
        const result = db.prepare(
          "UPDATE orders SET payment_status = 'paid', payment_reference = ?, paid_at = CURRENT_TIMESTAMP, payment_payload = ? WHERE id = ? AND payment_status NOT IN ('paid', 'refunded')"
        ).run(checkout.id || checkout.checkout_id || '', JSON.stringify(checkout), orderId);
        if (result.changes > 0) {
          console.log('[WEBHOOK] Order #' + orderId + ' transitioned to paid');
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
