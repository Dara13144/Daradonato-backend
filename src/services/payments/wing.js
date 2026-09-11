class WingPaymentService {
  generatePayment({ transactionId, amount, currency = 'USD' }) {
    const formattedAmount = Number(amount).toFixed(2);
    return {
      provider: 'WING',
      transactionId,
      amount: formattedAmount,
      currency,
      qrData: `wing://pay?biller_id=10928&ref=${transactionId}&amt=${formattedAmount}`,
      instructions: 'Open Wing Bank app and scan to complete donation.'
    };
  }
}

module.exports = new WingPaymentService();
