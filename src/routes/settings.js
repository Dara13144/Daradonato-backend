const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const donationPageController = require('../controllers/donationPageController');
const tickerController = require('../controllers/tickerController');
const abaPaywaySettingsController = require('../controllers/abaPaywaySettingsController');
const voiceAiController = require('../controllers/voiceAiController');
const { authenticate } = require('../middleware/authMiddleware');

// Voice AI & Custom Message Settings Endpoints (/api/settings/voice-ai & /api/settings/tts)
router.get('/voice-ai', authenticate, (req, res, next) => voiceAiController.getSettings(req, res, next));
router.put('/voice-ai', authenticate, (req, res, next) => voiceAiController.updateSettings(req, res, next));
router.post('/voice-ai/test', authenticate, (req, res, next) => voiceAiController.testSpeech(req, res, next));
router.post('/voice-ai/reset', authenticate, (req, res, next) => voiceAiController.resetSettings(req, res, next));

router.get('/tts', authenticate, (req, res, next) => voiceAiController.getSettings(req, res, next));
router.put('/tts', authenticate, (req, res, next) => voiceAiController.updateSettings(req, res, next));
router.post('/tts/test', authenticate, (req, res, next) => voiceAiController.testSpeech(req, res, next));
router.post('/tts/reset', authenticate, (req, res, next) => voiceAiController.resetSettings(req, res, next));

// ABA PayWay Settings Endpoints (/api/settings/aba-payway)
router.get('/aba-payway', authenticate, (req, res, next) => abaPaywaySettingsController.getSettings(req, res, next));
router.put('/aba-payway', authenticate, (req, res, next) => abaPaywaySettingsController.updateSettings(req, res, next));
router.post('/aba-payway/test', authenticate, (req, res, next) => abaPaywaySettingsController.testConnection(req, res, next));
router.post('/aba-payway/check-bakong', authenticate, (req, res, next) => abaPaywaySettingsController.checkBakongAccount(req, res, next));

// Leaderboard Settings Endpoints (/api/settings/leaderboard)
router.get('/leaderboard', authenticate, (req, res, next) => leaderboardController.getSettings(req, res, next));
router.put('/leaderboard', authenticate, (req, res, next) => leaderboardController.updateSettings(req, res, next));
router.post('/leaderboard/reset', authenticate, (req, res, next) => leaderboardController.resetSettings(req, res, next));

// Donation Page Settings Endpoints (/api/settings/donation-page)
router.get('/donation-page', authenticate, (req, res, next) => donationPageController.getSettings(req, res, next));
router.put('/donation-page', authenticate, (req, res, next) => donationPageController.updateSettings(req, res, next));
router.post('/donation-page/reset', authenticate, (req, res, next) => donationPageController.resetSettings(req, res, next));

// Ticker Settings Endpoints (/api/settings/ticker)
router.get('/ticker', authenticate, (req, res, next) => tickerController.getSettings(req, res, next));
router.put('/ticker', authenticate, (req, res, next) => tickerController.updateSettings(req, res, next));
router.post('/ticker/reset', authenticate, (req, res, next) => tickerController.resetSettings ? tickerController.resetSettings(req, res, next) : res.json({ success: true }));

module.exports = router;
