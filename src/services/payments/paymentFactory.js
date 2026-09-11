const abaPayway = require('./abaPayway');
const bakong = require('./bakong');
const cutluy = require('./cutluy');
const manualKhqr = require('./manualKhqr');
const wing = require('./wing');
const truemoney = require('./truemoney');

class PaymentFactory {
  getProvider(method) {
    switch (method.toUpperCase()) {
      case 'CUTLUY':
      case 'CUTLUY_KHQR':
        return cutluy;
      case 'ABA_PAYWAY':
      case 'ABA':
        return abaPayway;
      case 'BAKONG_KHQR':
      case 'BAKONG':
      case 'KHQR':
        return bakong;
      case 'MANUAL_KHQR':
        return manualKhqr;
      case 'WING':
        return wing;
      case 'TRUEMONEY':
        return truemoney;
      default:
        // Default to CutLuy for standard KHQR or fallback
        return cutluy || bakong;
    }
  }

  getAllSupportedMethods() {
    return [
      { id: 'CUTLUY', name: 'ABA KHQR (Auto Instant)', badge: 'Instant Auto', icon: 'aba' },
      { id: 'ABA_PAYWAY', name: 'ABA PayWay (Cards / ABA Mobile)', badge: 'Instant', icon: 'aba' },
      { id: 'BAKONG_KHQR', name: 'ABA KHQR (Universal)', badge: 'Universal', icon: 'aba' },
      { id: 'WING', name: 'Wing Bank', badge: 'QR Pay', icon: 'wing' },
      { id: 'TRUEMONEY', name: 'TrueMoney Wallet', badge: 'Wallet', icon: 'truemoney' }
    ];
  }
}

module.exports = new PaymentFactory();
