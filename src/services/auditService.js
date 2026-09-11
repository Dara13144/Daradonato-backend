const Store = require('../db/store');

class AuditService {
  async log({ userId, action, entity, entityId, metadata = {}, ip = '127.0.0.1' }) {
    try {
      return await Store.recordAuditLog({
        user_id: userId,
        action,
        entity,
        entity_id: entityId,
        metadata,
        ip_address: ip
      });
    } catch (err) {
      console.error('Audit Log Error:', err.message);
      return null;
    }
  }
}

module.exports = new AuditService();
