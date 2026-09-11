const express = require('express');
const router = express.Router();
const donationController = require('../controllers/donationController');
const { optionalAuth, authenticate } = require('../middleware/authMiddleware');
const { donationLimiter } = require('../middleware/rateLimiter');
const { validateDonation } = require('../middleware/validate');

router.post('/', donationLimiter, optionalAuth, validateDonation, (req, res, next) => donationController.createDonation(req, res, next));
router.get('/feed', (req, res, next) => donationController.getPublicFeed(req, res, next));
router.get('/recent/:streamerSlug', (req, res, next) => donationController.getRecentDonations(req, res, next));
router.get('/history', authenticate, (req, res, next) => donationController.getStreamerDonations(req, res, next));
router.get('/:transactionId', (req, res, next) => donationController.getDonationByTransactionId(req, res, next));

module.exports = router;
