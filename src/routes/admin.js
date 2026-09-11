const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// All admin routes strictly require valid JWT with ADMIN role
router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/overview', (req, res, next) => adminController.getOverview(req, res, next));
router.get('/users', (req, res, next) => adminController.getUsers(req, res, next));
router.patch('/users/:userId', (req, res, next) => adminController.updateUser(req, res, next));
router.get('/transactions', (req, res, next) => adminController.getTransactions(req, res, next));
router.get('/audit-logs', (req, res, next) => adminController.getAuditLogs(req, res, next));
router.get('/settings', (req, res, next) => adminController.getSettings(req, res, next));

module.exports = router;
