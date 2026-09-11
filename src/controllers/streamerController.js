const Store = require('../db/store');
const sanitizer = require('../services/sanitizer');
const auditService = require('../services/auditService');

class StreamerController {
  /**
   * Get public streamer profile by slug/username
   */
  async getBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const streamer = await Store.findStreamerBySlug(slug);

      if (!streamer) {
        return res.status(404).json({
          success: false,
          message: `Streamer '${slug}' not found.`
        });
      }

      // Fetch active donation goal
      const activeGoal = await Store.getActiveGoalByStreamerId(streamer.id);

      // Fetch donation page settings & leaderboard settings
      const donationPageSettings = await Store.getDonationPageSettingsByStreamerId(streamer.id);
      const leaderboardSettings = await Store.getLeaderboardSettingsByStreamerId(streamer.id);

      // Fetch recent public donations
      const recentDonations = await Store.getRecentDonations(streamer.id, 10);

      // Fetch top supporters
      const topSupporters = await Store.getLeaderboard(streamer.id, 'all');

      const rawProfile = streamer.profile || streamer.profiles || null;

      return res.json({
        success: true,
        data: {
          streamer: {
            id: streamer.id,
            slug: streamer.slug,
            donation_enabled: streamer.donation_enabled,
            min_donation_amount: streamer.min_donation_amount,
            currency: streamer.currency,
            total_received: streamer.total_received,
            supporter_count: streamer.supporter_count,
            social_links: streamer.social_links,
            aba_payway_link: streamer.aba_payway_link || '',
            aba_qr_url: streamer.aba_qr_url || '',
            aba_account_name: streamer.aba_account_name || '',
            aba_account_number: streamer.aba_account_number || '',
            aba_merchant_id: streamer.aba_merchant_id || '',
            aba_instructions: streamer.aba_instructions || '',
            aba_enabled: streamer.aba_enabled !== false,
            aba_mode: streamer.aba_mode || 'DIRECT_LINK',
            bakong_id: streamer.bakong_id || '',
            bakong_name: streamer.bakong_name || streamer.aba_account_name || '',
            bakong_enabled: streamer.bakong_enabled !== false,
            profile: rawProfile ? {
              display_name: rawProfile.display_name,
              username: rawProfile.username,
              avatar_url: rawProfile.avatar_url,
              banner_url: rawProfile.banner_url,
              bio: rawProfile.bio
            } : null
          },
          donationPageSettings,
          leaderboardSettings,
          activeGoal,
          recentDonations,
          topSupporters: topSupporters.slice(0, 5)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Search streamers
   */
  async searchStreamers(req, res, next) {
    try {
      const { q } = req.query;
      const streamers = await Store.getAllStreamers({ search: q });
      return res.json({
        success: true,
        data: streamers.map(s => {
          const rawProfile = s.profile || s.profiles || null;
          return {
            id: s.id,
            slug: s.slug,
            total_received: s.total_received,
            supporter_count: s.supporter_count,
            profile: rawProfile ? {
              display_name: rawProfile.display_name,
              username: rawProfile.username,
              avatar_url: rawProfile.avatar_url,
              banner_url: rawProfile.banner_url,
              bio: rawProfile.bio
            } : null
          };
        })
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a streamer profile (converts regular user to streamer)
   */
  async createProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const { slug, min_donation_amount, currency, social_links } = req.body;

      // Check if user already is a streamer
      const existing = await Store.findStreamerByUserId(userId);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'You already have a streamer profile registered.'
        });
      }

      // Check slug uniqueness
      const cleanSlug = (slug || req.user.username).toLowerCase().trim();
      if (!sanitizer.isValidSlug(cleanSlug)) {
        return res.status(400).json({
          success: false,
          message: 'Streamer slug must be 3-30 alphanumeric characters or underscores.'
        });
      }

      const slugTaken = await Store.findStreamerBySlug(cleanSlug);
      if (slugTaken) {
        return res.status(400).json({
          success: false,
          message: 'This streamer slug is already in use.'
        });
      }

      const streamer = await Store.createStreamer({
        user_id: userId,
        slug: cleanSlug,
        min_donation_amount: min_donation_amount || 1.00,
        currency: currency || 'USD',
        social_links: social_links || {}
      });

      // Update user profile role to STREAMER
      await Store.updateProfile(userId, { role: 'STREAMER' });

      await auditService.log({
        userId,
        action: 'STREAMER_PROFILE_CREATED',
        entity: 'STREAMER',
        entityId: streamer.id,
        ip: req.ip
      });

      return res.status(201).json({
        success: true,
        message: 'Streamer profile created successfully.',
        data: streamer
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update streamer settings (Owner only)
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) {
        return res.status(404).json({
          success: false,
          message: 'Streamer profile not found.'
        });
      }

      const {
        donation_enabled,
        min_donation_amount,
        currency,
        social_links,
        aba_payway_link,
        aba_qr_url,
        aba_account_name,
        aba_account_number,
        aba_merchant_id,
        aba_instructions,
        aba_enabled,
        aba_mode,
        display_name,
        bio,
        avatar_url,
        banner_url
      } = req.body;

      // Update streamer table
      const updatedStreamer = await Store.updateStreamer(streamer.id, {
        donation_enabled: donation_enabled !== undefined ? Boolean(donation_enabled) : streamer.donation_enabled,
        min_donation_amount: min_donation_amount !== undefined ? Number(min_donation_amount) : streamer.min_donation_amount,
        currency: currency || streamer.currency,
        social_links: social_links || streamer.social_links,
        ...(aba_payway_link !== undefined && { aba_payway_link }),
        ...(aba_qr_url !== undefined && { aba_qr_url }),
        ...(aba_account_name !== undefined && { aba_account_name }),
        ...(aba_account_number !== undefined && { aba_account_number }),
        ...(aba_merchant_id !== undefined && { aba_merchant_id }),
        ...(aba_instructions !== undefined && { aba_instructions }),
        ...(aba_enabled !== undefined && { aba_enabled: Boolean(aba_enabled) }),
        ...(aba_mode !== undefined && { aba_mode }),
        ...(req.body.bakong_id !== undefined && { bakong_id: req.body.bakong_id.trim() }),
        ...(req.body.bakong_name !== undefined && { bakong_name: req.body.bakong_name.trim() }),
        ...(req.body.bakong_enabled !== undefined && { bakong_enabled: Boolean(req.body.bakong_enabled) })
      });

      // Update profile table
      await Store.updateProfile(userId, {
        display_name: display_name || req.user.display_name,
        bio: bio !== undefined ? bio : req.user.bio,
        avatar_url: avatar_url || req.user.avatar_url,
        banner_url: banner_url || req.user.banner_url
      });

      return res.json({
        success: true,
        message: 'Settings updated successfully.',
        data: updatedStreamer
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/streamers/dashboard/profile
   * Returns the authenticated streamer's full profile + settings for dashboard pages
   */
  async getDashboardProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const profile = await Store.findProfileById(userId);
      const streamer = await Store.findStreamerByUserId(userId);

      if (!streamer) {
        return res.status(404).json({
          success: false,
          message: 'Streamer profile not found. Please create your streamer profile first.'
        });
      }

      const alertSettings = await Store.getAlertSettingsByStreamerId(streamer.id);
      const activeGoal = await Store.getActiveGoalByStreamerId(streamer.id);
      const donationPageSettings = await Store.getDonationPageSettingsByStreamerId(streamer.id);

      return res.json({
        success: true,
        data: {
          slug: streamer.slug,
          username: profile.username,
          display_name: profile.display_name,
          public_url: `/@${streamer.slug}`,
          profile: {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            email: profile.email,
            avatar_url: profile.avatar_url,
            banner_url: profile.banner_url,
            bio: profile.bio,
            role: profile.role
          },
          streamer: {
            id: streamer.id,
            slug: streamer.slug,
            donation_enabled: streamer.donation_enabled,
            min_donation_amount: streamer.min_donation_amount,
            currency: streamer.currency,
            total_received: streamer.total_received,
            supporter_count: streamer.supporter_count,
            social_links: streamer.social_links,
            aba_payway_link: streamer.aba_payway_link || '',
            aba_qr_url: streamer.aba_qr_url || '',
            aba_account_name: streamer.aba_account_name || '',
            aba_account_number: streamer.aba_account_number || '',
            aba_merchant_id: streamer.aba_merchant_id || '',
            aba_instructions: streamer.aba_instructions || '',
            aba_enabled: streamer.aba_enabled !== false,
            aba_mode: streamer.aba_mode || 'DIRECT_LINK',
            bakong_id: streamer.bakong_id || '',
            bakong_name: streamer.bakong_name || streamer.aba_account_name || '',
            bakong_enabled: streamer.bakong_enabled !== false
          },
          alertSettings,
          activeGoal,
          donationPageSettings
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get streamer dashboard overview stats
   */
  async getDashboardStats(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) {
        return res.status(404).json({
          success: false,
          message: 'Streamer profile not found.'
        });
      }

      const allDonations = await Store.getDonations({ streamer_id: streamer.id });
      const paidDonations = allDonations.data.filter(d => d.payment_status === 'PAID');

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      const todayDonations = paidDonations.filter(d => new Date(d.paid_at || d.created_at).getTime() >= todayStart);
      const todayTotal = todayDonations.reduce((acc, d) => acc + Number(d.amount), 0);

      const monthDonations = paidDonations.filter(d => new Date(d.paid_at || d.created_at).getTime() >= monthStart);
      const monthTotal = monthDonations.reduce((acc, d) => acc + Number(d.amount), 0);

      const activeGoal = await Store.getActiveGoalByStreamerId(streamer.id);

      return res.json({
        success: true,
        data: {
          streamer,
          metrics: {
            totalReceived: streamer.total_received,
            todayTotal,
            monthTotal,
            supporterCount: streamer.supporter_count,
            totalDonationsCount: paidDonations.length,
            pendingDonationsCount: allDonations.data.filter(d => d.payment_status === 'PENDING').length
          },
          activeGoal,
          recentDonations: allDonations.data.slice(0, 10)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  // Goals
  async getGoals(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) return res.status(404).json({ success: false, message: 'Streamer not found.' });

      const goals = await Store.getGoalsByStreamerId(streamer.id);
      return res.json({ success: true, data: goals });
    } catch (err) {
      next(err);
    }
  }

  async createGoal(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) return res.status(404).json({ success: false, message: 'Streamer not found.' });

      const { title, description, target_amount, end_date } = req.body;
      if (!title || !target_amount || Number(target_amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Title and positive target amount are required.' });
      }

      const goal = await Store.createGoal({
        streamer_id: streamer.id,
        title: sanitizer.sanitizeText(title, 100),
        description: sanitizer.sanitizeText(description, 300),
        target_amount: Number(target_amount),
        end_date: end_date || null
      });

      return res.status(201).json({ success: true, message: 'Donation goal created.', data: goal });
    } catch (err) {
      next(err);
    }
  }

  async updateGoal(req, res, next) {
    try {
      const { goalId } = req.params;
      const { title, description, target_amount, status } = req.body;

      const updated = await Store.updateGoal(goalId, {
        ...(title && { title: sanitizer.sanitizeText(title, 100) }),
        ...(description !== undefined && { description: sanitizer.sanitizeText(description, 300) }),
        ...(target_amount && { target_amount: Number(target_amount) }),
        ...(status && { status })
      });

      return res.json({ success: true, message: 'Goal updated.', data: updated });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new StreamerController();
