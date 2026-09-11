const Store = require('../db/store');
const auditService = require('../services/auditService');

class AdminController {
  /**
   * System Overview Metrics
   */
  async getOverview(req, res, next) {
    try {
      const stats = await Store.getSystemStats();
      return res.json({
        success: true,
        data: stats
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List Users with search & filter
   */
  async getUsers(req, res, next) {
    try {
      const { search, role, status } = req.query;
      const users = await Store.getAllProfiles({ search, role, status });
      return res.json({
        success: true,
        data: users.map(u => {
          const { password_hash, ...safe } = u;
          return safe;
        })
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update user status or role (Admin Only)
   */
  async updateUser(req, res, next) {
    try {
      const { userId } = req.params;
      const { role, status } = req.body;

      const user = await Store.findProfileById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      const updated = await Store.updateProfile(userId, {
        ...(role && { role }),
        ...(status && { status })
      });

      await auditService.log({
        userId: req.user.id,
        action: 'ADMIN_UPDATE_USER',
        entity: 'USER',
        entityId: userId,
        metadata: { updates: { role, status }, targetUserEmail: user.email },
        ip: req.ip
      });

      const { password_hash, ...safe } = updated;
      return res.json({
        success: true,
        message: 'User updated successfully.',
        data: safe
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List all platform transactions
   */
  async getTransactions(req, res, next) {
    try {
      const { page = 1, limit = 30, status, search } = req.query;
      const result = await Store.getDonations({ payment_status: status, search }, { page, limit });
      return res.json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List audit logs
   */
  async getAuditLogs(req, res, next) {
    try {
      const { page = 1, limit = 30, action, entity } = req.query;
      const logs = await Store.getAuditLogs({ action, entity }, { page, limit });
      return res.json({
        success: true,
        data: logs.data,
        meta: logs.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get / Update System Settings
   */
  async getSettings(req, res, next) {
    try {
      return res.json({
        success: true,
        data: Store.memoryDb ? Store.memoryDb.system_settings : {}
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AdminController();
