const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Get payment status from DB (fast cache read)
router.get('/status/:transactionId', (req, res, next) => paymentController.getStatus(req, res, next));

// Active live poll: queries CutLuy / ABA API + auto-confirms PAID (this is the auto-payment engine)
router.get('/poll/:transactionId', (req, res, next) => paymentController.pollPaymentStatus(req, res, next));

// Donor user confirmation for ABA PayWay / direct links (triggers live alert)
router.post('/confirm-user-payment', (req, res, next) => paymentController.confirmUserPayment(req, res, next));

// Sandbox test payment simulator
router.post('/sandbox-verify', (req, res, next) => paymentController.simulateSandboxPayment(req, res, next));

// Check Bakong Account ID on NBC network
router.post('/bakong/check-account', (req, res, next) => paymentController.checkBakongAccount(req, res, next));

// Check Bakong Transaction by MD5 hash (5s live poller)
router.post('/bakong/check-md5', (req, res, next) => paymentController.checkBakongByMd5(req, res, next));

module.exports = router;
