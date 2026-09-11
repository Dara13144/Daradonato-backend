const crypto = require('crypto');

class ManualKhqrService {
  generatePayment({ transactionId, amount, currency = 'USD' }) {
    const formattedAmount = Number(amount).toFixed(2);
    // Generic KHQR standard payload for scanning with any banking app in Cambodia
    const dummyKhqr = `00020101021229370016bakong@khqr0113zoee@abaa520459995303${currency === 'KHR' ? '116' : '840'}5404${formattedAmount}5802KH5912ZoeeDonation6010Phnom Penh62190115${transactionId.slice(0, 15)}6304`;
    return {
      provider: 'MANUAL_KHQR',
      transactionId,
      amount: formattedAmount,
      currency,
      qrData: dummyKhqr,
      instructions: 'Scan this KHQR with any Cambodian Mobile Banking App (ABA, ACLEDA, Canadia, Wing, etc.)'
    };
  }
}

module.exports = new ManualKhqrService();
