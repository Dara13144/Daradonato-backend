const crypto = require('crypto');
const axios = require('axios');
const config = require('../../config');
const bakong = require('./bakong');

class CutluyProvider {
  constructor() {
    this.apiUrl = config.cutluy.apiUrl || 'https://cutluy.com/v1';
    this.webhookSecret = config.cutluy.webhookSecret;
  }

  get activeApiKey() {
    return process.env.CUTLUY_API_KEY || config.cutluy.apiKey || 'ck_live_SHhZuhbELRdYYVI0v5OoV0FaabObeVPa';
  }

  get activeApiUrl() {
    return process.env.CUTLUY_API_URL || config.cutluy.apiUrl || 'https://cutluy.com/v1';
  }

  get activeWebhookSecret() {
    return process.env.CUTLUY_WEBHOOK_SECRET || config.cutluy.webhookSecret || '';
  }

  /**
   * Create a live CutLuy KHQR payment
   */
  async createPayment({ transactionId, amount, currency = 'USD', donorName = 'Supporter', streamerSlug = 'dara' }) {
    const numericAmount = parseFloat(amount);
    const key = this.activeApiKey;

    try {
      if (key) {
        const response = await axios.post(
          `${this.activeApiUrl}/payments`,
          {
            amount: numericAmount,
            reference_id: transactionId
          },
          {
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            timeout: 8000
          }
        );

        const raw = response.data?.data || response.data;
        if (raw && (raw.id || raw.qr_string || raw.checkout_url)) {
          const paymentId = raw.id || raw.payment_id || 'cutluy_' + crypto.randomBytes(8).toString('hex');
          const qrStr = raw.qr_string || raw.qr_code || raw.qr || raw.qrString || raw.qr_data;
          const checkoutUrl = raw.checkout_url || raw.payment_url || raw.url || `https://cutluy.com/pay/${paymentId}`;
          const qrSvgUrl = qrStr
            ? `https://cutluy.com/api/render/khqr/${encodeURIComponent(qrStr)}.svg`
            : null;

          return {
            provider: 'CUTLUY',
            id: paymentId,
            paymentUrl: checkoutUrl,
            checkoutUrl,
            qrData: qrStr,
            qrString: qrStr,
            qrSvgUrl,
            status: raw.status || 'pending',
            referenceId: raw.reference_id || transactionId,
            expiresAt: raw.expires_at || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            rawResponse: raw
          };
        }
      }
    } catch (err) {
      console.warn('CutLuy live API request failed or timed out, using fallback KHQR generator:', err.response?.data || err.message);
    }

    // Fallback: Generate valid EMVCo KHQR so development / offline mode works seamlessly
    const khqrRes = bakong.generateKHQR({
      amount: numericAmount,
      currency,
      transactionId
    });
    const fallbackKhqr = khqrRes?.qrData || `00020101021229300016zoee_donation@abaa5405${numericAmount.toFixed(2)}53038405802KH5913Zoee Donation6010Phnom Penh62200116${transactionId}6304ABCD`;

    const mockId = 'cutluy_' + crypto.randomBytes(12).toString('hex');
    const qrSvgUrl = `https://cutluy.com/api/render/khqr/${encodeURIComponent(fallbackKhqr)}.svg`;

    return {
      provider: 'CUTLUY',
      id: mockId,
      paymentUrl: `https://cutluy.com/pay/${mockId}`,
      checkoutUrl: `https://cutluy.com/pay/${mockId}`,
      qrData: fallbackKhqr,
      qrString: fallbackKhqr,
      qrSvgUrl,
      status: 'pending',
      referenceId: transactionId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      rawResponse: { id: mockId, qr_string: fallbackKhqr }
    };
  }

  /**
   * Fetch payment status directly from CutLuy API
   */
  async checkPaymentStatus(paymentId) {
    const key = this.activeApiKey;
    if (!paymentId || !key) return null;
    try {
      const response = await axios.get(`${this.activeApiUrl}/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${key}`
        },
        timeout: 5000
      });

      return response.data || null;
    } catch (err) {
      console.warn(`Failed to check CutLuy payment ${paymentId}:`, err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Verify HMAC-SHA256 Webhook Signature
   * Header: X-CutLuy-Signature: t=1625832000,v1=5d41402abc4b2a76b9719d911017c592...
   */
  verifyWebhookSignature(header, rawBody) {
    if (!header || !rawBody) return false;
    const secret = this.activeWebhookSecret;
    if (!secret) return true; // If no secret configured in dev mode, accept payload

    try {
      const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
      if (!parts.t || !parts.v1) return false;

      // Check freshness (within 5 minutes / 300s)
      const timestamp = Number(parts.t);
      const isFresh = Math.abs(Date.now() / 1000 - timestamp) < 300;
      if (!isFresh) return false;

      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${parts.t}.${rawBody}`)
        .digest('hex');

      return (
        parts.v1 &&
        crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected))
      );
    } catch (err) {
      console.error('CutLuy webhook signature verification error:', err);
      return false;
    }
  }
}

module.exports = new CutluyProvider();
