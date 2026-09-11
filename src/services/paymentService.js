const crypto = require('crypto');
const Store = require('../db/store');
const sanitizer = require('./sanitizer');
const paymentFactory = require('./payments/paymentFactory');
const realtimeService = require('./realtimeService');
const telegramService = require('./telegramService');
const auditService = require('./auditService');

class PaymentService {
  /**
   * Create a new donation and associated payment transaction
   */
  async initiateDonation({ streamerSlug, donorName, amount, currency = 'USD', message = '', anonymous = false, paymentMethod = 'CUTLUY', mediaUrl = null, donorId = null, clientIp = '127.0.0.1' }) {
    // 1. Find streamer
    const streamer = await Store.findStreamerBySlug(streamerSlug);
    if (!streamer) {
      throw new Error(`Streamer with slug '${streamerSlug}' not found.`);
    }

    if (!streamer.donation_enabled) {
      throw new Error('This streamer is currently not accepting donations.');
    }

    // 2. Validate amount against minimum
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('Donation amount must be a positive number.');
    }

    if (numericAmount < streamer.min_donation_amount) {
      throw new Error(`Minimum donation amount for this streamer is ${streamer.min_donation_amount} ${streamer.currency || 'USD'}.`);
    }

    // 3. Sanitize inputs
    const cleanDonorName = sanitizer.sanitizeDonorName(donorName, anonymous);
    const cleanMessage = sanitizer.sanitizeText(message, 255);

    // 4. Generate unique transaction ID
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const transactionId = `TXN-${datePrefix}-${randomSuffix}`;

    // 5. Store donation record with PENDING status
    const donation = await Store.createDonation({
      streamer_id: streamer.id,
      donor_id: donorId,
      donor_name: cleanDonorName,
      amount: numericAmount,
      currency: currency.toUpperCase(),
      message: cleanMessage,
      media_url: mediaUrl,
      anonymous: Boolean(anonymous),
      payment_method: paymentMethod.toUpperCase(),
      transaction_id: transactionId,
      tts_enabled: true
    });

    // 6. Generate provider payment payload
    const provider = paymentFactory.getProvider(paymentMethod);
    const providerPayload = await provider.createPayment
      ? await provider.createPayment({
          transactionId,
          amount: numericAmount,
          currency: currency.toUpperCase(),
          donorName: cleanDonorName,
          streamerSlug: streamer.slug,
          streamer
        })
      : provider.generatePayment({
          transactionId,
          amount: numericAmount,
          currency: currency.toUpperCase(),
          streamerSlug: streamer.slug,
          streamer
        });

    // 7. Store payment transaction record
    const expiresAt = providerPayload.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const paymentTransaction = await Store.createPaymentTransaction({
      donation_id: donation.id,
      transaction_id: transactionId,
      provider: paymentMethod.toUpperCase(),
      // CutLuy/Bakong uses id/md5Hash; ABA uses hash
      provider_transaction_id: providerPayload.id || providerPayload.md5Hash || providerPayload.hash || null,
      amount: numericAmount,
      currency: currency.toUpperCase(),
      payment_url: providerPayload.paymentUrl || providerPayload.checkoutUrl || null,
      qr_data: providerPayload.qrData || providerPayload.qrString || null,
      expires_at: expiresAt,
      metadata: {
        rawProviderResponse: providerPayload,
        checkoutUrl: providerPayload.checkoutUrl || providerPayload.paymentUrl || null,
        qrSvgUrl: providerPayload.qrSvgUrl || null,
        cutluyPaymentId: providerPayload.provider === 'CUTLUY' ? providerPayload.id : null,
        ip: clientIp
      }
    });

    await auditService.log({
      userId: donorId,
      action: 'DONATION_INITIATED',
      entity: 'DONATION',
      entityId: donation.id,
      metadata: { transactionId, amount: numericAmount, paymentMethod, streamerId: streamer.id },
      ip: clientIp
    });

