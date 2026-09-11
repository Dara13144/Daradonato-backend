const Store = require('../db/store');
const sanitizer = require('../services/sanitizer');

class VoiceAiController {
  /**
   * Default Voice AI & TTS configuration
   */
  getDefaults() {
    return {
      tts_enabled: true,
      tts_voice: 'khmer_natural',
      tts_speed: 1.0,
      tts_pitch: 1.0,
      tts_volume: 0.85,
      minimum_tts_amount: 1.0,
      tts_template: 'សូមអរគុណដល់ {donor} សម្រាប់ការឧបត្ថម្ភចំនួន {amount} និងការគាំទ្រ! {message}',
      tier1_template: 'សូមអរគុណដល់ {donor} សម្រាប់ការឧបត្ថម្ភ {amount} និងការគាំទ្រ! {message}',
      tier2_template: 'អរគុណច្រើនបង {donor} សម្រាប់ការឧបត្ថម្ភ {amount} និងការគាំទ្រដល់ Channel! {message}',
      tier3_template: '🎉 វ៉ោវ! សូមអរគុណមហាសេដ្ឋី {donor} សម្រាប់ការឧបត្ថម្ភ {amount} ដុល្លារយ៉ាងកក្រើក និងការគាំទ្រ! {message}',
      profanity_filter: true,
      spam_filter: true,
      max_chars: 180,
      bilingual_mode: true,
      pronounce_currency: true
    };
  }

  /**
   * Get streamer Voice AI / TTS settings
   */
  async getSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) {
        return res.status(404).json({ success: false, error: 'Streamer profile not found' });
      }

      // Check alertSettings / social_links / voice_ai metadata
      const alertSettings = await Store.getAlertSettingsByStreamerId(streamer.id);
      const voiceConfig = streamer.social_links?.voice_ai || {};

      const responseData = {
        ...this.getDefaults(),
        ...(alertSettings || {}),
        ...voiceConfig
      };

      return res.json({
        success: true,
        data: responseData
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update streamer Voice AI / TTS settings
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) {
        return res.status(404).json({ success: false, error: 'Streamer profile not found' });
      }

      const {
        tts_enabled,
        tts_voice,
        tts_speed,
        tts_pitch,
        tts_volume,
        minimum_tts_amount,
        tts_template,
        tier1_template,
        tier2_template,
        tier3_template,
        profanity_filter,
        spam_filter,
        max_chars,
        bilingual_mode,
        pronounce_currency
      } = req.body;

      const voicePayload = {
        tts_enabled: tts_enabled !== undefined ? Boolean(tts_enabled) : true,
        tts_voice: sanitizer.sanitizeText(tts_voice || 'khmer_natural', 50),
        tts_speed: Math.min(Math.max(Number(tts_speed) || 1.0, 0.5), 2.0),
        tts_pitch: Math.min(Math.max(Number(tts_pitch) || 1.0, 0.5), 2.0),
        tts_volume: Math.min(Math.max(Number(tts_volume) || 0.85, 0), 1.0),
        minimum_tts_amount: Math.max(Number(minimum_tts_amount) || 1.0, 0),
        tts_template: sanitizer.sanitizeText(tts_template || '{donor} បានឧបត្ថម្ភចំនួន {amount}! {message}', 300),
        tier1_template: sanitizer.sanitizeText(tier1_template || '', 300),
        tier2_template: sanitizer.sanitizeText(tier2_template || '', 300),
        tier3_template: sanitizer.sanitizeText(tier3_template || '', 300),
        profanity_filter: profanity_filter !== undefined ? Boolean(profanity_filter) : true,
        spam_filter: spam_filter !== undefined ? Boolean(spam_filter) : true,
        max_chars: Math.min(Math.max(parseInt(max_chars, 10) || 180, 20), 500),
        bilingual_mode: bilingual_mode !== undefined ? Boolean(bilingual_mode) : true,
        pronounce_currency: pronounce_currency !== undefined ? Boolean(pronounce_currency) : true,
        updated_at: new Date().toISOString()
      };

      // 1. Update Alert Settings table / memory
      await Store.updateAlertSettings(streamer.id, {
        tts_enabled: voicePayload.tts_enabled,
        tts_voice: voicePayload.tts_voice,
        tts_speed: voicePayload.tts_speed,
        tts_pitch: voicePayload.tts_pitch,
        tts_volume: voicePayload.tts_volume,
        minimum_tts_amount: voicePayload.minimum_tts_amount,
        tts_template: voicePayload.tts_template
      });

      // 2. Persist comprehensive Voice AI configuration safely in streamer record
      const currentSocial = streamer.social_links || {};
      await Store.updateStreamer(streamer.id, {
        social_links: {
          ...currentSocial,
          voice_ai: voicePayload
        }
      });

      return res.json({
        success: true,
        message: 'Voice AI custom message settings saved successfully',
        data: voicePayload
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Test synthesis and preview rendered text
   */
  async testSpeech(req, res, next) {
    try {
      const {
        donor = 'Sokha Gaming',
        amount = 5.0,
        currency = 'USD',
        message = 'រីករាយថ្ងៃកំណើត សូមជូនពរសុខភាពល្អ ជោគជ័យគ្រប់ភារកិច្ច!',
        template = '{donor} បានឧបត្ថម្ភចំនួន {amount}! សារជូនពរ៖ {message}',
        voice = 'khmer_natural'
      } = req.body;

      let renderedText = template
        .replace(/\{donor\}/gi, donor)
        .replace(/\{donorName\}/gi, donor)
        .replace(/\{name\}/gi, donor)
        .replace(/\{price\}/gi, `${amount} ${currency}`)
        .replace(/\{amount\}/gi, `${amount} ${currency}`)
        .replace(/\{money\}/gi, `${amount} ${currency}`)
        .replace(/\{currency\}/gi, currency)
        .replace(/\{message\}/gi, message)
        .replace(/\{msg\}/gi, message)
        .replace(/\{streamer\}/gi, 'Dara Gaming');

      return res.json({
        success: true,
        data: {
          renderedText,
          donor,
          amount,
          currency,
          voice,
          status: 'SYNTHESIS_READY'
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reset Voice AI settings to defaults
   */
  async resetSettings(req, res, next) {
    try {
      const defaults = this.getDefaults();
      return res.json({
        success: true,
        message: 'Voice AI reset to default configuration',
        data: defaults
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new VoiceAiController();
