const paymentService = require('../services/paymentService');
const Store = require('../db/store');
const cutluy = require('../services/payments/cutluy');
const abaPayway = require('../services/payments/abaPayway');
const bakong = require('../services/payments/bakong');

class PaymentController {
  /**
   * GET /api/payments/status/:transactionId
   * Returns current payment status from DB (fast, cached).
   * The frontend polls this every 2.5s.
   */
  async getStatus(req, res, next) {
    try {
      const { transactionId } = req.params;
      const statusData = await paymentService.checkStatus(transactionId);
      return res.json({
        success: true,
        data: statusData
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/payments/poll/:transactionId
   * Active live poll: queries CutLuy/Bakong/ABA API directly, auto-confirms PAID if approved.
   * This is the auto-payment engine — called every 2.5s from PaymentModal.
   */
  async pollPaymentStatus(req, res, next) {
    try {
      const { transactionId } = req.params;

      // 1. Get donation from DB
      const donation = await Store.findDonationByTransactionId(transactionId);
      if (!donation) {
        return res.status(404).json({ success: false, message: 'Transaction not found.' });
      }

      // 2. If already PAID — return immediately (idempotent)
      if (donation.payment_status === 'PAID') {
        return res.json({
          success: true,
          data: {
            transactionId,
            status: 'PAID',
            amount: donation.amount,
            currency: donation.currency,
            donorName: donation.donor_name,
            paidAt: donation.paid_at
          }
        });
      }

      // 3. Get payment transaction record
      const pTxn = await Store.findPaymentTransactionByTxnId(transactionId);
      if (!pTxn) {
        return res.json({
          success: true,
          data: { transactionId, status: donation.payment_status }
        });
      }

      // 4. Check expiry
      if (pTxn.expires_at && new Date(pTxn.expires_at) < new Date()) {
        if (donation.payment_status === 'PENDING') {
          await Store.markDonationExpired(transactionId);
        }
        return res.json({
          success: true,
          data: { transactionId, status: 'EXPIRED', expiresAt: pTxn.expires_at }
        });
      }

      // 5. CutLuy live poll — find the CutLuy payment ID
      const isCutluy = ['CUTLUY', 'CUTLUY_KHQR'].includes(pTxn.provider);
      if (isCutluy && pTxn.provider_transaction_id) {
        const liveStatus = await cutluy.checkPaymentStatus(pTxn.provider_transaction_id);

        if (liveStatus) {
          const rawStatus = (liveStatus.status || '').toLowerCase();

          // ✅ AUTO-CONFIRM: Payment is approved on CutLuy → mark PAID + fire alert
          if (rawStatus === 'paid' || rawStatus === 'approved' || rawStatus === 'completed') {
            // idempotent — won't double-process
            await paymentService.verifyAndProcessPayment(
              transactionId,
              {
                provider: 'CUTLUY',
                cutluyPaymentId: liveStatus.id || pTxn.provider_transaction_id,
                amount: liveStatus.amount,
                currency: liveStatus.currency,
                approvedAt: liveStatus.approved_at,
                autoConfirmed: true
              },
              req.ip
            );

            // Re-read for fresh paidAt timestamp
            const freshDonation = await Store.findDonationByTransactionId(transactionId);
            return res.json({
              success: true,
              data: {
                transactionId,
                status: 'PAID',
                amount: freshDonation?.amount || donation.amount,
                currency: freshDonation?.currency || donation.currency,
                donorName: freshDonation?.donor_name || donation.donor_name,
                paidAt: freshDonation?.paid_at || new Date().toISOString(),
                autoConfirmed: true
              }
            });
          }

          // QR Scanned but not yet confirmed in banking app
          if (rawStatus === 'scanned') {
            return res.json({
              success: true,
              data: {
                transactionId,
                status: 'SCANNED',
                amount: donation.amount,
                currency: donation.currency,
                hint: 'QR scanned — confirm payment in your banking app'
              }
            });
          }

          // Failed or explicitly cancelled
          if (rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'expired') {
            await Store.markDonationFailed(transactionId, `CutLuy status: ${rawStatus}`);
            return res.json({
              success: true,
              data: { transactionId, status: rawStatus.toUpperCase() }
            });
          }
        }
      }

      // 5b. Bakong KHQR Open API live check
      const isBakong = ['BAKONG', 'BAKONG_KHQR', 'KHQR'].includes(pTxn.provider);
      if (isBakong) {
        const md5Hash = pTxn.provider_transaction_id || pTxn.metadata?.rawProviderResponse?.md5Hash;
        if (md5Hash) {
          try {
            const bakongStatus = await bakong.checkTransactionStatus(md5Hash);
            if (bakongStatus && bakongStatus.status === 'PAID') {
              await paymentService.verifyAndProcessPayment(
                transactionId,
                {
                  provider: 'BAKONG_KHQR',
                  autoConfirmed: true,
                  md5Hash,
                  rawResponse: bakongStatus.raw
                },
                req.ip
              );

              const freshDonation = await Store.findDonationByTransactionId(transactionId);
              return res.json({
                success: true,
                data: {
                  transactionId,
                  status: 'PAID',
                  amount: freshDonation?.amount || donation.amount,
                  currency: freshDonation?.currency || donation.currency,
                  donorName: freshDonation?.donor_name || donation.donor_name,
                  paidAt: freshDonation?.paid_at || new Date().toISOString(),
                  autoConfirmed: true
                }
              });
            }
          } catch (bakongErr) {
            console.warn('Bakong poll check notice:', bakongErr.message);
          }
        }
      }

      // 5c. ABA PayWay live status check (if using merchant credentials)
      const isAba = ['ABA_PAYWAY', 'ABA'].includes(pTxn.provider);
      if (isAba) {
        try {
          const abaStatus = await abaPayway.checkTransactionStatus(transactionId);
          if (abaStatus && abaStatus.status === 'PAID') {
            await paymentService.verifyAndProcessPayment(
              transactionId,
              {
                provider: 'ABA_PAYWAY',
                autoConfirmed: true,
                rawResponse: abaStatus.raw
              },
              req.ip
            );

            const freshDonation = await Store.findDonationByTransactionId(transactionId);
            return res.json({
              success: true,
              data: {
                transactionId,
                status: 'PAID',
                amount: freshDonation?.amount || donation.amount,
                currency: freshDonation?.currency || donation.currency,
                donorName: freshDonation?.donor_name || donation.donor_name,
                paidAt: freshDonation?.paid_at || new Date().toISOString(),
                autoConfirmed: true
              }
            });
          }
        } catch (abaErr) {
          console.warn('ABA poll check notice:', abaErr.message);
        }
      }

      // 6. Return current DB status
      return res.json({
        success: true,
        data: {
          transactionId,
          status: donation.payment_status,
          amount: donation.amount,
          currency: donation.currency,
          donorName: donation.donor_name,
          expiresAt: pTxn?.expires_at || null
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/confirm-user-payment
   * Allows donor to confirm they have completed payment (e.g. via direct ABA PayWay link or mobile app).
   * Verifies pending state, marks donation as PAID, and broadcasts real-time alert + TTS!
   */
  async confirmUserPayment(req, res, next) {
    try {
      const { transactionId, paymentMethod = 'ABA_PAYWAY', note } = req.body;

      if (!transactionId) {
        return res.status(400).json({ success: false, message: 'transactionId is required.' });
      }

      const donation = await Store.findDonationByTransactionId(transactionId);
      if (!donation) {
        return res.status(404).json({ success: false, message: 'Transaction not found.' });
      }

      if (donation.payment_status === 'PAID') {
        return res.json({
          success: true,
          message: 'Payment was already confirmed.',
          data: { transactionId, status: 'PAID', amount: donation.amount }
        });
      }

      const result = await paymentService.verifyAndProcessPayment(
        transactionId,
        {
          provider: paymentMethod || 'ABA_PAYWAY',
          confirmed_by: 'USER_CONFIRMATION',
          user_note: note || null,
          confirmed_at: new Date().toISOString()
        },
        req.ip
      );

      return res.json({
        success: true,
        message: 'Payment confirmed successfully! Stream alert has been triggered.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/sandbox-verify
   * Enables simulated payment completion for testing without real payment.
   */
  async simulateSandboxPayment(req, res, next) {
    try {
      const { transactionId, status = 'SUCCESS' } = req.body;

      if (!transactionId) {
        return res.status(400).json({ success: false, message: 'transactionId is required.' });
      }

      if (status === 'SUCCESS') {
        const result = await paymentService.verifyAndProcessPayment(
          transactionId,
          { simulated: true, gateway: 'SANDBOX_SIMULATOR', paid_via: 'TEST_CHECKOUT' },
          req.ip
        );

        return res.json({
          success: true,
          message: 'Sandbox payment verified successfully.',
          data: result
        });
      } else {
        await Store.markDonationFailed(transactionId, 'Simulated payment cancellation');
        return res.json({
          success: true,
          message: 'Sandbox payment marked as FAILED.'
        });
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/bakong/check-account
   * Check if a Bakong Account ID exists on NBC network
   */
  async checkBakongAccount(req, res, next) {
    try {
      const { accountId } = req.body;
      if (!accountId) {
        return res.status(400).json({ success: false, message: 'accountId is required' });
      }
      const result = await bakong.checkBakongAccount(accountId);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/bakong/check-md5
   * Check Bakong KHQR transaction status by MD5 hash on 5s poll cycle
   */
  async checkBakongByMd5(req, res, next) {
    try {
      const { md5, md5Hash, transactionId } = req.body;
      const targetMd5 = (md5 || md5Hash || '').trim();

      if (!targetMd5 && !transactionId) {
        return res.status(400).json({ success: false, message: 'md5 hash or transactionId is required' });
      }

      let donation = null;
      let pTxn = null;

      if (transactionId) {
        donation = await Store.findDonationByTransactionId(transactionId);
        pTxn = await Store.findPaymentTransactionByTxnId(transactionId);
      }

      const activeMd5 = targetMd5 || pTxn?.provider_transaction_id || pTxn?.metadata?.rawProviderResponse?.md5Hash;

      if (!activeMd5) {
        return res.status(400).json({ success: false, message: 'Could not resolve MD5 hash for transaction.' });
      }

      // If already marked paid in DB, return immediately
      if (donation && donation.payment_status === 'PAID') {
        return res.json({
          success: true,
          status: 'PAID',
          paid: true,
          message: 'Payment already verified.',
          data: {
            transactionId: donation.transaction_id,
            status: 'PAID',
            amount: donation.amount,
            currency: donation.currency,
            donorName: donation.donor_name,
            paidAt: donation.paid_at
          }
        });
      }

      // Query NBC Bakong Open API
      const bakongStatus = await bakong.checkTransactionStatus(activeMd5);

      if (bakongStatus && bakongStatus.status === 'PAID') {
        let processedResult = null;
        if (transactionId) {
          processedResult = await paymentService.verifyAndProcessPayment(
            transactionId,
            {
              provider: 'BAKONG_KHQR',
              autoConfirmed: true,
              md5Hash: activeMd5,
              rawResponse: bakongStatus.raw
            },
            req.ip
          );
        }

        return res.json({
          success: true,
          status: 'PAID',
          paid: true,
          message: 'Bakong payment confirmed via MD5 lookup!',
          data: {
            transactionId: transactionId || null,
            status: 'PAID',
            amount: processedResult?.donation?.amount || donation?.amount,
            currency: processedResult?.donation?.currency || donation?.currency,
            donorName: processedResult?.donation?.donor_name || donation?.donor_name,
            paidAt: processedResult?.donation?.paid_at || new Date().toISOString(),
            raw: bakongStatus.raw
          }
        });
      }

      return res.json({
        success: true,
        status: 'PENDING',
        paid: false,
        message: 'Transaction pending scanning/confirmation.',
        errorCode: bakongStatus?.errorCode,
        responseCode: bakongStatus?.responseCode
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PaymentController();
