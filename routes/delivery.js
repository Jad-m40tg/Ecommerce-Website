// routes/delivery.js — NOEST delivery integration endpoints.
// All routes require admin authentication.

const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const noest = require('../services/noest');

const router = express.Router();

// All delivery routes require admin auth
router.use(authenticateToken, requireAdmin);

// GET /api/delivery/status — Check if NOEST is configured
router.get('/status', (req, res) => {
  res.json({
    configured: noest.isConfigured(),
    validation_enabled: require('../config').ENABLE_NOEST_VALIDATION
  });
});

// POST /api/delivery/ship — Create a NOEST order for an existing order
router.post('/ship', async (req, res) => {
  try {
    if (!noest.isConfigured()) {
      return res.status(400).json({ error: 'NOEST API is not configured. Set NOEST_API_TOKEN and NOEST_USER_GUID in .env' });
    }

    const { order_id, type_id, stop_desk, station_code, poids, wilaya_id, commune } = req.body;
    if (!order_id) return res.status(400).json({ error: 'order_id is required' });

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.noest_tracking) {
      return res.status(400).json({ error: 'Order already shipped to NOEST. Tracking: ' + order.noest_tracking });
    }

    if (!wilaya_id || isNaN(Number(wilaya_id)) || Number(wilaya_id) < 1 || Number(wilaya_id) > 58) {
      return res.status(400).json({ error: 'wilaya_id (1-58) and commune are required' });
    }
    if (!commune || typeof commune !== 'string' || commune.trim().length === 0) {
      return res.status(400).json({ error: 'wilaya_id (1-58) and commune are required' });
    }

    // Map customer data to NOEST fields
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    const produit = items.map(function (i) { return (i.name || 'Product') + ' x' + (i.quantity || 1); }).join(', ');
    let montant = order.payment_method === 'cash_on_delivery' ? Math.round(order.total_cents / 100) : 0;
    if (montant > 150000) {
      console.warn(`[NOEST] COD amount ${montant} DZD exceeds limit, capping to 149999 DZD for order ${order.id}`);
      montant = 149999;
    }

    const result = await noest.createOrder({
      client: order.customer_name,
      phone: order.customer_phone,
      adresse: order.customer_address,
      wilaya_id: Number(wilaya_id) || 16,
      commune: commune || order.customer_city || 'Alger',
      montant: montant,
      produit: produit || 'E-commerce order',
      type_id: Number(type_id) || 1,
      stop_desk: Number(stop_desk) || 0,
      station_code: station_code || undefined,
      poids: Number(poids) || 1,
      id_externe: String(order.id)
    });

    if (!result.success) {
      return res.status(422).json({ error: 'NOEST rejected the order', details: result.raw });
    }

    // Save NOEST tracking info to order
    db.prepare('UPDATE orders SET noest_tracking = ?, noest_status = ?, carrier = ?, tracking_number = ?, noest_payload = ?, order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(result.tracking, result.status || 'PENDING', 'NOEST', result.tracking, JSON.stringify(result.raw), 'shipped', order_id);

    res.json({
      success: true,
      tracking: result.tracking,
      status: result.status,
      label_url: noest.getLabelUrl(result.tracking)
    });
  } catch (err) {
    console.error('[NOEST] Ship error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create NOEST order' });
  }
});

// POST /api/delivery/validate — Validate (confirm) a NOEST order
router.post('/validate', async (req, res) => {
  try {
    if (!noest.isConfigured()) return res.status(400).json({ error: 'NOEST not configured' });
    const { tracking } = req.body;
    if (!tracking) return res.status(400).json({ error: 'tracking is required' });

    const result = await noest.validateOrder(tracking);
    if (result.success) {
      db.prepare("UPDATE orders SET noest_status = 'VALIDATED', updated_at = CURRENT_TIMESTAMP WHERE noest_tracking = ?").run(tracking);
    }
    res.json(result);
  } catch (err) {
    console.error('[NOEST] Validate error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to validate' });
  }
});

// POST /api/delivery/cancel — Cancel/delete a NOEST order
router.post('/cancel', async (req, res) => {
  try {
    if (!noest.isConfigured()) return res.status(400).json({ error: 'NOEST not configured' });
    const { tracking, order_id } = req.body;
    if (!tracking) return res.status(400).json({ error: 'tracking is required' });

    const result = await noest.cancelOrder(tracking);
    if (result.success) {
      db.prepare("UPDATE orders SET noest_tracking = '', noest_status = 'CANCELLED', carrier = '', tracking_number = '', order_status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE noest_tracking = ?").run(tracking);
    }
    res.json(result);
  } catch (err) {
    console.error('[NOEST] Cancel error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to cancel' });
  }
});

// POST /api/delivery/track — Get live tracking info from NOEST
router.post('/track', async (req, res) => {
  try {
    if (!noest.isConfigured()) return res.status(400).json({ error: 'NOEST not configured' });
    const { tracking } = req.body;
    if (!tracking) return res.status(400).json({ error: 'tracking is required' });

    const data = await noest.getTrackingInfo(tracking);
    res.json(data);
  } catch (err) {
    console.error('[NOEST] Track error:', err.message);
    // Distinguish client errors (4xx from NOEST) from server errors (5xx)
    const match = (err.message || '').match(/NOEST API error (\d+)/);
    const status = match ? (parseInt(match[1]) < 500 ? 422 : 500) : 500;
    res.status(status).json({ error: err.message || 'Failed to track' });
  }
});

// GET /api/delivery/label/:tracking — Get label download URL
router.get('/label/:tracking', (req, res) => {
  if (!noest.isConfigured()) return res.status(400).json({ error: 'NOEST not configured' });
  const url = noest.getLabelUrl(req.params.tracking);
  res.json({ url });
});

// GET /api/delivery/wilayas — List all wilayas
router.get('/wilayas', async (req, res) => {
  try {
    if (!noest.isConfigured()) return res.status(400).json({ error: 'NOEST not configured' });
    const wilayas = await noest.getWilayas();
    res.json(wilayas);
  } catch (err) {
    console.error('[NOEST] Wilayas error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch wilayas' });
  }
});

// GET /api/delivery/communes/:wilayaId — List communes for a wilaya
router.get('/communes/:wilayaId', async (req, res) => {
  try {
    if (!noest.isConfigured()) return res.status(400).json({ error: 'NOEST not configured' });
    const communes = await noest.getCommunes(req.params.wilayaId);
    res.json(communes);
  } catch (err) {
    console.error('[NOEST] Communes error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch communes' });
  }
});

// GET /api/delivery/fees — Get delivery fee schedule
router.get('/fees', async (req, res) => {
  try {
    if (!noest.isConfigured()) return res.status(400).json({ error: 'NOEST not configured' });
    const fees = await noest.getFees();
    res.json(fees);
  } catch (err) {
    console.error('[NOEST] Fees error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch fees' });
  }
});

module.exports = router;
