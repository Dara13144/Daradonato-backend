const assert = require('assert');

async function runE2E() {
  console.log('🚀 Running Real ABA PayWay End-to-End Verification Test...\n');
  const baseUrl = 'http://localhost:5005';

  // 1. Log in as streamer
  console.log('1. Logging in as streamer dara@stream.com...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dara@stream.com', password: 'Streamer@123456' })
  }).then(r => r.json());

  assert.strictEqual(loginRes.success, true, 'Login failed');
  const token = loginRes.data.token;
  console.log('   ✅ Logged in successfully. Token acquired.\n');

  // 2. Configure Real ABA PayWay Setup
  console.log('2. Setting up Real ABA PayWay link and account credentials...');
  const setupPayload = {
    enabled: true,
    mode: 'DIRECT_LINK',
    account_name: 'DARA GAMING KH',
    account_number: '001988776',
    payway_link: 'https://link.payway.com.kh/dara_gaming',
    donor_instructions: 'Thank you for supporting Dara Gaming via ABA Mobile!'
  };

  const setupRes = await fetch(`${baseUrl}/api/settings/aba-payway`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(setupPayload)
  }).then(r => r.json());

  assert.strictEqual(setupRes.success, true, 'Saving ABA setup failed');
  assert.strictEqual(setupRes.data.payway_link, 'https://link.payway.com.kh/dara_gaming');
  assert.strictEqual(setupRes.data.account_name, 'DARA GAMING KH');
  console.log('   ✅ ABA PayWay settings saved successfully.\n');

  // 3. Verify public streamer endpoint returns ABA PayWay info
  console.log('3. Checking public creator profile at /api/streamers/dara_gaming...');
  const profileRes = await fetch(`${baseUrl}/api/streamers/dara_gaming`).then(r => r.json());
  assert.strictEqual(profileRes.success, true);
  assert.strictEqual(profileRes.data.streamer.aba_payway_link, 'https://link.payway.com.kh/dara_gaming');
  assert.strictEqual(profileRes.data.streamer.aba_account_name, 'DARA GAMING KH');
  console.log('   ✅ Public profile correctly exposes configured ABA link.\n');

  // 4. Create public donation with ABA_PAYWAY
  console.log('4. Initiating donation with paymentMethod = ABA_PAYWAY...');
  const donRes = await fetch(`${baseUrl}/api/donations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      streamerSlug: 'dara_gaming',
      amount: 10.00,
      currency: 'USD',
      donorName: 'Real ABA Donor',
      message: 'Here is 10 USD via ABA Mobile! Keep it up!',
      paymentMethod: 'ABA_PAYWAY'
    })
  }).then(r => r.json());

  assert.strictEqual(donRes.success, true, 'Donation creation failed');
  assert.strictEqual(donRes.data.paymentMethod, 'ABA_PAYWAY');
  assert.strictEqual(donRes.data.status, 'PENDING');
  assert.strictEqual(donRes.data.aba_payway_link, 'https://link.payway.com.kh/dara_gaming');
  assert.strictEqual(donRes.data.aba_account_name, 'DARA GAMING KH');
  const txnId = donRes.data.transactionId;
  console.log(`   ✅ Donation initiated with txn: ${txnId}`);
  console.log(`   ✅ Direct ABA Checkout URL: ${donRes.data.aba_payway_link}\n`);

  // 5. Donor confirms payment in ABA Mobile
  console.log('5. Simulating donor clicking "I have completed payment in ABA Mobile"...');
  const confirmRes = await fetch(`${baseUrl}/api/payments/confirm-user-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionId: txnId,
      paymentMethod: 'ABA_PAYWAY'
    })
  }).then(r => r.json());

  assert.strictEqual(confirmRes.success, true, 'Payment confirmation failed');
  console.log('   ✅ Payment confirmed by backend!\n');

  // 6. Verify final status is PAID
  console.log('6. Verifying transaction status is PAID...');
  const statusRes = await fetch(`${baseUrl}/api/payments/status/${txnId}`).then(r => r.json());
  assert.strictEqual(statusRes.success, true);
  assert.strictEqual(statusRes.data.status, 'PAID');
  console.log(`   ✅ Final Status: ${statusRes.data.status}`);
  console.log(`   ✅ Donor Name: ${statusRes.data.donorName}`);
  console.log(`   ✅ Amount: $${statusRes.data.amount} ${statusRes.data.currency}\n`);

  console.log('🎉 ALL ABA PAYWAY CHECKS PASSED PERFECTLY!');
}

runE2E().catch(err => {
  console.error('❌ Error during E2E test:', err);
  process.exit(1);
});
