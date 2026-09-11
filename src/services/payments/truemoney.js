class TrueMoneyService {
  generatePayment({ transactionId, amount, currency = 'USD' }) {
    const formattedAmount = Number(amount).toFixed(2);
    return {
      provider: 'TRUEMONEY',
      transactionId,
      amount: formattedAmount,
      currency,
      qrData: `truemoney://transfer?account=012999888&ref=${transactionId}&amt=${formattedAmount}`,
      instructions: 'Open TrueMoney Wallet to complete donation transfer.'
    };
  }
}

module.exports = new TrueMoneyService();
