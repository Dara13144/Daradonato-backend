const paymentService = require('../services/paymentService');
const Store = require('../db/store');

class DonationController {
  /**
   * Initiate a donation transaction
   */
  async createDonation(req, res, next) {
    try {
      const { streamerSlug, amount, currency, donorName, donorEmail, message, anonymous, paymentMethod, mediaUrl } = req.body;
      const donorId = req.user ? req.user.id : null;

      const result = await paymentService.initiateDonation({
        streamerSlug,
        amount,
        currency: currency || 'USD',
        donorName,
        message,
        anonymous: Boolean(anonymous),
        paymentMethod: paymentMethod || 'CUTLUY',
        mediaUrl,
        donorId,
        clientIp: req.ip
      });

      return res.status(201).json({
        success: true,
        message: 'Donation transaction initiated.',
        data: {
          transactionId: result.donation.transaction_id,
          amount: result.donation.amount,
          currency: result.donation.currency,
          donorName: result.donation.donor_name,
          paymentMethod: result.donation.payment_method,
          status: result.donation.payment_status,
          paymentUrl: result.paymentTransaction.payment_url,
          qrData: result.paymentTransaction.qr_data,
          expiresAt: result.paymentTransaction.expires_at,
          providerPayload: result.providerPayload,
          aba_payway_link: result.streamer?.aba_payway_link || result.providerPayload?.aba_payway_link || null,
          aba_account_name: result.streamer?.aba_account_name || result.providerPayload?.aba_account_name || null,
          aba_account_number: result.streamer?.aba_account_number || result.providerPayload?.aba_account_number || null,
          aba_instructions: result.streamer?.aba_instructions || result.providerPayload?.aba_instructions || null,
          aba_qr_url: result.streamer?.aba_qr_url || null,
          bakong_id: result.streamer?.bakong_id || result.providerPayload?.bakong_id || null,
          bakong_name: result.streamer?.bakong_name || result.providerPayload?.bakong_name || null
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get public live donation feed for a streamer or platform-wide
   */
  async getPublicFeed(req, res, next) {
    try {
      const { streamerSlug, limit = 15 } = req.query;
      let streamerId = null;

      if (streamerSlug) {
        const streamer = await Store.findStreamerBySlug(streamerSlug);
        if (!streamer) {
          return res.status(404).json({ success: false, message: 'Streamer not found.' });
        }
        streamerId = streamer.id;
      }

      const donations = await Store.getDonations(
        { streamer_id: streamerId, payment_status: 'PAID' },
        { page: 1, limit: parseInt(limit, 10) }
      );

      return res.json({
        success: true,
        data: donations.data.map(d => ({
          id: d.id,
          donorName: d.anonymous ? 'Anonymous' : d.donor_name,
          amount: d.amount,
          currency: d.currency,
          message: d.message,
          anonymous: d.anonymous,
          paidAt: d.paid_at || d.created_at,
          streamerId: d.streamer_id
        }))
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get recent public paid donations for a specific streamer
   */
  async getRecentDonations(req, res, next) {
    try {
      const { streamerSlug } = req.params;
      const { limit = 10 } = req.query;

      const streamer = await Store.findStreamerBySlug(streamerSlug);
      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer not found.' });
      }

      const recent = await Store.getRecentDonations(streamer.id, parseInt(limit, 10) || 10);

      return res.json({
        success: true,
        data: recent
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get streamer's donation history (Streamer only)
   */
  async getStreamerDonations(req, res, next) {
    try {
      const userId = req.user.id;
      const streamer = await Store.findStreamerByUserId(userId);
      if (!streamer) {
        return res.status(404).json({ success: false, message: 'Streamer profile not found.' });
      }

      const { page = 1, limit = 20, status, search } = req.query;

      const result = await Store.getDonations(
        { streamer_id: streamer.id, payment_status: status, search },
        { page, limit }
      );

      return res.json({
        success: true,
        data: result.data,
        meta: result.meta
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get details of a single transaction (safe public subset)
   */
  async getDonationByTransactionId(req, res, next) {
    try {
      const { transactionId } = req.params;
      const donation = await Store.findDonationByTransactionId(transactionId);
      if (!donation) {
        return res.status(404).json({ success: false, message: 'Transaction not found.' });
      }

      const pTxn = await Store.findPaymentTransactionByTxnId(transactionId);

      return res.json({
        success: true,
        data: {
          id: donation.id,
          transaction_id: donation.transaction_id,
          amount: donation.amount,
          currency: donation.currency,
          donor_name: donation.anonymous ? 'Anonymous' : donation.donor_name,
          message: donation.message,
          anonymous: donation.anonymous,
          payment_status: donation.payment_status,
          payment_method: donation.payment_method,
          created_at: donation.created_at,
          paid_at: donation.paid_at,
          paymentTransaction: pTxn ? {
            status: pTxn.status,
            payment_url: pTxn.payment_url,
            qr_data: pTxn.qr_data,
            expires_at: pTxn.expires_at
          } : null
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DonationController();
