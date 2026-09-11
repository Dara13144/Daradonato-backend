const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');
const { authenticate } = require('../middleware/authMiddleware');

router.get('/status', authenticate, (req, res, next) => telegramController.getConnectionStatus(req, res, next));
router.post('/generate-code', authenticate, (req, res, next) => telegramController.generateCode(req, res, next));
router.post('/pair', (req, res, next) => telegramController.pairChat(req, res, next));
router.post('/test', authenticate, (req, res, next) => telegramController.testAlert(req, res, next));
router.post('/disconnect', authenticate, (req, res, next) => telegramController.disconnect(req, res, next));

module.exports = router;
