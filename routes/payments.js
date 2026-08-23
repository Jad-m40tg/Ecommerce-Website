const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getCheckout, verifyWebhookSignature } = require('../services/payment');

const router = express.Router();

// Shared lookup + sync logic for both the admin status route and the public status route.
// Looks up an order by id, falls back to a Chargily checkout lookup, and syncs
// the payment status from Chargily when the checkout has been completed.
async function lookupAndSyncOrder(param) {
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

  if (!order) return null;

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
  } else if (checkout && (checkout.status === 'failed' || checkout.status === 'canceled' || checkout.status === 'cancelled' || checkout.status === 'expired') && order.order_status !== 'cancelled' && order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
    try {
      const ordersRouter = require('./orders');
      ordersRouter.cancelAndRestoreStock(order.id, order);
      order.order_status = 'cancelled';
      console.log('[SYNC] Order #' + order.id + ' auto-cancelled (checkout ' + checkout.status + ') — stock restored');
    } catch (e) {
      console.error('[SYNC] Failed to auto-cancel order #' + order.id, e);
    }
  }

  return { order, checkout };
}

// GET /api/payments/status/:id — Admin only. Check payment status for an order.
router.get('/status/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await lookupAndSyncOrder(req.params.id);

    if (!result) return res.status(404).json({ error: 'Order not found' });

    res.json({
      checkout_status: result.checkout ? result.checkout.status : null,
      order_id: result.order.id,
      payment_status: result.order.payment_status,
      order_status: result.order.order_status,
      tracking_code: result.order.noest_tracking || null,
      lookup_code: result.order.tracking_code,
      noest_status: result.order.noest_status || null
    });
  } catch (err) {
    console.error('Payment status error:', err);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// GET /api/payments/public-status/:id — Public. Check payment status for an order.
// Same lookup/sync as the admin route but returns only minimal, non-sensitive
// fields (no order_id, no lookup_code).
router.get('/public-status/:id', async (req, res) => {
  try {
    const result = await lookupAndSyncOrder(req.params.id);

    if (!result) return res.status(404).json({ error: 'Order not found' });

    res.json({
      checkout_status: result.checkout ? result.checkout.status : null,
      payment_status: result.order.payment_status,
      order_status: result.order.order_status,
      tracking_code: result.order.noest_tracking || null,
      noest_status: result.order.noest_status || null
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
    const checkout = event.data || event;
    const orderId = checkout && checkout.metadata && checkout.metadata.order_id;

    if (event.type === 'checkout.paid' || (checkout && checkout.status === 'paid')) {
      if (orderId) {
        // Atomic conditional UPDATE — only transitions if not already paid/refunded
        const result = db.prepare(
          "UPDATE orders SET payment_status = 'paid', payment_reference = ?, paid_at = CURRENT_TIMESTAMP, payment_payload = ? WHERE id = ? AND payment_status NOT IN ('paid', 'refunded')"
        ).run(checkout.id || checkout.checkout_id || '', JSON.stringify(checkout), orderId);
        if (result.changes > 0) {
          console.log('[WEBHOOK] Order #' + orderId + ' transitioned to paid');
        }
      }
    } else if (event.type === 'checkout.failed' || event.type === 'checkout.canceled' || event.type === 'checkout.cancelled' || (checkout && (checkout.status === 'failed' || checkout.status === 'canceled' || checkout.status === 'cancelled' || checkout.status === 'expired'))) {
      if (orderId) {
        const order = db.prepare('SELECT id, items, order_status, payment_status FROM orders WHERE id = ?').get(orderId);
        if (order && order.order_status !== 'cancelled' && order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
          try {
            const ordersRouter = require('./orders');
            ordersRouter.cancelAndRestoreStock(order.id, order);
            console.log('[WEBHOOK] Order #' + orderId + ' auto-cancelled (checkout ' + (checkout.status || event.type) + ') — stock restored');
          } catch (e) {
            console.error('[WEBHOOK] Failed to auto-cancel order #' + orderId, e);
          }
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
