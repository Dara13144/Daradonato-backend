const abaPayway = require('../services/payments/abaPayway');
const bakong = require('../services/payments/bakong');
const cutluy = require('../services/payments/cutluy');
const paymentService = require('../services/paymentService');
const auditService = require('../services/auditService');

class WebhookController {
  /**
   * CutLuy Payment Gateway Webhook (Auto Instant Payment Fulfillment)
   * Header: X-CutLuy-Signature
   * Body: { type: "payment.completed", data: { payment: { reference_id, amount, status: "paid" } } }
   */
  async handleCutluyWebhook(req, res, next) {
    try {
      const signatureHeader = req.get('X-CutLuy-Signature') || req.get('x-cutluy-signature') || '';
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);

      // 1. Verify signature if webhook secret is configured
      if (cutluy.webhookSecret && signatureHeader) {
        const isValid = cutluy.verifyWebhookSignature(signatureHeader, rawBody);
        if (!isValid && process.env.NODE_ENV === 'production') {
          console.warn('CutLuy Webhook signature verification failed.');
          return res.status(400).send('invalid signature');
        }
      }

      // 2. Parse payload
      let event;
      try {
        event = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
          ? req.body
          : JSON.parse(rawBody);
      } catch (e) {
        return res.status(400).send('invalid json body');
      }

      // 3. Process payment.completed event
      if (event.type === 'payment.completed' && event.data?.payment) {
        const payment = event.data.payment;
        const referenceId = payment.reference_id;

        if (!referenceId) {
          console.warn('CutLuy webhook payment missing reference_id:', payment);
          return res.status(400).send('missing reference_id');
        }

        // Fulfill donation & trigger instant live OBS alert, TTS, Telegram, leaderboard
        await paymentService.verifyAndProcessPayment(
          referenceId,
          {
            provider: 'CUTLUY',
            cutluyPaymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            approvedAt: payment.approved_at,
            rawEvent: event
          },
          req.ip
        );

        return res.status(200).send('payment completed');
      }

      return res.status(200).send('acknowledged');
    } catch (err) {
      console.error('CutLuy webhook processing error:', err);
      return res.status(500).send('webhook error');
    }
  }

  /**
   * GET /api/webhooks/aba
   * Health-check & Handshake endpoint for ABA PayWay
   */
  async handleAbaGet(req, res, next) {
    try {
      return res.json({
        success: true,
        message: "ABA PayWay webhook endpoint is ACTIVE and ready to receive callbacks.",
        status: "ACTIVE",
        endpoint: "/api/webhooks/aba",
        supported_methods: ["GET", "POST"],
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * ABA PayWay v2 Webhook Callback (POST)
   */
  async handleAbaCallback(req, res, next) {
    try {
      const data = { ...req.query, ...req.body };
      const tran_id = data.tran_id || data.tranId || data.transactionId;
      const req_time = data.req_time || data.reqTime;
      const status = data.status !== undefined ? data.status : '0';
      const hash = data.hash;
      const apv = data.apv;

      // Handle ping or webhook URL verification handshake with no transaction ID
      if (!tran_id) {
        return res.json({
          status: 0,
          description: 'ABA PayWay Webhook Receiver Ready (Ping OK)',
          success: true,
          endpoint: '/api/webhooks/aba',
          timestamp: new Date().toISOString()
        });
      }

      // 1. Verify signature if hash and req_time provided
      if (req_time && hash) {
        const isValid = abaPayway.verifyCallbackSignature(req_time, tran_id, status, hash);
        if (!isValid && process.env.NODE_ENV === 'production') {
          console.warn(`ABA Webhook signature mismatch for txn: ${tran_id}`);
          return res.status(401).json({ success: false, message: 'Invalid callback signature.' });
        }
      }

      // 2. If status is approved (status '0' or 0 or 'SUCCESS' or 'PAID')
      if (String(status) === '0' || String(status).toUpperCase() === 'SUCCESS' || String(status).toUpperCase() === 'PAID') {
        const result = await paymentService.verifyAndProcessPayment(
          tran_id,
          { rawCallback: data, apv, provider: 'ABA_PAYWAY', autoConfirmed: true },
          req.ip
        );

        return res.json({
          status: 0,
          description: 'Payment processed successfully',
          tran_id,
          success: true
        });
      } else {
        await auditService.log({
          action: 'ABA_WEBHOOK_NON_ZERO_STATUS',
          entity: 'PAYMENT',
          entityId: tran_id,
          metadata: { status, reqBody: data },
          ip: req.ip
        });

        return res.json({
          status: 0,
          description: 'Callback received with non-zero status',
          tran_id
        });
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * Bakong KHQR Webhook Callback
   */
  async handleBakongWebhook(req, res, next) {
    try {
      const { transactionId, md5, status, hash } = req.body;

      if (!transactionId) {
        return res.status(400).json({ success: false, message: 'Missing transactionId.' });
      }

      if (status === 'SUCCESS' || status === 'PAID') {
        const result = await paymentService.verifyAndProcessPayment(
          transactionId,
          { rawCallback: req.body, md5, provider: 'BAKONG_KHQR' },
          req.ip
        );

        return res.json({
          responseCode: 0,
          responseMessage: 'Success',
          data: { transactionId }
        });
      }

      return res.json({ responseCode: 0, responseMessage: 'Acknowledged' });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new WebhookController();
