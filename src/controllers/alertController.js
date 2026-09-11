const Store = require('../db/store');
const realtimeService = require('../services/realtimeService');
const sanitizer = require('../services/sanitizer');

class AlertController {
  /**
   * Get alert settings for public OBS Overlay or Streamer Dashboard
   */
  async getSettings(req, res, next) {
    try {
      const { identifier } = req.params; // Can be slug or token
      const token = req.query.token || identifier;

      let streamer = await Store.findStreamerBySlug(identifier);
      let alertSettings = null;

      if (streamer) {
        alertSettings = await Store.getAlertSettingsByStreamerId(streamer.id);
      } else {
        alertSettings = await Store.getAlertSettingsByToken(identifier) || (token ? await Store.getAlertSettingsByToken(token) : null);
        if (alertSettings) {
          streamer = await Store.findStreamerById(alertSettings.streamer_id);
        }
      }

      // If streamer profile exists by slug (e.g. sotorekira)
      if (!streamer && identifier) {
        streamer = await Store.findStreamerBySlug(identifier);
      }

      if (!streamer) {
        return res.status(404).json({
          success: false,
          message: 'Alert configuration or streamer not found.'
        });
      }

      if (!alertSettings) {
        alertSettings = await Store.getAlertSettingsByStreamerId(streamer.id);
      }

      return res.json({
        success: true,
        data: {
          streamer: {
            id: streamer.id,
            slug: streamer.slug,
            displayName: streamer.profile ? streamer.profile.display_name : streamer.slug,
            avatarUrl: streamer.profile ? streamer.profile.avatar_url : null
          },
          alertSettings
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update alert settings (Streamer only)
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer profile not found.' });
      }

      const {
        animation,
        preset,
        header_color,
        background_color,
        border_color,
        glow_color,
        glow_size,
        action_text,
        media_url,
        bg_type,
        sound_url,
        sound_volume,
        video_volume,
        duration,
        tts_enabled,
        tts_volume,
        tts_voice,
        tts_speed,
        tts_template,
        minimum_tts_amount,
        custom_tiers,
        custom_css
      } = req.body;

      const updated = await Store.updateAlertSettings(streamer.id, {
        ...(animation && { animation }),
        ...(preset && { preset }),
        ...(header_color && { header_color }),
        ...(background_color && { background_color }),
        ...(border_color && { border_color }),
        ...(glow_color && { glow_color }),
        ...(glow_size !== undefined && { glow_size: Number(glow_size) }),
        ...(action_text !== undefined && { action_text: sanitizer.sanitizeText(action_text, 100) }),
        ...(media_url !== undefined && { media_url: sanitizer.sanitizeText(media_url, 2000000) }),
        ...(bg_type && { bg_type }),
        ...(sound_url && { sound_url }),
        ...(sound_volume !== undefined && { sound_volume: Number(sound_volume) }),
        ...(video_volume !== undefined && { video_volume: Number(video_volume) }),
        ...(duration && { duration: parseInt(duration, 10) }),
        ...(tts_enabled !== undefined && { tts_enabled: Boolean(tts_enabled) }),
        ...(tts_volume !== undefined && { tts_volume: Number(tts_volume) }),
        ...(tts_voice && { tts_voice }),
        ...(tts_speed !== undefined && { tts_speed: Number(tts_speed) }),
        ...(tts_template !== undefined && { tts_template: sanitizer.sanitizeText(tts_template, 300) }),
        ...(minimum_tts_amount !== undefined && { minimum_tts_amount: Number(minimum_tts_amount) }),
        ...(custom_tiers !== undefined && { custom_tiers }),
        ...(custom_css !== undefined && { custom_css: sanitizer.sanitizeText(custom_css, 500) })
      });

      // Broadcast settings update to connected overlays in realtime
      realtimeService.broadcastEvent(streamer.id, {
        type: 'SETTINGS_UPDATED',
        streamerId: streamer.id,
        streamerSlug: streamer.slug,
        settings: updated
      });
      if (streamer.slug) {
        realtimeService.broadcastEvent(streamer.slug, {
          type: 'SETTINGS_UPDATED',
          streamerId: streamer.id,
          streamerSlug: streamer.slug,
          settings: updated
        });
      }

      return res.json({
        success: true,
        message: 'Alert settings updated successfully.',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * SSE Stream endpoint for OBS Browser Source Overlay
   */
  async streamOverlayEvents(req, res, next) {
    try {
      const { identifier } = req.params; // Token or streamer slug
      const token = req.query.token || identifier;

      let streamer = await Store.findStreamerBySlug(identifier);
      let alertSettings = null;

      if (streamer) {
        alertSettings = await Store.getAlertSettingsByStreamerId(streamer.id);
      } else {
        alertSettings = await Store.getAlertSettingsByToken(identifier) || (token ? await Store.getAlertSettingsByToken(token) : null);
        if (alertSettings) {
          streamer = await Store.findStreamerById(alertSettings.streamer_id);
        }
      }

      if (!streamer && identifier) {
        streamer = await Store.findStreamerBySlug(identifier);
      }

      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Invalid overlay identifier.' });
      }

      if (!alertSettings) {
        alertSettings = await Store.getAlertSettingsByStreamerId(streamer.id);
      }

      // Configure SSE Headers with proxy buffering disabled
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Initial connection greeting
      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', streamerSlug: streamer.slug })}\n\n`);

      // Register connection in RealtimeService with alias keys
      const aliases = [streamer.slug, identifier, token].filter(Boolean);
      if (alertSettings && alertSettings.overlay_token) {
        aliases.push(alertSettings.overlay_token);
      }
      realtimeService.registerClient(streamer.id, res, aliases);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Dispatch a Test Alert to OBS Overlay
   */
  async sendTestAlert(req, res, next) {
    try {
      let streamer = null;
      if (req.user) {
        streamer = await Store.findStreamerByUserId(req.user.id);
      }

      const identifier = req.params?.identifier || req.body?.streamerSlug || req.body?.identifier;
      if (!streamer && identifier) {
        streamer = await Store.findStreamerBySlug(identifier);
        if (!streamer) {
          streamer = await Store.findStreamerById(identifier);
        }
        if (!streamer) {
          const alertConfig = await Store.getAlertSettingsByToken(identifier);
          if (alertConfig) {
            streamer = await Store.findStreamerById(alertConfig.streamer_id);
          }
        }
      }

      if (!streamer) {
        // Fallback default streamer
        streamer = await Store.findStreamerBySlug('dara_gaming');
      }

      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer profile not found.' });
      }

      const {
        donorName = 'Zoee Supafan',
        amount = 10.00,
        currency = 'USD',
        message = 'This is a live test donation alert from Zoee Donation! 🚀❤️',
        mediaUrl,
        media_url
      } = req.body || {};

      let alertSettings = null;
      try {
        alertSettings = await Store.getAlertSettingsByStreamerId(streamer.id);
      } catch (e) {
        console.warn('Could not fetch alert settings for test alert:', e.message);
      }

      const testPayload = {
        id: 'test-alert-' + Date.now(),
        streamer_id: streamer.id,
        streamer_slug: streamer.slug,
        donor_name: donorName,
        amount: Number(amount),
        currency,
        message,
        anonymous: false,
        tts_enabled: true,
        media_url: mediaUrl || media_url || null,
        payment_method: 'KHQR',
        isTest: true,
        paid_at: new Date().toISOString(),
        settings: alertSettings
      };

      realtimeService.broadcastTestAlert(streamer.id, testPayload);
      if (streamer.slug) {
        realtimeService.broadcastTestAlert(streamer.slug, testPayload);
      }

      return res.json({
        success: true,
        message: `Test alert broadcasted to connected OBS overlays for @${streamer.slug}.`,
        data: testPayload
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AlertController();

