const crypto = require('crypto');
const axios = require('axios');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');
const config = require('../../config');

/**
 * Bakong / KHQR Payment Service
 * Powered by official NBC KHQR SDK & Bakong Open API v1
 */
class BakongService {
  constructor() {
    this.apiUrl = config.bakong.apiUrl || 'https://api-bakong.nbc.gov.kh/v1';
    this.token = config.bakong.token || '';
    this.merchantId = config.bakong.merchantId || 'zoee_donation@abaa';
    this.merchantName = config.bakong.merchantName || 'Zoee Donation';
    this.khqr = new BakongKHQR();
  }

  /**
   * Calculate CRC16-CCITT for EMVCo QR validation fallback
   */
  calculateCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
      x ^= x >> 4;
      crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Format EMVCo TLV (Tag-Length-Value) fallback
   */
  formatTag(tag, value) {
    if (value === undefined || value === null) return '';
    const strVal = String(value);
    const len = strVal.length.toString().padStart(2, '0');
    return `${tag}${len}${strVal}`;
  }

  /**
   * Generate valid KHQR EMVCo string for transaction
   */
  generateKHQR({ transactionId, amount, currency = 'USD', streamerSlug = 'dara', streamer = null }) {
    const isKHR = String(currency).toUpperCase() === 'KHR';
    const currencyConstant = isKHR ? khqrData.currency.khr : khqrData.currency.usd;
    const currencyCode = isKHR ? '116' : '840';
    const numAmount = Number(amount);
    const formattedAmount = numAmount.toFixed(2);

    // Streamer custom Bakong ID (e.g. rosv2@abaa or yourname@bank) or platform default
    const merchantId = (streamer?.bakong_id || streamer?.social_links?.bakong?.account_id || this.merchantId || 'zoee_donation@abaa').trim();
    const merchantName = (streamer?.bakong_name || streamer?.user?.display_name || streamer?.display_name || this.merchantName || 'Zoee Donation').trim().slice(0, 25);
    const billNumber = (transactionId || `TXN${Date.now()}`).slice(0, 25);

    let fullKHQR = '';
    let md5Hash = '';

    // 1. Primary: Use official NBC BakongKHQR SDK
    try {
      const expirationTimestamp = Date.now() + 15 * 60 * 1000;
      const individualInfo = new IndividualInfo(
        merchantId,
        merchantName,
        'Phnom Penh',
        {
          currency: currencyConstant,
          amount: numAmount,
          billNumber,
          storeLabel: 'Zoee Donation',
          terminalLabel: 'Web',
          expirationTimestamp
        }
      );

      const sdkResult = this.khqr.generateIndividual(individualInfo);
      if (sdkResult && sdkResult.status?.code === 0 && sdkResult.data?.qr) {
        fullKHQR = sdkResult.data.qr;
        md5Hash = sdkResult.data.md5;
      }
    } catch (err) {
      console.warn('BakongKHQR SDK generation notice:', err.message);
    }

    // 2. Fallback: Manual EMVCo TLV Generator if SDK didn't return
    if (!fullKHQR) {
      const subTag00 = this.formatTag('00', merchantId);
      const tag29 = this.formatTag('29', subTag00);

      let payload = '';
      payload += this.formatTag('00', '01'); // Payload Format Indicator
      payload += this.formatTag('01', '12'); // Dynamic QR
      payload += tag29;
      payload += this.formatTag('52', '5999'); // Merchant Category Code
      payload += this.formatTag('53', currencyCode); // Currency
      payload += this.formatTag('54', formattedAmount); // Amount
      payload += this.formatTag('58', 'KH'); // Country Code
      payload += this.formatTag('59', merchantName); // Merchant Name
      payload += this.formatTag('60', 'Phnom Penh'); // City
      payload += this.formatTag('62', this.formatTag('01', billNumber));

      const withTag63Header = `${payload}6304`;
      const crc = this.calculateCRC16(withTag63Header);
      fullKHQR = `${withTag63Header}${crc}`;
      md5Hash = crypto.createHash('md5').update(fullKHQR).digest('hex');
    }

    const deepLink = `bakong://khqr?qr=${encodeURIComponent(fullKHQR)}`;

    return {
      provider: 'BAKONG_KHQR',
      id: md5Hash,
      hash: md5Hash,
      transactionId,
      amount: formattedAmount,
      currency: isKHR ? 'KHR' : 'USD',
      qrData: fullKHQR,
      qrString: fullKHQR,
      deepLink,
      md5Hash,
      bakong_id: merchantId,
      bakong_name: merchantName
    };
  }

  generatePayment(params) {
    return this.generateKHQR(params);
  }

  async createPayment(params) {
    return this.generateKHQR(params);
  }

  /**
   * Verify Bakong transaction status via NBC / Bakong Open API v1
   */
  async checkTransactionStatus(md5Hash) {
    if (!md5Hash) {
      return { success: false, status: 'PENDING', message: 'No MD5 hash provided' };
    }

    if (!this.token || this.token.startsWith('sandbox_')) {
      return { success: true, status: 'PENDING', isSandbox: true };
    }

    try {
      const response = await axios.post(`${this.apiUrl}/check_transaction_by_md5`, {
        md5: md5Hash
      }, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      });

      const resData = response.data;
      // responseCode: 0 means Payment SUCCESS
      const isPaid = resData && (resData.responseCode === 0 || resData.status === 'SUCCESS');
      
      // If error code 1 -> Transaction not yet found / pending
      // If error code 17 -> Daily request limit exceeded
      return {
        success: true,
        status: isPaid ? 'PAID' : 'PENDING',
        responseCode: resData?.responseCode,
        responseMessage: resData?.responseMessage,
        errorCode: resData?.errorCode,
        raw: resData
      };
    } catch (err) {
      // Graceful error handling for rate limits or network issues
      console.warn('Bakong Open API status check notice:', err.response?.data || err.message);
      return {
        success: true,
        status: 'PENDING',
        error: err.response?.data?.responseMessage || err.message
      };
    }
  }

  /**
   * Check if a Bakong Account ID exists on NBC network
   */
  async checkBakongAccount(accountId) {
    if (!accountId) {
      return { success: false, exists: false, message: 'accountId is required' };
    }

    if (!this.token) {
      return { success: true, exists: true, message: 'Skipped check (no token)' };
    }

    try {
      const response = await axios.post(`${this.apiUrl}/check_bakong_account`, {
        accountId: accountId.trim()
      }, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      });

      const resData = response.data;
      const exists = resData && resData.responseCode === 0;

      return {
        success: true,
        exists,
        responseCode: resData?.responseCode,
        responseMessage: resData?.responseMessage,
        errorCode: resData?.errorCode,
        data: resData?.data || null
      };
    } catch (err) {
      return {
        success: false,
        exists: false,
        responseCode: err.response?.data?.responseCode !== undefined ? err.response.data.responseCode : 1,
        responseMessage: err.response?.data?.responseMessage || err.message,
        errorCode: err.response?.data?.errorCode || null,
        error: err.response?.data?.responseMessage || err.message
      };
    }
  }
}

module.exports = new BakongService();
