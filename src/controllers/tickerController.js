const Store = require('../db/store');
const sanitizer = require('../services/sanitizer');
const realtimeService = require('../services/realtimeService');

class TickerController {
  /**
   * Get public ticker configuration for a streamer
   */
  async getPublicTicker(req, res, next) {
    try {
      const { username } = req.params;
      const streamer = await Store.findStreamerBySlug(username);

      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer not found.' });
      }

      const settings = await Store.getTickerSettingsByStreamerId(streamer.id);

      return res.json({
        success: true,
        data: {
          streamer: {
            id: streamer.id,
            slug: streamer.slug,
            currency: streamer.currency
          },
          settings: settings || {
            enabled: true,
            theme: 'Gaming',
            animation: 'Scroll Left',
            direction: 'left',
            speed: 40,
            font_size: 'Medium',
            font_weight: 'Bold',
            show_avatar: true,
            show_name: true,
            show_amount: true,
            show_message: true,
            show_currency: true,
            max_donations: 15,
            custom_text: '🎉 Live Supporter Feed •',
            anonymous_mode: 'Show Anonymous'
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get allowed recent paid donations for public ticker (safe public fields only)
   */
  async getPublicDonations(req, res, next) {
    try {
      const { username } = req.params;
      const streamer = await Store.findStreamerBySlug(username);

      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer not found.' });
      }

      const settings = await Store.getTickerSettingsByStreamerId(streamer.id);
      const limit = settings?.max_donations ? Number(settings.max_donations) : 15;

      const donationsResult = await Store.getDonations(
        { streamer_id: streamer.id, payment_status: 'PAID' },
        { page: 1, limit }
      );

      // Safe sanitize & filter
      const safeDonations = donationsResult.data.map(d => {
        let name = d.donor_name || 'Anonymous';
        if (settings?.anonymous_mode === 'Hide Anonymous' && name.toLowerCase() === 'anonymous') {
          return null;
        }
        if (settings?.anonymous_mode === 'Replace username with "Anonymous"' && d.anonymous) {
          name = 'Anonymous';
        }

        return {
          id: d.id,
          username: name,
          amount: Number(d.amount),
          currency: d.currency || 'USD',
          message: sanitizer.sanitizeText(d.message || '', 150),
          avatar: d.donor_avatar || null,
          timestamp: d.created_at
        };
      }).filter(Boolean);

      return res.json({
        success: true,
        data: safeDonations
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get authenticated streamer's ticker settings
   */
  async getSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = await Store.getTickerSettingsByUserId(userId);

      return res.json({
        success: true,
        data: settings
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update authenticated streamer's ticker settings
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        enabled,
        theme,
        animation,
        direction,
        speed,
        font_size,
        font_weight,
        show_avatar,
        show_name,
        show_amount,
        show_message,
        show_currency,
        max_donations,
        show_latest,
        show_largest,
        show_today,
        custom_text,
        avatar_size,
        spacing,
        height,
        pause_on_hover,
        infinite_loop,
        anonymous_mode
      } = req.body;

      const updates = {
        ...(enabled !== undefined && { enabled: Boolean(enabled) }),
        ...(theme !== undefined && { theme }),
        ...(animation !== undefined && { animation }),
        ...(direction !== undefined && { direction }),
        ...(speed !== undefined && { speed: parseInt(speed, 10) }),
        ...(font_size !== undefined && { font_size }),
        ...(font_weight !== undefined && { font_weight }),
        ...(show_avatar !== undefined && { show_avatar: Boolean(show_avatar) }),
        ...(show_name !== undefined && { show_name: Boolean(show_name) }),
        ...(show_amount !== undefined && { show_amount: Boolean(show_amount) }),
        ...(show_message !== undefined && { show_message: Boolean(show_message) }),
        ...(show_currency !== undefined && { show_currency: Boolean(show_currency) }),
        ...(max_donations !== undefined && { max_donations: parseInt(max_donations, 10) }),
        ...(show_latest !== undefined && { show_latest: Boolean(show_latest) }),
        ...(show_largest !== undefined && { show_largest: Boolean(show_largest) }),
        ...(show_today !== undefined && { show_today: Boolean(show_today) }),
        ...(custom_text !== undefined && { custom_text: sanitizer.sanitizeText(custom_text, 255) }),
        ...(avatar_size !== undefined && { avatar_size }),
        ...(spacing !== undefined && { spacing: parseInt(spacing, 10) }),
        ...(height !== undefined && { height: parseInt(height, 10) }),
        ...(pause_on_hover !== undefined && { pause_on_hover: Boolean(pause_on_hover) }),
        ...(infinite_loop !== undefined && { infinite_loop: Boolean(infinite_loop) }),
        ...(anonymous_mode !== undefined && { anonymous_mode })
      };

      const updated = await Store.updateTickerSettings(userId, updates);

      return res.json({
        success: true,
        message: 'Ticker settings saved successfully.',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Trigger test ticker event
   */
  async triggerTestTicker(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);

      const testEvent = {
        type: 'DONATION_PAID',
        is_test: true,
        donationId: 'test-' + Date.now(),
        username: 'Demo Supporter',
        amount: 10.00,
        currency: 'USD',
        message: 'This is a live test donation for the OBS ticker! 🎉',
        avatar: '/zoee-avatar.png',
        timestamp: new Date().toISOString()
      };

      if (streamer) {
        realtimeService.broadcastEvent(streamer.id, testEvent);
      }

      return res.json({
        success: true,
        message: 'Test ticker event broadcasted successfully.',
        data: testEvent
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new TickerController();
