const Store = require('../db/store');
const telegramService = require('../services/telegramService');

class TelegramController {
  /**
   * Get Telegram bot connection status & pairing code
   */
  async getConnectionStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) return res.status(404).json({ success: false, message: 'Streamer not found.' });

      const connection = await Store.getTelegramConnectionByStreamerId(streamer.id);
      let pairingCode = null;

      if (!connection) {
        pairingCode = await Store.createTelegramPairingCode(streamer.id);
      }

      const effectiveCode = pairingCode || (connection ? connection.pairing_code : null);
      const botUsername = telegramService.botUsername;
      const botLink = `https://t.me/${botUsername}`;
      const deepLink = effectiveCode ? `https://t.me/${botUsername}?start=${effectiveCode.replace(/-/g, '_')}` : botLink;

      return res.json({
        success: true,
        data: {
          connected: Boolean(connection && connection.status === 'ACTIVE' && connection.chat_id),
          chatId: connection ? connection.chat_id : null,
          pairingCode: effectiveCode,
          botUsername,
          botLink,
          deepLink
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Generate new pairing code
   */
  async generateCode(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) return res.status(404).json({ success: false, message: 'Streamer not found.' });

      const code = await Store.createTelegramPairingCode(streamer.id);
      const botUsername = telegramService.botUsername;
      const deepLink = `https://t.me/${botUsername}?start=${code.replace(/-/g, '_')}`;

      return res.json({
        success: true,
        data: {
          pairingCode: code,
          botUsername,
          botLink: `https://t.me/${botUsername}`,
          deepLink
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Pair telegram chat via bot webhook or direct API pairing
   */
  async pairChat(req, res, next) {
    try {
      const { pairingCode, chatId, telegramUserId } = req.body;
      if (!pairingCode || !chatId) {
        return res.status(400).json({ success: false, message: 'Pairing code and chat ID required.' });
      }

      const connection = await Store.pairTelegramChat(pairingCode, chatId, telegramUserId || chatId);
      if (!connection) {
        return res.status(404).json({ success: false, message: 'Invalid or expired pairing code.' });
      }

      return res.json({
        success: true,
        message: 'Telegram account paired successfully!',
        data: connection
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Trigger a test notification to the connected Telegram chat
   */
  async testAlert(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) return res.status(404).json({ success: false, message: 'Streamer not found.' });

      const connection = await Store.getTelegramConnectionByStreamerId(streamer.id);
      if (!connection || !connection.chat_id) {
        return res.status(400).json({ success: false, message: 'Please connect your Telegram bot first before sending a test alert.' });
      }

      const result = await telegramService.sendTestNotification(streamer.id);
      return res.json({
        success: result.sent,
        message: result.sent ? 'Test alert sent successfully to Telegram!' : 'Failed to send alert to Telegram.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Disconnect Telegram connection for streamer
   */
  async disconnect(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) return res.status(404).json({ success: false, message: 'Streamer not found.' });

      await Store.disconnectTelegramConnection(streamer.id);
      return res.json({
        success: true,
        message: 'Telegram account disconnected successfully.'
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new TelegramController();
