const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// ABA PayWay Callback (supports both GET health-check and POST callback)
router.get('/aba', (req, res, next) => webhookController.handleAbaGet(req, res, next));
router.post('/aba', (req, res, next) => webhookController.handleAbaCallback(req, res, next));

// CutLuy Webhook Callback (Auto Payment Fulfillment)
router.get('/cutluy', (req, res) => res.json({ success: true, message: 'CutLuy webhook endpoint is ACTIVE', status: 'ACTIVE' }));
router.post('/cutluy', (req, res, next) => webhookController.handleCutluyWebhook(req, res, next));

// Bakong KHQR Webhook
router.get('/bakong', (req, res) => res.json({ success: true, message: 'Bakong KHQR webhook endpoint is ACTIVE', status: 'ACTIVE' }));
router.post('/bakong', (req, res, next) => webhookController.handleBakongWebhook(req, res, next));

// Telegram Webhook
router.get('/telegram', (req, res) => res.json({ success: true, message: 'Telegram bot webhook is ACTIVE', bot: 'darastore_bot' }));
router.post('/telegram', async (req, res) => {
  const telegramService = require('../services/telegramService');
  await telegramService.processUpdate(req.body);
  return res.json({ ok: true });
});

module.exports = router;
