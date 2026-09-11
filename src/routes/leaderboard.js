const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const { authenticate } = require('../middleware/authMiddleware');

// Authenticated Streamer Leaderboard Settings APIs
router.get('/settings', authenticate, (req, res, next) => leaderboardController.getSettings(req, res, next));
router.put('/settings', authenticate, (req, res, next) => leaderboardController.updateSettings(req, res, next));
router.post('/settings/reset', authenticate, (req, res, next) => leaderboardController.resetSettings(req, res, next));

// Global leaderboard
router.get('/global', (req, res, next) => leaderboardController.getLeaderboard(req, res, next));

// Public settings for OBS overlay / public display
router.get('/settings/:streamerSlug', (req, res, next) => leaderboardController.getPublicSettings(req, res, next));

// Real-time SSE Stream
router.get('/stream/:username', (req, res, next) => leaderboardController.streamLeaderboard(req, res, next));

// Specific sub-resource routes (Must be declared before parameterized /:streamerSlug)
router.get('/:streamerSlug/top', (req, res, next) => leaderboardController.getTop(req, res, next));
router.get('/:streamerSlug/stats', (req, res, next) => leaderboardController.getStats(req, res, next));
router.get('/:streamerSlug/settings', (req, res, next) => leaderboardController.getPublicSettings(req, res, next));

// Public leaderboard rankings
router.get('/:streamerSlug?', (req, res, next) => leaderboardController.getLeaderboard(req, res, next));

module.exports = router;
