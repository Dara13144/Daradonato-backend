const Store = require('../db/store');
const sanitizer = require('../services/sanitizer');
const realtimeService = require('../services/realtimeService');

class LeaderboardController {
  /**
   * Get public leaderboard rankings for a streamer or global
   */
  async getLeaderboard(req, res, next) {
    try {
      const { streamerSlug } = req.params;
      const { period = 'all', limit = 10, page = 1, search = '' } = req.query; // 'today' | 'week' | 'month' | 'all'

      let streamerId = null;
      let streamer = null;
      let settings = null;

      if (streamerSlug && streamerSlug !== 'global') {
        streamer = await Store.findStreamerBySlug(streamerSlug);
        if (!streamer) {
          return res.status(404).json({ success: false, message: 'Streamer not found.' });
        }
        streamerId = streamer.id;
        settings = await Store.getLeaderboardSettingsByStreamerId(streamer.id);
      }

      // Map time_period string to internal period query parameter
      let effectivePeriod = period;
      if (!req.query.period && settings?.default_period) {
        const pMap = {
          'Today': 'today',
          'This Week': 'week',
          'This Month': 'month',
          'This Year': 'year',
          'All Time': 'all'
        };
        effectivePeriod = pMap[settings.default_period] || 'all';
      }

      const rawLeaderboard = await Store.getLeaderboard(streamerId, effectivePeriod);
      const stats = await Store.getLeaderboardStats(streamerId, effectivePeriod);

      // Filter by search query if present
      let filtered = rawLeaderboard;
      if (search) {
        const q = search.toLowerCase().trim();
        filtered = filtered.filter(r => (r.donor_name || '').toLowerCase().includes(q));
      }

      // Filter or format based on settings
      if (settings?.anonymous_mode === 'Hide Anonymous') {
        filtered = filtered.filter(r => !r.anonymous);
      } else if (settings?.anonymous_mode === 'Replace username with "Anonymous"') {
        filtered = filtered.map(r => ({
          ...r,
          donor_name: r.anonymous ? 'Anonymous' : r.donor_name
        }));
      }

      const totalEntries = filtered.length;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const maxLimit = parseInt(limit, 10) || (settings?.max_entries ? Number(settings.max_entries) : 10);
      const startIndex = (pageNum - 1) * maxLimit;
      const paginatedRankings = filtered.slice(startIndex, startIndex + maxLimit);

      return res.json({
        success: true,
        data: {
          period: effectivePeriod,
          streamerSlug: streamerSlug || 'global',
          streamer: streamer ? {
            id: streamer.id,
            slug: streamer.slug,
            displayName: streamer.profile ? streamer.profile.display_name : streamer.slug,
            avatarUrl: streamer.profile ? streamer.profile.avatar_url : null
          } : null,
          settings: settings || null,
          stats,
          top3: rawLeaderboard.slice(0, 3),
          rankings: paginatedRankings,
          pagination: {
            page: pageNum,
            limit: maxLimit,
            total: totalEntries,
            totalPages: Math.ceil(totalEntries / maxLimit) || 1
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Top 3 podium donors for a streamer
   */
  async getTop(req, res, next) {
    try {
      const { streamerSlug } = req.params;
      const { period = 'all', limit = 3 } = req.query;

      let streamerId = null;
      let streamer = null;

      if (streamerSlug && streamerSlug !== 'global') {
        streamer = await Store.findStreamerBySlug(streamerSlug);
        if (!streamer) {
          return res.status(404).json({ success: false, message: 'Streamer not found.' });
        }
        streamerId = streamer.id;
      }

      const topDonors = await Store.getTopDonors(streamerId, period, parseInt(limit, 10) || 3);
      const settings = streamerId ? await Store.getLeaderboardSettingsByStreamerId(streamerId) : null;

      return res.json({
        success: true,
        data: {
          period,
          streamerSlug: streamerSlug || 'global',
          settings,
          top: topDonors
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Leaderboard summary statistics
   */
  async getStats(req, res, next) {
    try {
      const { streamerSlug } = req.params;
      const { period = 'all' } = req.query;

      let streamerId = null;
      if (streamerSlug && streamerSlug !== 'global') {
        const streamer = await Store.findStreamerBySlug(streamerSlug);
        if (!streamer) {
          return res.status(404).json({ success: false, message: 'Streamer not found.' });
        }
        streamerId = streamer.id;
      }

      const stats = await Store.getLeaderboardStats(streamerId, period);

      return res.json({
        success: true,
        data: stats
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get authenticated streamer's leaderboard settings
   */
  async getSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = await Store.getLeaderboardSettingsByUserId(userId);

      return res.json({
        success: true,
        data: settings
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update authenticated streamer's leaderboard settings
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        enabled,
        title,
        description,
        ranking_type,
        time_period,
        default_period,
        max_entries,
        show_rank,
        show_avatar,
        show_username,
        show_amount,
        show_donation_count,
        anonymous_mode,
        currency,
        number_format,
        layout,
        theme,
        avatar_size,
        font,
        font_size,
        highlight_top3,
        top3_style,
        show_crown,
        show_rank_badge,
        show_glow,
        animation_enabled,
        animation_style,
        animation_speed,
        refresh_interval,
        empty_message
      } = req.body;

      const updates = {
        ...(enabled !== undefined && { enabled: Boolean(enabled) }),
        ...(title !== undefined && { title: sanitizer.sanitizeText(title, 100) }),
        ...(description !== undefined && { description: sanitizer.sanitizeText(description, 255) }),
        ...(ranking_type !== undefined && { ranking_type }),
        ...(time_period !== undefined && { time_period }),
        ...(default_period !== undefined && { default_period }),
        ...(max_entries !== undefined && { max_entries: parseInt(max_entries, 10) }),
        ...(show_rank !== undefined && { show_rank: Boolean(show_rank) }),
        ...(show_avatar !== undefined && { show_avatar: Boolean(show_avatar) }),
        ...(show_username !== undefined && { show_username: Boolean(show_username) }),
        ...(show_amount !== undefined && { show_amount: Boolean(show_amount) }),
        ...(show_donation_count !== undefined && { show_donation_count: Boolean(show_donation_count) }),
        ...(anonymous_mode !== undefined && { anonymous_mode }),
        ...(currency !== undefined && { currency }),
        ...(number_format !== undefined && { number_format }),
        ...(layout !== undefined && { layout }),
        ...(theme !== undefined && { theme }),
        ...(avatar_size !== undefined && { avatar_size }),
        ...(font !== undefined && { font }),
        ...(font_size !== undefined && { font_size }),
        ...(highlight_top3 !== undefined && { highlight_top3: Boolean(highlight_top3) }),
        ...(top3_style !== undefined && { top3_style }),
        ...(show_crown !== undefined && { show_crown: Boolean(show_crown) }),
        ...(show_rank_badge !== undefined && { show_rank_badge: Boolean(show_rank_badge) }),
        ...(show_glow !== undefined && { show_glow: Boolean(show_glow) }),
        ...(animation_enabled !== undefined && { animation_enabled: Boolean(animation_enabled) }),
        ...(animation_style !== undefined && { animation_style }),
        ...(animation_speed !== undefined && { animation_speed }),
        ...(refresh_interval !== undefined && { refresh_interval }),
        ...(empty_message !== undefined && { empty_message: sanitizer.sanitizeText(empty_message, 255) })
      };

      const updated = await Store.updateLeaderboardSettings(userId, updates);

      return res.json({
        success: true,
        message: 'Leaderboard settings saved successfully.',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reset leaderboard settings to defaults
   */
  async resetSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const reset = await Store.resetLeaderboardSettings(userId);

      return res.json({
        success: true,
        message: 'Leaderboard settings reset to defaults.',
        data: reset
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get public leaderboard settings for a streamer by slug
   */
  async getPublicSettings(req, res, next) {
    try {
      const streamerSlug = req.params.streamerSlug || req.params.username;
      const streamer = await Store.findStreamerBySlug(streamerSlug);
      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer not found.' });
      }

      const settings = await Store.getLeaderboardSettingsByStreamerId(streamer.id);

      return res.json({
        success: true,
        data: settings || null
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Realtime SSE stream for leaderboard updates
   */
  async streamLeaderboard(req, res, next) {
    try {
      const { username } = req.params;
      const streamer = await Store.findStreamerBySlug(username);
      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer not found.' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', streamerSlug: streamer.slug })}\n\n`);
      realtimeService.registerClient(streamer.id, res, [streamer.slug, username]);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new LeaderboardController();
