const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');

router.get('/config/:identifier', (req, res, next) => alertController.getSettings(req, res, next));
router.get('/settings', authenticate, (req, res, next) => alertController.getSettings(req, res, next));
router.put('/config', authenticate, (req, res, next) => alertController.updateSettings(req, res, next));
router.put('/settings', authenticate, (req, res, next) => alertController.updateSettings(req, res, next));
router.get('/stream/:identifier', (req, res, next) => alertController.streamOverlayEvents(req, res, next));
router.post('/test/:identifier?', optionalAuth, (req, res, next) => alertController.sendTestAlert(req, res, next));

module.exports = router;


