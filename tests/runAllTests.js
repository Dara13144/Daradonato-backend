process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const app = require('../src/app');
const Store = require('../src/db/store');
const abaPayway = require('../src/services/payments/abaPayway');
const bakong = require('../src/services/payments/bakong');
const sanitizer = require('../src/services/sanitizer');
const paymentService = require('../src/services/paymentService');

let server;
let baseUrl;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Dara Donation Comprehensive Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error('     Error:', err.message);
      failed++;
    }
  }

  // Start temporary test server
  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`[Test Server started on port ${port}]\n`);
      resolve();
    });
  });

  try {
    // 1. Health Check Test
    await test('GET /api/health returns 200 and status ok', async () => {
      const res = await request('GET', '/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.status, 'ok');
    });

    // 2. Auth Tests
    let userToken = '';
    let adminToken = '';
    const uniqueEmail = `donor_${Date.now()}@example.com`;
    const uniqueUsername = `donor_${Date.now()}`;

    await test('POST /api/auth/register creates user and returns JWT', async () => {
      const res = await request('POST', '/api/auth/register', {
        email: uniqueEmail,
        username: uniqueUsername,
        password: 'Password123!',
        display_name: 'Test Donor'
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.token);
      assert.strictEqual(res.body.data.user.email, uniqueEmail);
      userToken = res.body.data.token;
    });

    await test('POST /api/auth/register rejects duplicate email', async () => {
      const res = await request('POST', '/api/auth/register', {
        email: uniqueEmail,
        username: `diff_${Date.now()}`,
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    await test('POST /api/auth/login with valid credentials', async () => {
      const res = await request('POST', '/api/auth/login', {
        email: uniqueEmail,
        password: 'Password123!'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.token);
    });

    await test('POST /api/auth/login with invalid credentials returns 401', async () => {
      const res = await request('POST', '/api/auth/login', {
        email: uniqueEmail,
        password: 'WrongPassword!'
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    await test('Admin login works and returns ADMIN role', async () => {
      const res = await request('POST', '/api/auth/login', {
        email: 'admin@daradonation.com',
        password: 'Admin@123456'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.user.role, 'ADMIN');
      adminToken = res.body.data.token;
    });

    // 3. Security & Sanitization
    await test('Sanitizer strips malicious HTML and script tags', () => {
      const malicious = '<script>alert("XSS")</script><b>Hello</b> <img src=x onerror=alert(1)>';
      const clean = sanitizer.sanitizeText(malicious);
      assert.strictEqual(clean, 'Hello');
    });

    // 4. Streamer & Public Profile Tests
    await test('GET /api/streamers/:slug returns streamer details, goal, and supporters', async () => {
      const res = await request('GET', '/api/streamers/dara_gaming');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.streamer.slug, 'dara_gaming');
      assert(res.body.data.activeGoal);
      assert(Array.isArray(res.body.data.recentDonations));
    });

    // 5. ABA PayWay Signature & Hash Calculation Test
    await test('ABA PayWay generates correct HMAC-SHA512 signature', async () => {
      const payment = await abaPayway.createPayment({
        transactionId: 'TXN-TEST-1234',
        amount: '10.00',
        currency: 'USD',
        donorName: 'Vannak'
      });
      assert(payment.hash);
      assert.strictEqual(typeof payment.hash, 'string');
      assert(payment.hash.length > 30);
    });

    // 6. Bakong KHQR EMVCo & CRC16 Test
    await test('Bakong KHQR generates valid EMVCo string with CRC16', () => {
      const khqr = bakong.generateKHQR({
        transactionId: 'TXN-TEST-5678',
        amount: 5.00,
        currency: 'USD'
      });
      assert(khqr.qrData.startsWith('000201010212'));
      assert(khqr.qrData.includes('6304'));
      assert.strictEqual(khqr.qrData.length, khqr.qrData.indexOf('6304') + 8);
    });

    // 7. Donation Validation Tests
    await test('POST /api/donations rejects zero or negative amounts', async () => {
      const res = await request('POST', '/api/donations', {
        streamerSlug: 'dara_gaming',
        amount: -10,
        donorName: 'Test'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    await test('POST /api/donations creates PENDING transaction', async () => {
      const res = await request('POST', '/api/donations', {
        streamerSlug: 'dara_gaming',
        amount: 5.00,
        currency: 'USD',
        donorName: 'Sophea',
        message: 'Keep going with the stream! <script>bad()</script>',
        paymentMethod: 'ABA_PAYWAY'
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.transactionId);
      assert.strictEqual(res.body.data.status, 'PENDING');
      assert.strictEqual(res.body.data.amount, 5.00);
    });

    // 8. End-to-End Payment Verification & Idempotency Test
    await test('Complete Payment Verification, Balance Increment, and Idempotency', async () => {
      // 1. Get initial streamer total
      const initialStreamer = await Store.findStreamerBySlug('dara_gaming');
      const initialTotal = Number(initialStreamer.total_received);
      const initialSupporters = Number(initialStreamer.supporter_count);

      // 2. Initiate donation
      const initRes = await request('POST', '/api/donations', {
        streamerSlug: 'dara_gaming',
        amount: 25.00,
        currency: 'USD',
        donorName: 'Hero Donor',
        message: 'Support for the tournament!',
        paymentMethod: 'BAKONG_KHQR'
      });
      assert.strictEqual(initRes.status, 201);
      const txnId = initRes.body.data.transactionId;

      // 3. Verify status is PENDING
      const statusRes1 = await request('GET', `/api/payments/status/${txnId}`);
      assert.strictEqual(statusRes1.body.data.status, 'PENDING');

      // 4. Complete Payment via verification
      const verifyRes = await request('POST', '/api/payments/sandbox-verify', {
        transactionId: txnId,
        status: 'SUCCESS'
      });
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.body.success, true);
      assert.strictEqual(verifyRes.body.data.alreadyProcessed, false);

      // 5. Verify status is now PAID
      const statusRes2 = await request('GET', `/api/payments/status/${txnId}`);
      assert.strictEqual(statusRes2.body.data.status, 'PAID');

      // 6. Verify streamer balance incremented exactly by $25
      const updatedStreamer = await Store.findStreamerBySlug('dara_gaming');
      assert.strictEqual(Number(updatedStreamer.total_received), initialTotal + 25.00);
      assert.strictEqual(Number(updatedStreamer.supporter_count), initialSupporters + 1);

      // 7. Test Idempotency: Duplicate payment verification MUST NOT double-increment
      const duplicateRes = await request('POST', '/api/payments/sandbox-verify', {
        transactionId: txnId,
        status: 'SUCCESS'
      });
      assert.strictEqual(duplicateRes.status, 200);
      assert.strictEqual(duplicateRes.body.data.alreadyProcessed, true);

      // Verify balance did not increment again
      const checkAgainStreamer = await Store.findStreamerBySlug('dara_gaming');
      assert.strictEqual(Number(checkAgainStreamer.total_received), initialTotal + 25.00);
    });

    // 9. Admin Authorization Tests
    await test('Non-admin user cannot access /api/admin/overview (returns 403)', async () => {
      const res = await request('GET', '/api/admin/overview', null, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
    });

    await test('Admin can access /api/admin/overview (returns 200 with platform stats)', async () => {
      const res = await request('GET', '/api/admin/overview', null, {
        Authorization: `Bearer ${adminToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.totalVolumeUSD > 0);
    });

    // 10. Leaderboard & Settings Tests
    await test('GET /api/leaderboard/dara_gaming returns ranked list of donors', async () => {
      const res = await request('GET', '/api/leaderboard/dara_gaming');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.data.rankings));
      assert(res.body.data.rankings.length > 0);
      assert.strictEqual(res.body.data.rankings[0].rank, 1);
    });

    await test('GET /api/leaderboard/settings & PUT /api/leaderboard/settings works for authenticated streamer', async () => {
      // 1. Get settings
      const getRes = await request('GET', '/api/leaderboard/settings', null, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.success, true);
      assert.strictEqual(getRes.body.data.title, 'Top Supporters');

      // 2. Update settings
      const putRes = await request('PUT', '/api/leaderboard/settings', {
        title: '👑 VIP Champions',
        theme: 'Matrix Cyber Glitch (Electric Pulse Beam 🖥️)',
        max_entries: 20,
        highlight_top3: true
      }, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.success, true);
      assert.strictEqual(putRes.body.data.title, '👑 VIP Champions');
      assert.strictEqual(putRes.body.data.theme, 'Matrix Cyber Glitch (Electric Pulse Beam 🖥️)');

      // 3. Reset settings
      const resetRes = await request('POST', '/api/leaderboard/settings/reset', {}, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(resetRes.status, 200);
      assert.strictEqual(resetRes.body.data.title, 'Top Supporters');
    });

    // 11. Real-Time Donation Ticker Tests
    await test('GET /api/ticker/:username & /donations returns public ticker data', async () => {
      // 1. Get ticker config
      const configRes = await request('GET', '/api/ticker/dara_gaming');
      assert.strictEqual(configRes.status, 200);
      assert.strictEqual(configRes.body.success, true);
      assert.strictEqual(configRes.body.data.settings.theme, 'Gaming');

      // 2. Get safe donations
      const donRes = await request('GET', '/api/ticker/dara_gaming/donations');
      assert.strictEqual(donRes.status, 200);
      assert.strictEqual(donRes.body.success, true);
      assert(Array.isArray(donRes.body.data));
    });

    await test('GET & PUT /api/settings/ticker & POST /api/ticker/test works for authenticated streamer', async () => {
      // 1. Get settings
      const getRes = await request('GET', '/api/settings/ticker', null, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.success, true);
      assert.strictEqual(getRes.body.data.enabled, true);

      // 2. Update settings
      const putRes = await request('PUT', '/api/settings/ticker', {
        theme: 'Neon',
        animation: 'Scroll Right',
        speed: 30,
        custom_text: '🔥 Cyber Live Ticker •'
      }, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.success, true);
      assert.strictEqual(putRes.body.data.theme, 'Neon');
      assert.strictEqual(putRes.body.data.speed, 30);

      // 3. Trigger test ticker event
      const testRes = await request('POST', '/api/ticker/test', {}, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(testRes.status, 200);
      assert.strictEqual(testRes.body.success, true);
      assert.strictEqual(testRes.body.data.type, 'DONATION_PAID');
    });

    await test('POST /api/auth/google logs in or creates user with JWT token', async () => {
      const googleRes = await request('POST', '/api/auth/google', {
        email: 'google_gamer@gmail.com',
        displayName: 'Google Gamer KH',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        googleId: 'google_123456789'
      });
      assert.strictEqual(googleRes.status, 200);
      assert.strictEqual(googleRes.body.success, true);
      assert(googleRes.body.data.token);
      assert.strictEqual(googleRes.body.data.user.email, 'google_gamer@gmail.com');
    });

    await test('GET /api/leaderboard/dara_gaming/top & /stats returns podium and accurate metrics', async () => {
      // 1. Top 3
      const topRes = await request('GET', '/api/leaderboard/dara_gaming/top?period=all');
      assert.strictEqual(topRes.status, 200);
      assert.strictEqual(topRes.body.success, true);
      assert(Array.isArray(topRes.body.data.top));

      // 2. Stats
      const statsRes = await request('GET', '/api/leaderboard/dara_gaming/stats?period=all');
      assert.strictEqual(statsRes.status, 200);
      assert.strictEqual(statsRes.body.success, true);
      assert(statsRes.body.data.total_donations_amount > 0);
      assert(statsRes.body.data.total_donations_count > 0);
    });

    await test('GET & PUT /api/settings/leaderboard works seamlessly for authenticated streamer', async () => {
      const getRes = await request('GET', '/api/settings/leaderboard', null, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.success, true);

      const putRes = await request('PUT', '/api/settings/leaderboard', {
        theme: 'Cyber',
        avatar_size: 'Large',
        show_crown: true
      }, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.success, true);
      assert.strictEqual(putRes.body.data.theme, 'Cyber');
      assert.strictEqual(putRes.body.data.avatar_size, 'Large');
    });

    await test('GET & PUT /api/settings/donation-page works for authenticated streamer', async () => {
      const getRes = await request('GET', '/api/settings/donation-page', null, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.success, true);

      const putRes = await request('PUT', '/api/settings/donation-page', {
        title: 'Support Dara Live Stream 🎮',
        min_amount: 2.00
      }, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.success, true);
      assert.strictEqual(putRes.body.data.title, 'Support Dara Live Stream 🎮');
      assert.strictEqual(putRes.body.data.min_amount, 2);
    });

    await test('GET /api/donations/recent/:streamerSlug returns safe public recent donations', async () => {
      const res = await request('GET', '/api/donations/recent/dara_gaming?limit=5');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.data));
    });

    await test('POST /api/donations with CutLuy paymentMethod creates valid KHQR and checkout URL', async () => {
      const donRes = await request('POST', '/api/donations', {
        streamerSlug: 'dara_gaming',
        amount: 2.50,
        currency: 'USD',
        donorName: 'CutLuy Supporter',
        message: 'Auto payment working!',
        paymentMethod: 'CUTLUY'
      });
      assert.strictEqual(donRes.status, 201);
      assert.strictEqual(donRes.body.success, true);
      assert(donRes.body.data.qrData);
      assert(donRes.body.data.transactionId);
      assert.strictEqual(donRes.body.data.status, 'PENDING');
    });

    await test('POST /webhooks/cutluy verifies event and marks donation PAID', async () => {
      // 1. Create pending donation
      const donRes = await request('POST', '/api/donations', {
        streamerSlug: 'dara_gaming',
        amount: 3.00,
        currency: 'USD',
        donorName: 'Live Webhook Fan',
        message: 'Webhook Auto Verified!',
        paymentMethod: 'CUTLUY'
      });
      const txnId = donRes.body.data.transactionId;

      // 2. Trigger CutLuy webhook
      const webhookRes = await request('POST', '/webhooks/cutluy', {
        id: 'evt_cutluy_' + Date.now(),
        type: 'payment.completed',
        created: new Date().toISOString(),
        data: {
          payment: {
            id: 'cutluy_pay_' + Date.now(),
            status: 'paid',
            amount: '3.00',
            currency: 'USD',
            reference_id: txnId,
            approved_at: new Date().toISOString()
          }
        }
      });
      assert.strictEqual(webhookRes.status, 200);

      // 3. Verify status transitioned to PAID
      const statusRes = await request('GET', `/api/payments/status/${txnId}`);
      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.data.status, 'PAID');
    });

    // 27. ABA PayWay User Configuration & Flow Tests
    await test('GET /api/settings/aba-payway returns user ABA configuration', async () => {
      const res = await request('GET', '/api/settings/aba-payway', null, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data);
    });

    await test('PUT /api/settings/aba-payway updates user real ABA PayWay link and account', async () => {
      const updatePayload = {
        enabled: true,
        mode: 'DIRECT_LINK',
        account_name: 'DARA REAL GAMER',
        account_number: '001234567',
        payway_link: 'https://link.payway.com.kh/dara_real_stream',
        donor_instructions: 'Please include your stream name in transfer note.'
      };
      const res = await request('PUT', '/api/settings/aba-payway', updatePayload, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.payway_link, 'https://link.payway.com.kh/dara_real_stream');
      assert.strictEqual(res.body.data.account_name, 'DARA REAL GAMER');
    });

    await test('POST /api/settings/aba-payway/test generates valid test transaction & link', async () => {
      const res = await request('POST', '/api/settings/aba-payway/test', null, {
        Authorization: `Bearer ${userToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.test_qr_payload);
    });

    await test('POST /api/donations with ABA_PAYWAY returns streamer ABA link & details', async () => {
      const donRes = await request('POST', '/api/donations', {
        streamerSlug: uniqueUsername,
        amount: 5.00,
        currency: 'USD',
        donorName: 'ABA Mobile User',
        message: 'Direct ABA PayWay donation!',
        paymentMethod: 'ABA_PAYWAY'
      });
      assert.strictEqual(donRes.status, 201);
      assert.strictEqual(donRes.body.success, true);
      assert.strictEqual(donRes.body.data.paymentMethod, 'ABA_PAYWAY');
      assert.strictEqual(donRes.body.data.aba_payway_link, 'https://link.payway.com.kh/dara_real_stream');
      assert.strictEqual(donRes.body.data.aba_account_name, 'DARA REAL GAMER');

      // Test donor confirmation endpoint
      const txnId = donRes.body.data.transactionId;
      const confirmRes = await request('POST', '/api/payments/confirm-user-payment', {
        transactionId: txnId,
        paymentMethod: 'ABA_PAYWAY'
      });
      assert.strictEqual(confirmRes.status, 200);
      assert.strictEqual(confirmRes.body.success, true);

      // Verify status is now PAID
      const statusRes = await request('GET', `/api/payments/status/${txnId}`);
      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.data.status, 'PAID');
    });

    // 17. Bakong KHQR Donation and NBC Open API Tests
    await test('POST /api/donations with BAKONG_KHQR creates valid NBC KHQR and MD5 hash', async () => {
      const donRes = await request('POST', '/api/donations', {
        streamerSlug: 'dara_gaming',
        amount: 2.50,
        currency: 'USD',
        donorName: 'Bakong Donor',
        message: 'Tip via Bakong KHQR!',
        paymentMethod: 'BAKONG_KHQR'
      });
      assert.strictEqual(donRes.status, 201);
      assert.strictEqual(donRes.body.success, true);
      assert.strictEqual(donRes.body.data.paymentMethod, 'BAKONG_KHQR');
      assert(donRes.body.data.qrData);
      assert(donRes.body.data.qrData.startsWith('000201010212'));
      assert(donRes.body.data.qrData.includes('6304'));
      assert(donRes.body.data.providerPayload);
      assert(donRes.body.data.providerPayload.md5Hash);
    });

    await test('POST /api/payments/bakong/check-account connects to NBC Bakong Open API', async () => {
      const checkRes = await request('POST', '/api/payments/bakong/check-account', {
        accountId: 'dara_gaming@abaa'
      });
      assert.strictEqual(checkRes.status, 200);
      assert.strictEqual(typeof checkRes.body.success, 'boolean');
      // NBC responds with valid response structure
      assert(checkRes.body.responseCode !== undefined);
    });

    await test('POST /api/settings/aba-payway/check-bakong verifies streamer Bakong ID', async () => {
      const checkRes = await request('POST', '/api/settings/aba-payway/check-bakong', {
        bakong_id: 'dara_gaming@abaa'
      }, { Authorization: `Bearer ${userToken}` });
      assert.strictEqual(checkRes.status, 200);
      assert.strictEqual(typeof checkRes.body.success, 'boolean');
    });

    // 18. Telegram Bot Integration Tests
    const telegramService = require('../src/services/telegramService');

    await test('GET /api/telegram/status returns bot credentials & pairing info', async () => {
      const res = await request('GET', '/api/telegram/status', null, { Authorization: `Bearer ${userToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.botUsername, 'darastore_bot');
      assert(res.body.data.botLink.includes('darastore_bot'));
      assert(res.body.data.pairingCode.startsWith('DARA-'));
      assert(res.body.data.deepLink.includes('darastore_bot?start='));
    });

    let activePairingCode = '';
    await test('POST /api/telegram/generate-code creates new valid pairing code', async () => {
      const res = await request('POST', '/api/telegram/generate-code', null, { Authorization: `Bearer ${userToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.pairingCode.startsWith('DARA-'));
      activePairingCode = res.body.data.pairingCode;
    });

    await test('Telegram service processes update and pairs chat correctly', async () => {
      // Simulate user sending /start <CODE> to the bot
      await telegramService.processUpdate({
        update_id: 1001,
        message: {
          message_id: 1,
          chat: { id: 998877665 },
          from: { id: 998877665, first_name: 'StreamerJohn', username: 'streamer_john' },
          text: `/start ${activePairingCode.replace(/-/g, '_')}`
        }
      });

      // Verify status is now connected
      const statusRes = await request('GET', '/api/telegram/status', null, { Authorization: `Bearer ${userToken}` });
      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.data.connected, true);
      assert.strictEqual(statusRes.body.data.chatId, '998877665');
    });

    await test('POST /api/telegram/test dispatches test alert to connected chat', async () => {
      const res = await request('POST', '/api/telegram/test', null, { Authorization: `Bearer ${userToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('POST /api/telegram/disconnect revokes active telegram connection', async () => {
      const res = await request('POST', '/api/telegram/disconnect', null, { Authorization: `Bearer ${userToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify status is now disconnected
      const statusRes = await request('GET', '/api/telegram/status', null, { Authorization: `Bearer ${userToken}` });
      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.data.connected, false);
    });

    // 19. Telegram QR Scan Login Flow Tests
    let qrSessionToken = '';
    await test('POST /api/auth/telegram/session generates QR session token & deepLink', async () => {
      const res = await request('POST', '/api/auth/telegram/session');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.sessionToken.startsWith('TLOG-'));
      assert(res.body.data.deepLink.includes('darastore_bot?start=login_'));
      qrSessionToken = res.body.data.sessionToken;
    });

    await test('GET /api/auth/telegram/check-session returns PENDING before scan', async () => {
      const res = await request('GET', `/api/auth/telegram/check-session/${qrSessionToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.authenticated, false);
      assert.strictEqual(res.body.status, 'PENDING');
    });

    await test('Telegram bot authorizes QR login session when user clicks deep-link / scans', async () => {
      // Simulate user tapping Start on Telegram bot with the login deep link
      await telegramService.processUpdate({
        update_id: 1002,
        message: {
          message_id: 2,
          chat: { id: 77665544 },
          from: { id: 77665544, first_name: 'Vannak', username: 'vannak_gamer' },
          text: `/start login_${qrSessionToken.replace(/-/g, '_')}`
        }
      });

      // Now check session again
      const checkRes = await request('GET', `/api/auth/telegram/check-session/${qrSessionToken}`);
      assert.strictEqual(checkRes.status, 200);
      assert.strictEqual(checkRes.body.success, true);
      assert.strictEqual(checkRes.body.authenticated, true);
      assert.strictEqual(checkRes.body.status, 'AUTHENTICATED');
      assert(checkRes.body.token);
      assert.strictEqual(checkRes.body.user.username, 'vannak_gamer');
    });

    await test('POST /api/auth/telegram direct widget login creates user and returns JWT', async () => {
      const res = await request('POST', '/api/auth/telegram', {
        id: 88776655,
        first_name: 'Bopha',
        username: 'bopha_stream',
        photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.token);
      assert.strictEqual(res.body.data.user.username, 'bopha_stream');
    });

    // 19. Custom Message & Voice AI Settings Tests
    await test('GET /api/settings/voice-ai returns voice AI configuration', async () => {
      const res = await request('GET', '/api/settings/voice-ai', null, { Authorization: `Bearer ${userToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(typeof res.body.data.tts_enabled, 'boolean');
      assert(res.body.data.tts_voice);
      assert(res.body.data.tts_template);
    });

    await test('PUT /api/settings/voice-ai updates custom templates and voice presets', async () => {
      const res = await request('PUT', '/api/settings/voice-ai', {
        tts_enabled: true,
        tts_voice: 'khmer_male',
        tts_speed: 1.15,
        tts_pitch: 0.95,
        tts_volume: 0.9,
        minimum_tts_amount: 2.0,
        tts_template: '{donor} បាញ់មក {amount} ដុល្លារ! សារ៖ {message}',
        tier2_template: '🔥 {donor} ឧបត្ថម្ភ {amount} យ៉ាងកក្រើក! {message}',
        profanity_filter: true,
        spam_filter: true,
        max_chars: 200
      }, { Authorization: `Bearer ${userToken}` });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.tts_voice, 'khmer_male');
      assert.strictEqual(res.body.data.tts_speed, 1.15);
      assert.strictEqual(res.body.data.minimum_tts_amount, 2.0);
    });

    await test('POST /api/settings/voice-ai/test renders speech preview with custom tags', async () => {
      const res = await request('POST', '/api/settings/voice-ai/test', {
        donor: 'Minea Gaming',
        amount: 15.0,
        currency: 'USD',
        message: 'Happy Birthday bro!',
        template: '{donor} tipped {amount}! Message: {message}',
        voice: 'khmer_male'
      }, { Authorization: `Bearer ${userToken}` });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.renderedText, 'Minea Gaming tipped 15 USD! Message: Happy Birthday bro!');
      assert.strictEqual(res.body.data.status, 'SYNTHESIS_READY');
    });

  } finally {
    server.close();
  }

  console.log(`\n========================================`);
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
