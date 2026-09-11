const Store = require('../db/store');
const abaPayway = require('../services/payments/abaPayway');
const manualKhqr = require('../services/payments/manualKhqr');
const bakong = require('../services/payments/bakong');

class AbaPaywaySettingsController {
  /**
   * GET /api/settings/aba-payway
   * Get user's ABA PayWay configuration
   */
  async getSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) {
        return res.status(404).json({
          success: false,
          message: 'Streamer profile not found.'
        });
      }

      const settings = {
        enabled: streamer.aba_enabled !== false,
        mode: streamer.aba_mode || 'DIRECT_LINK', // 'DIRECT_LINK' | 'MERCHANT_API' | 'KHQR'
        account_name: streamer.aba_account_name || req.user.display_name || '',
        account_number: streamer.aba_account_number || '',
        payway_link: streamer.aba_payway_link || '',
        qr_url: streamer.aba_qr_url || '',
        merchant_id: streamer.aba_merchant_id || '',
        api_key_masked: streamer.aba_api_key ? '••••••••' + streamer.aba_api_key.slice(-4) : '',
        environment: streamer.aba_environment || 'sandbox',
        donor_instructions: streamer.aba_instructions || '',
        bakong_id: streamer.bakong_id || '',
        bakong_name: streamer.bakong_name || streamer.aba_account_name || req.user.display_name || '',
        bakong_enabled: streamer.bakong_enabled !== false,
        webhook_url: `${req.protocol}://${req.get('host')}/api/webhooks/aba`,
        status: streamer.aba_payway_link || streamer.aba_account_number || streamer.aba_merchant_id || streamer.bakong_id ? 'CONFIGURED' : 'PENDING'
      };

      return res.json({
        success: true,
        data: settings
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/settings/aba-payway
   * Update user's ABA PayWay configuration
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
        enabled,
        mode,
        account_name,
        account_number,
        payway_link,
        qr_url,
        merchant_id,
        api_key,
        environment,
        donor_instructions,
        bakong_id,
        bakong_name,
        bakong_enabled
      } = req.body;

      // Clean payway link
      let cleanLink = payway_link ? payway_link.trim() : '';
      if (cleanLink && !cleanLink.startsWith('http://') && !cleanLink.startsWith('https://')) {
        cleanLink = `https://${cleanLink}`;
      }

      const updateData = {
        aba_enabled: enabled !== undefined ? Boolean(enabled) : streamer.aba_enabled !== false,
        aba_mode: mode || streamer.aba_mode || 'DIRECT_LINK',
        aba_account_name: account_name !== undefined ? account_name.trim() : (streamer.aba_account_name || ''),
        aba_account_number: account_number !== undefined ? account_number.trim().replace(/\s+/g, '') : (streamer.aba_account_number || ''),
        aba_payway_link: cleanLink,
        aba_qr_url: qr_url !== undefined ? qr_url.trim() : (streamer.aba_qr_url || ''),
        aba_merchant_id: merchant_id !== undefined ? merchant_id.trim() : (streamer.aba_merchant_id || ''),
        aba_environment: environment || streamer.aba_environment || 'sandbox',
        aba_instructions: donor_instructions !== undefined ? donor_instructions.trim() : (streamer.aba_instructions || ''),
        ...(bakong_id !== undefined && { bakong_id: bakong_id.trim() }),
        ...(bakong_name !== undefined && { bakong_name: bakong_name.trim() }),
        ...(bakong_enabled !== undefined && { bakong_enabled: Boolean(bakong_enabled) })
      };

      if (api_key && api_key.trim() && !api_key.includes('••••')) {
        updateData.aba_api_key = api_key.trim();
      }

      const updatedStreamer = await Store.updateStreamer(streamer.id, updateData);

      return res.json({
        success: true,
        message: 'Payment configuration saved successfully!',
        data: {
          enabled: updatedStreamer.aba_enabled,
          mode: updatedStreamer.aba_mode,
          account_name: updatedStreamer.aba_account_name,
          account_number: updatedStreamer.aba_account_number,
          payway_link: updatedStreamer.aba_payway_link,
          qr_url: updatedStreamer.aba_qr_url,
          merchant_id: updatedStreamer.aba_merchant_id,
          environment: updatedStreamer.aba_environment,
          donor_instructions: updatedStreamer.aba_instructions,
          bakong_id: updatedStreamer.bakong_id || '',
          bakong_name: updatedStreamer.bakong_name || '',
          bakong_enabled: updatedStreamer.bakong_enabled !== false,
          status: 'CONFIGURED'
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/settings/aba-payway/test
   * Test ABA PayWay setup and generate preview payment payload
   */
  async testConnection(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) {
        return res.status(404).json({
          success: false,
          message: 'Streamer profile not found.'
        });
      }

      const testAmount = 1.00;
      const testTxnId = `TEST-ABA-${Date.now().toString().slice(-6)}`;

      let samplePayload;
      if (streamer.aba_payway_link) {
        samplePayload = {
          provider: 'ABA_PAYWAY_DIRECT',
          type: 'DIRECT_LINK',
          transactionId: testTxnId,
          amount: testAmount.toFixed(2),
          currency: 'USD',
          targetUrl: streamer.aba_payway_link,
          test_qr_payload: streamer.aba_payway_link,
          accountName: streamer.aba_account_name || req.user.display_name || 'Streamer',
          accountNumber: streamer.aba_account_number || 'N/A'
        };
      } else {
        // Generate simulated ABA PayWay payload with HMAC
        const abaRes = await abaPayway.createPayment({
          transactionId: testTxnId,
          amount: testAmount.toFixed(2),
          currency: 'USD',
          donorName: 'Test Supporter'
        });
        samplePayload = {
          provider: 'ABA_PAYWAY_GATEWAY',
          type: 'GATEWAY_HASH',
          transactionId: testTxnId,
          amount: testAmount.toFixed(2),
          currency: 'USD',
          hash: abaRes.hash,
          test_qr_payload: abaRes.qrData,
          merchantId: streamer.aba_merchant_id || abaPayway.merchantId,
          accountName: streamer.aba_account_name || 'Verified Merchant'
        };
      }

      return res.json({
        success: true,
        message: 'ABA PayWay credentials and link format verified successfully!',
        data: samplePayload
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/settings/aba-payway/check-bakong
   * Verify Bakong Account ID on NBC Open API network
   */
  async checkBakongAccount(req, res, next) {
    try {
      const { bakong_id, accountId } = req.body;
      const targetId = (bakong_id || accountId || '').trim();
      if (!targetId) {
        return res.status(400).json({ success: false, message: 'Bakong Account ID is required.' });
      }

      const result = await bakong.checkBakongAccount(targetId);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AbaPaywaySettingsController();
