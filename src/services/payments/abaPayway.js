const crypto = require('crypto');
const axios = require('axios');
const config = require('../../config');

/**
 * ABA PayWay v2 Gateway Service
 * Reference: ABA PayWay Developer Documentation
 * - Hash generation: Base64(HMAC-SHA512(concat_str, apiKey))
 * - Webhook signature verification
 * - Sandbox and Live Environment support
 */
class AbaPaywayService {
  constructor() {
    this.merchantId = config.aba.merchantId;
    this.apiKey = config.aba.apiKey;
    this.apiUrl = config.aba.apiUrl;
    this.environment = config.aba.environment;
  }

  /**
   * Generate HMAC-SHA512 signature for ABA PayWay request
   * Hash String format: req_time + merchant_id + tran_id + amount + items + hash
   */
  generateHash(reqTime, tranId, amount, items = '', shipping = '0.00', firstName = '', lastName = '', email = '', phone = '', type = 'purchase', paymentOption = '') {
    const hashString = `${reqTime}${this.merchantId}${tranId}${amount}${items}${shipping}${firstName}${lastName}${email}${phone}${type}${paymentOption}`;
    const hmac = crypto.createHmac('sha512', this.apiKey);
    hmac.update(hashString);
    return hmac.digest('base64');
  }

  /**
   * Verify inbound webhook or callback signature from ABA PayWay
   */
  verifyCallbackSignature(reqTime, tranId, status, receivedHash) {
    const hashString = `${reqTime}${this.merchantId}${tranId}${status}`;
    const hmac = crypto.createHmac('sha512', this.apiKey);
    hmac.update(hashString);
    const expectedHash = hmac.digest('base64');
    return expectedHash === receivedHash;
  }

  /**
   * Create ABA PayWay checkout session
   */
  async createPayment({ transactionId, amount, currency = 'USD', donorName = 'Donor', returnUrl = '', continueSuccessUrl = '', streamer = null }) {
    const reqTime = Math.floor(Date.now() / 1000).toString();
    const formattedAmount = Number(amount).toFixed(2);
    const items = Buffer.from(JSON.stringify([{ name: 'Streamer Donation', quantity: '1', price: formattedAmount }])).toString('base64');

    const merchantId = streamer?.aba_merchant_id || this.merchantId;
    const apiKey = streamer?.aba_api_key || this.apiKey;

    const hash = this.generateHash(
      reqTime,
      transactionId,
      formattedAmount,
      items,
      '0.00',
      donorName.slice(0, 20),
      'Donor',
      'donor@zoeedonation.com',
      '012345678',
      'purchase',
      'cards,abapay_khqr'
    );

    const customPaywayLink = streamer?.aba_payway_link || null;
    const paymentUrl = customPaywayLink || `${this.apiUrl.replace(/\/$/, '')}/purchase`;
    const checkoutUrl = customPaywayLink || `${this.apiUrl.replace(/\/$/, '')}/purchase`;
    const sandboxSimulateUrl = `${config.frontendUrl}/checkout/aba-simulate?tran_id=${transactionId}&amount=${formattedAmount}&currency=${currency}`;
    const qrData = customPaywayLink || `https://payway.ababank.com/checkout?tran_id=${transactionId}&hash=${encodeURIComponent(hash)}`;

    return {
      provider: 'ABA_PAYWAY',
      transactionId,
      merchantId,
      reqTime,
      amount: formattedAmount,
      currency,
      hash,
      paymentUrl,
      checkoutUrl,
      sandboxSimulateUrl,
      qrData,
      aba_payway_link: customPaywayLink,
      aba_account_name: streamer?.aba_account_name || null,
      aba_account_number: streamer?.aba_account_number || null,
      aba_instructions: streamer?.aba_instructions || null,
      aba_enabled: streamer?.aba_enabled !== false
    };
  }

  /**
   * Query transaction status from ABA PayWay API
   */
  async checkTransactionStatus(transactionId) {
    const reqTime = Math.floor(Date.now() / 1000).toString();
    const hashString = `${reqTime}${this.merchantId}${transactionId}`;
    const hmac = crypto.createHmac('sha512', this.apiKey);
    hmac.update(hashString);
    const hash = hmac.digest('base64');

    try {
      if (this.environment === 'production') {
        const response = await axios.post(`${this.apiUrl.replace(/\/$/, '')}/check-transaction`, {
          req_time: reqTime,
          merchant_id: this.merchantId,
          tran_id: transactionId,
          hash
        }, { timeout: 10000 });

        const status = response.data && response.data.status === 0 ? 'PAID' : 'PENDING';
        return { success: true, status, raw: response.data };
      }

      // In sandbox/dev mode without live ABA network access
      return { success: true, status: 'PENDING', isSandbox: true };
    } catch (err) {
      console.error('ABA Check Transaction Error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new AbaPaywayService();
