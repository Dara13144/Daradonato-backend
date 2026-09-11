const express = require('express');
const router = express.Router();
const streamerController = require('../controllers/streamerController');
const { authenticate } = require('../middleware/authMiddleware');

// Public routes
router.get('/search', (req, res, next) => streamerController.searchStreamers(req, res, next));

// Dashboard routes (must be before /:slug to avoid conflicts)
router.get('/dashboard/profile', authenticate, (req, res, next) => streamerController.getDashboardProfile(req, res, next));
router.get('/dashboard/stats', authenticate, (req, res, next) => streamerController.getDashboardStats(req, res, next));
router.get('/dashboard/goals', authenticate, (req, res, next) => streamerController.getGoals(req, res, next));
router.post('/dashboard/goals', authenticate, (req, res, next) => streamerController.createGoal(req, res, next));
router.put('/dashboard/goals/:goalId', authenticate, (req, res, next) => streamerController.updateGoal(req, res, next));

// Create / update streamer profile
router.post('/profile', authenticate, (req, res, next) => streamerController.createProfile(req, res, next));
router.put('/settings', authenticate, (req, res, next) => streamerController.updateSettings(req, res, next));

// Public: get streamer by slug (MUST be last to avoid swallowing above routes)
router.get('/:slug', (req, res, next) => streamerController.getBySlug(req, res, next));

module.exports = router;
