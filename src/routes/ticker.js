const express = require('express');
const router = express.Router();
const tickerController = require('../controllers/tickerController');
const { authenticate } = require('../middleware/authMiddleware');

// Authenticated Ticker Settings
router.get('/settings', authenticate, (req, res, next) => tickerController.getSettings(req, res, next));
router.put('/settings', authenticate, (req, res, next) => tickerController.updateSettings(req, res, next));

// Authenticated test trigger
router.post('/test', authenticate, (req, res, next) => tickerController.triggerTestTicker(req, res, next));

// Public Ticker Endpoints for OBS
router.get('/:username/donations', (req, res, next) => tickerController.getPublicDonations(req, res, next));
router.get('/:username', (req, res, next) => tickerController.getPublicTicker(req, res, next));

module.exports = router;

