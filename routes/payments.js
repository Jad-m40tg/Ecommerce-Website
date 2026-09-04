const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getCheckout, verifyWebhookSignature } = require('../services/payment');

const router = express.Router();

// Public status is watched by the payment-success/failed pages. It is
// unauthenticated (needed client-side), so it must be rate-limited to stop
// attackers brute-forcing sequential order IDs to enumerate orders/statuses.
const publicStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Shared lookup + sync logic for both the admin status route and the public status route.
// Looks up an order by id, falls back to a Chargily checkout lookup, and syncs
// the payment status from Chargily when the checkout has been completed.
async function lookupAndSyncOrder(param) {
  // A Chargily checkout ID is a non-numeric opaque string (e.g. "01m1dyc..."),
  // whereas a DB order ID is purely numeric. Only treat the param as a checkout
  // ID when it is non-numeric — otherwise we'd blindly pass a numeric order ID
  // to Chargily's API on every status poll, which guarantees a 404 and spams logs.
  const looksLikeCheckoutId = typeof param === 'string' && !/^\d+$/.test(param);

  // Try looking up by order ID first
  let order = db.prepare('SELECT * FROM orders WHERE id = ?').get(param);
  let checkout = null;

  if (order && order.payment_reference) {
    try { checkout = await getCheckout(order.payment_reference); }
    catch (e) { console.error('Chargily getCheckout failed:', e.message); }
  }

  // If we couldn't match an order by ID, try treating the param as a Chargily
  // checkout ID (only when it is non-numeric).
  if (!order && looksLikeCheckoutId) {
    try { checkout = await getCheckout(param); }
    catch (e) { console.error('Chargily getCheckout failed:', e.message); }

    if (checkout) {
      if (checkout.metadata && checkout.metadata.order_id) {
        order = db.prepare('SELECT * FROM orders WHERE id = ?').get(checkout.metadata.order_id);
      }
      if (!order) {
        order = db.prepare('SELECT * FROM orders WHERE payment_reference = ?').get(checkout.id);
      }
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
      // Payment confirmed via status sync → now deduct the deferred stock.
      try {
        const ordersRouter = require('./orders');
        ordersRouter.deductStockForPaidOrder(order.id, order);
      } catch (e) {
        console.error('[SYNC] Failed to deduct stock for paid order #' + order.id, e);
      }
    }
  } else if (checkout && (checkout.status === 'failed' || checkout.status === 'canceled' || checkout.status === 'cancelled' || checkout.status === 'expired') && order.order_status !== 'cancelled' && order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
    try {
      const ordersRouter = require('./orders');
      ordersRouter.cancelAndRestoreStock(order.id, order);
      order.order_status = 'cancelled';
      console.log('[SYNC] Order #' + order.id + ' auto-cancelled (checkout ' + checkout.status + ')');
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
// fields (no order_id, no lookup_code). The carrier/tracking code is surfaced
// ONLY after the payment is confirmed (paid), because the customer waits on this
// endpoint to "receive the NOEST code" and then track their shipment on the
// payment-success page. Pre-payment the code stays hidden.
router.get('/public-status/:id', publicStatusLimiter, async (req, res) => {
  try {
    const result = await lookupAndSyncOrder(req.params.id);

    if (!result) return res.status(404).json({ error: 'Order not found' });

    // Surface ONLY the real NOEST delivery code. The generic auto-generated
    // lookup code (orders.tracking_code) must NOT be shown here, otherwise the
    // payment-success page treats it as a delivery code and skips the
    // "waiting for the NOEST code" spinner for every paid-but-not-yet-shipped order.
    const tracking_code = (result.order.payment_status === 'paid')
      ? (result.order.noest_tracking || null)
      : null;

    res.json({
      checkout_status: result.checkout ? result.checkout.status : null,
      payment_status: result.order.payment_status,
      order_status: result.order.order_status,
      noest_status: result.order.noest_status || null,
      tracking_code
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
          // Payment confirmed → now deduct the reserved stock (deferred for card).
          try {
            const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
            const ordersRouter = require('./orders');
            if (fresh) ordersRouter.deductStockForPaidOrder(orderId, fresh);
          } catch (e) {
            console.error('[WEBHOOK] Failed to deduct stock for paid order #' + orderId, e);
          }
        }
      }
    } else if (event.type === 'checkout.failed' || event.type === 'checkout.canceled' || event.type === 'checkout.cancelled' || (checkout && (checkout.status === 'failed' || checkout.status === 'canceled' || checkout.status === 'cancelled' || checkout.status === 'expired'))) {
      if (orderId) {
        const order = db.prepare('SELECT id, items, order_status, payment_status, stock_deducted FROM orders WHERE id = ?').get(orderId);
        if (order && order.order_status !== 'cancelled' && order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
          try {
            // cancelAndRestoreStock is stock-aware: a never-deducted card order is
            // cancelled without touching stock; only a previously-deducted order
            // gets its stock restored.
            const ordersRouter = require('./orders');
            ordersRouter.cancelAndRestoreStock(order.id, order);
            console.log('[WEBHOOK] Order #' + orderId + ' auto-cancelled (checkout ' + (checkout.status || event.type) + ')');
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
