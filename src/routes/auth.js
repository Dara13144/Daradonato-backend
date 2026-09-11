const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');
const { validateRegister, validateLogin } = require('../middleware/validate');

router.post('/register', authLimiter, validateRegister, (req, res, next) => authController.register(req, res, next));
router.post('/login', authLimiter, validateLogin, (req, res, next) => authController.login(req, res, next));
router.post('/google', authLimiter, (req, res, next) => authController.googleLogin(req, res, next));
router.post('/telegram/session', authLimiter, (req, res, next) => authController.createTelegramSession(req, res, next));
router.get('/telegram/check-session/:sessionToken', authLimiter, (req, res, next) => authController.checkTelegramSession(req, res, next));
router.post('/telegram/verify-scan', authLimiter, (req, res, next) => authController.verifyTelegramScan(req, res, next));
router.post('/telegram', authLimiter, (req, res, next) => authController.telegramLoginWidget(req, res, next));
router.get('/me', authenticate, (req, res, next) => authController.getMe(req, res, next));
router.post('/forgot-password', authLimiter, (req, res, next) => authController.forgotPassword(req, res, next));
router.post('/reset-password', authLimiter, (req, res, next) => authController.resetPassword(req, res, next));

module.exports = router;