    return {
      donation,
      paymentTransaction,
      providerPayload,
      streamer
    };
  }

  /**
   * Idempotent payment verification and status transition PENDING -> PAID
   */
  async verifyAndProcessPayment(transactionId, paymentMeta = {}, clientIp = '127.0.0.1') {
    const existingDonation = await Store.findDonationByTransactionId(transactionId);
    if (!existingDonation) {
      throw new Error(`Transaction ${transactionId} not found.`);
    }

    if (existingDonation.payment_status === 'PAID') {
      return {
        success: true,
        alreadyProcessed: true,
        donation: existingDonation,
        message: 'Payment was already verified and processed.'
      };
    }

    // Execute atomic mark paid
    const result = await Store.markDonationPaid(transactionId, paymentMeta);
    if (!result || !result.donation) {
      throw new Error('Failed to update donation status to PAID.');
    }

    const { donation, streamer, activeGoal } = result;

    // Fetch streamer's configured alert settings
    let alertSettings = null;
    try {
      alertSettings = await Store.getAlertSettingsByStreamerId(donation.streamer_id);
    } catch (e) {
      console.warn('Could not load alert settings for donation broadcast:', e.message);
    }

    const alertPayload = {
      id: donation.id,
      streamer_id: donation.streamer_id,
      streamer_slug: streamer ? streamer.slug : null,
      donor_name: donation.donor_name,
      amount: donation.amount,
      currency: donation.currency,
      message: donation.message,
      anonymous: donation.anonymous,
      tts_enabled: donation.tts_enabled,
      media_url: donation.media_url || null,
      payment_method: donation.payment_method || 'KHQR',
      paid_at: donation.paid_at,
      transaction_id: donation.transaction_id,
      settings: alertSettings || null
    };

    // 1. Broadcast to OBS Overlay and Realtime Feeds
    realtimeService.broadcastDonationAlert(donation.streamer_id, alertPayload);
    if (streamer && streamer.slug && streamer.slug !== donation.streamer_id) {
      realtimeService.broadcastDonationAlert(streamer.slug, alertPayload);
    }

    // 2. Broadcast Realtime Leaderboard Update to dashboard and overlays
    const lbPayload = {
      type: 'LEADERBOARD_UPDATE',
      streamerId: donation.streamer_id,
      streamerSlug: streamer ? streamer.slug : null,
      donation: {
        id: donation.id,
        donor_name: donation.donor_name,
        amount: donation.amount,
        currency: donation.currency,
        paid_at: donation.paid_at
      }
    };
    realtimeService.broadcastEvent(donation.streamer_id, lbPayload);
    if (streamer && streamer.slug) {
      realtimeService.broadcastEvent(streamer.slug, lbPayload);
    }

    // 2. Dispatch Telegram notification asynchronously
    telegramService.sendDonationNotification(donation.streamer_id, donation).catch(err => {
      console.error('Background Telegram notification error:', err.message);
    });

    // 3. Log audit entry
    await auditService.log({
      userId: donation.donor_id,
      action: 'PAYMENT_COMPLETED',
      entity: 'PAYMENT',
      entityId: transactionId,
      metadata: { amount: donation.amount, streamerId: donation.streamer_id, meta: paymentMeta },
      ip: clientIp
    });

    return {
      success: true,
      alreadyProcessed: false,
      donation,
      streamer,
      activeGoal,
      message: 'Payment successfully verified and credited.'
    };
  }

  /**
   * Check payment status and enforce expiration
   */
  async checkStatus(transactionId) {
    const donation = await Store.findDonationByTransactionId(transactionId);
    if (!donation) {
      throw new Error(`Transaction ${transactionId} not found.`);
    }

    const pTxn = await Store.findPaymentTransactionByTxnId(transactionId);

    // If still pending, check live payment status via provider
    if (donation.payment_status === 'PENDING' && pTxn) {
      // 1. Bakong KHQR MD5 Verification
      if (pTxn.provider === 'BAKONG_KHQR' || pTxn.provider === 'BAKONG') {
        const bakong = require('./payments/bakong');
        const md5Hash = pTxn.provider_transaction_id || pTxn.metadata?.rawProviderResponse?.md5Hash;
        if (md5Hash) {
          try {
            const bakongStatus = await bakong.checkTransactionStatus(md5Hash);
            if (bakongStatus && bakongStatus.status === 'PAID') {
              await this.verifyAndProcessPayment(transactionId, {
                provider: 'BAKONG_KHQR',
                autoConfirmed: true,
                md5Hash,
                rawResponse: bakongStatus.raw
              });
              donation.payment_status = 'PAID';
              donation.paid_at = new Date().toISOString();
            }
          } catch (bErr) {
            console.warn('Bakong checkStatus notice:', bErr.message);
          }
        }
      }

      // 2. CutLuy Verification
      if (pTxn.provider === 'CUTLUY' || pTxn.provider === 'CUTLUY_KHQR') {
        const cutluy = require('./payments/cutluy');
        const cutluyId = pTxn.provider_transaction_id || pTxn.metadata?.rawProviderResponse?.id;
        if (cutluyId) {
          try {
            const liveStatus = await cutluy.checkPaymentStatus(cutluyId);
            if (liveStatus && (liveStatus.status === 'paid' || liveStatus.status === 'PAID')) {
              await this.verifyAndProcessPayment(transactionId, { liveCutluyResponse: liveStatus, provider: 'CUTLUY' });
              donation.payment_status = 'PAID';
              donation.paid_at = liveStatus.approved_at || new Date().toISOString();
            } else if (liveStatus && (liveStatus.status === 'scanned')) {
              return {
                transactionId,
                status: 'SCANNED',
                amount: donation.amount,
                currency: donation.currency,
                donorName: donation.donor_name,
                paidAt: null,
                expiresAt: pTxn.expires_at
              };
            }
          } catch (cErr) {
            console.warn('CutLuy checkStatus notice:', cErr.message);
          }
        }
      }
    }

    // If still pending, check if expired
    if (donation.payment_status === 'PENDING' && pTxn && pTxn.expires_at) {
      if (new Date(pTxn.expires_at) < new Date()) {
        await Store.markDonationExpired(transactionId);
        donation.payment_status = 'EXPIRED';
        if (pTxn) pTxn.status = 'EXPIRED';
      }
    }

    return {
      transactionId,
      status: donation.payment_status,
      amount: donation.amount,
      currency: donation.currency,
      donorName: donation.donor_name,
      paidAt: donation.paid_at,
      expiresAt: pTxn ? pTxn.expires_at : null
    };
  }
}

module.exports = new PaymentService();
