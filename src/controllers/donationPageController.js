const Store = require('../db/store');
const sanitizer = require('../services/sanitizer');

class DonationPageController {
  /**
   * Get authenticated streamer's donation page settings
   */
  async getSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = await Store.getDonationPageSettingsByUserId(userId);

      return res.json({
        success: true,
        data: settings
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update authenticated streamer's donation page settings
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        enabled,
        title,
        description,
        currency,
        min_amount,
        max_amount,
        preset_amounts,
        custom_amount_enabled,
        anonymous_enabled,
        show_donor_name,
        show_donor_email,
        show_donor_message,
        show_recent_donations,
        show_social_links
      } = req.body;

      const updates = {
        ...(enabled !== undefined && { enabled: Boolean(enabled) }),
        ...(title !== undefined && { title: sanitizer.sanitizeText(title, 150) }),
        ...(description !== undefined && { description: sanitizer.sanitizeText(description, 500) }),
        ...(currency !== undefined && { currency }),
        ...(min_amount !== undefined && { min_amount: Number(min_amount) }),
        ...(max_amount !== undefined && { max_amount: Number(max_amount) }),
        ...(preset_amounts !== undefined && { preset_amounts }),
        ...(custom_amount_enabled !== undefined && { custom_amount_enabled: Boolean(custom_amount_enabled) }),
        ...(anonymous_enabled !== undefined && { anonymous_enabled: Boolean(anonymous_enabled) }),
        ...(show_donor_name !== undefined && { show_donor_name: Boolean(show_donor_name) }),
        ...(show_donor_email !== undefined && { show_donor_email: Boolean(show_donor_email) }),
        ...(show_donor_message !== undefined && { show_donor_message: Boolean(show_donor_message) }),
        ...(show_recent_donations !== undefined && { show_recent_donations: Boolean(show_recent_donations) }),
        ...(show_social_links !== undefined && { show_social_links: Boolean(show_social_links) })
      };

      const updated = await Store.updateDonationPageSettings(userId, updates);

      return res.json({
        success: true,
        message: 'Donation page settings saved successfully.',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reset donation page settings to defaults
   */
  async resetSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const reset = await Store.resetDonationPageSettings(userId);

      return res.json({
        success: true,
        message: 'Donation page settings reset to defaults.',
        data: reset
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get public donation page settings for a streamer by slug
   */
  async getPublicSettings(req, res, next) {
    try {
      const { username } = req.params;
      const streamer = await Store.findStreamerBySlug(username);
      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer not found.' });
      }

      const settings = await Store.getDonationPageSettingsByStreamerId(streamer.id);

      return res.json({
        success: true,
        data: settings || null
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DonationPageController();
