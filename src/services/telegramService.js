const axios = require('axios');
const config = require('../config');
const Store = require('../db/store');

class TelegramService {
  constructor() {
    this.botToken = config.telegram.botToken;
    this.botUsername = config.telegram.botUsername || 'darastore_bot';
    this.apiUrl = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;
    this.isPolling = false;
    this.pollAbortController = null;
    this.lastUpdateId = 0;
  }

  /**
   * Escape HTML entities for Telegram HTML parse_mode
   */
  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Send formatted donation notification message to streamer's Telegram chat
   */
  async sendDonationNotification(streamerId, donation) {
    try {
      const connection = await Store.getTelegramConnectionByStreamerId(streamerId);
      if (!connection || !connection.chat_id) {
        return { sent: false, reason: 'Telegram not connected for streamer' };
      }

      if (!this.apiUrl || process.env.NODE_ENV === 'test') {
        console.log(`[Telegram Simulation] Would send notification to chat ${connection.chat_id}: Donation $${donation.amount} by ${donation.donor_name}`);
        return { sent: true, simulated: true };
      }

      const isKHR = String(donation.currency).toUpperCase() === 'KHR';
      const formattedAmount = isKHR
        ? `${Number(donation.amount).toLocaleString()} ៛`
        : `$${Number(donation.amount).toFixed(2)}`;

      const khrRate = 4100;
      const secondaryAmount = isKHR
        ? `($${(Number(donation.amount) / khrRate).toFixed(2)})`
        : `(~${(Number(donation.amount) * khrRate).toLocaleString()} ៛)`;

      const donorName = donation.donor_name || 'Anonymous Supporter';
      const message = donation.message || '(No message included)';
      const method = donation.payment_method || 'Bakong KHQR';
      const txnId = donation.transaction_id || donation.id || 'N/A';
      const dateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' });

      // Clean HTML text
      const safeDonor = this.escapeHtml(donorName);
      const safeMessage = this.escapeHtml(message);
      const safeMethod = this.escapeHtml(method);
      const safeTxnId = this.escapeHtml(txnId);
      const safeAmount = this.escapeHtml(formattedAmount);
      const safeSecondary = this.escapeHtml(secondaryAmount);

      const htmlText =
        `🔔 <b>DARA DONATION • NEW TIP RECEIVED!</b> 🇰🇭\n\n` +
        `👤 <b>Donor:</b> <code>${safeDonor}</code>\n` +
        `💰 <b>Amount:</b> <b>${safeAmount}</b> <i>${safeSecondary}</i>\n` +
        `💬 <b>Message:</b> "<i>${safeMessage}</i>"\n` +
        `💳 <b>Method:</b> <code>${safeMethod}</code>\n` +
        `🔖 <b>Txn ID:</b> <code>${safeTxnId}</code>\n` +
        `⏱ <b>Time:</b> <i>${dateStr} (Cambodia)</i>\n\n` +
        `🚀 <i>Your live OBS alert &amp; TTS are playing now!</i>`;

      const dashboardUrl = `${config.frontendUrl}/dashboard`;

      const payload = {
        chat_id: connection.chat_id,
        text: htmlText,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Open Dashboard', url: dashboardUrl },
              { text: '💬 Streamer Settings', url: `${dashboardUrl}/telegram` }
            ]
          ]
        }
      };

      try {
        const response = await axios.post(`${this.apiUrl}/sendMessage`, payload, { timeout: 10000 });
        return { sent: true, response: response.data };
      } catch (sendErr) {
        // Fallback to plain text if HTML parse fails
        console.warn('Telegram HTML send failed, falling back to plain text:', sendErr.message);
        const plainText =
          `🔔 NEW DONATION RECEIVED!\n\n` +
          `Donor: ${donorName}\n` +
          `Amount: ${formattedAmount} ${secondaryAmount}\n` +
          `Message: "${message}"\n` +
          `Method: ${method}\n` +
          `Transaction ID: ${txnId}\n` +
          `Time: ${dateStr}\n\n` +
          `Zoee Donation Platform 🇰🇭`;

        const fallbackRes = await axios.post(`${this.apiUrl}/sendMessage`, {
          chat_id: connection.chat_id,
          text: plainText
        }, { timeout: 8000 });

        return { sent: true, fallback: true, response: fallbackRes.data };
      }
    } catch (err) {
      console.error('Failed to send Telegram notification:', err.response?.data || err.message);
      return { sent: false, error: err.message };
    }
  }

  /**
   * Send test donation notification to verify bot setup
   */
  async sendTestNotification(streamerId) {
    const testDonation = {
      donor_name: 'Sokha Gaming (Test Donor)',
      amount: 5.00,
      currency: 'USD',
      message: 'This is a test notification! Your Telegram bot is fully active and working. 🚀',
      payment_method: 'BAKONG_KHQR',
      transaction_id: 'TXN-TEST-' + Math.floor(100000 + Math.random() * 900000)
    };
    return this.sendDonationNotification(streamerId, testDonation);
  }

  /**
   * Direct sendMessage helper
   */
  async sendMessage(chatId, text, extra = {}) {
    if (!this.apiUrl || process.env.NODE_ENV === 'test') {
      return { ok: true, simulated: true };
    }
    try {
      const res = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...extra
      }, { timeout: 8000 });
      return res.data;
    } catch (err) {
      // Fallback plain text
      try {
        const plainRes = await axios.post(`${this.apiUrl}/sendMessage`, {
          chat_id: chatId,
          text: text.replace(/<[^>]*>?/gm, '')
        }, { timeout: 8000 });
        return plainRes.data;
      } catch (fallbackErr) {
        console.error('Failed to send Telegram message:', fallbackErr.response?.data || fallbackErr.message);
        return { ok: false, error: fallbackErr.message };
      }
    }
  }

  /**
   * Process incoming Telegram update (from polling or webhook)
   */
  async processUpdate(update) {
    try {
      const message = update.message;
      if (!message || !message.text) return;

      const chatId = message.chat.id;
      const text = message.text.trim();
      const userId = message.from?.id || chatId;
      const userName = message.from?.first_name || message.from?.username || 'Streamer';

      // 1. Check for /start command with login QR token or pairing code
      if (text.startsWith('/start')) {
        const parts = text.split(/\s+/);
        const param = parts[1]?.trim();

        if (param) {
          // Check if this is a web login authorization (e.g. login_TLOG_123456 or TLOG_123456)
          if (param.toLowerCase().includes('login') || param.toUpperCase().includes('TLOG')) {
            const tokenMatch = param.match(/TLOG[_-][a-zA-Z0-9]+/i);
            if (tokenMatch) {
              const sessionToken = tokenMatch[0].replace(/_/g, '-').toUpperCase();
              const authResult = await Store.authorizeTelegramLoginSession(sessionToken, message.from || message.chat);
              if (authResult && authResult.status === 'AUTHENTICATED') {
                const displayName = authResult.user?.display_name || authResult.user?.username || userName;
                await this.sendMessage(chatId,
                  `🎉 <b>LOGIN APPROVED &amp; AUTHENTICATED!</b> 🚀\n\n` +
                  `👤 <b>User:</b> <code>${this.escapeHtml(displayName)}</code>\n` +
                  `🆔 <b>Telegram ID:</b> <code>${userId}</code>\n` +
                  `🟢 <b>Status:</b> Authenticated\n` +
                  `⏰ <b>Time:</b> <i>${this.escapeHtml(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Phnom_Penh' }))} (Cambodia)</i>\n\n` +
                  `🖥 <b>Your browser has been logged in automatically.</b> Welcome back!`,
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: '🖥 Open Dashboard', url: `${config.frontendUrl}/dashboard` }]
                      ]
                    }
                  }
                );
                return;
              } else {
                await this.sendMessage(chatId,
                  `⚠️ <b>Login Session Expired or Invalid</b>\n\n` +
                  `This login QR code has expired or was already used.\n` +
                  `Please refresh the login page on the website and scan again.`
                );
                return;
              }
            }
          }

          // Otherwise, treat as streamer alert pairing code
          const code = param.replace(/_/g, '-').toUpperCase();
          await this.handlePairing(code, chatId, userId);
          return;
        }

        // Standard /start without code
        await this.sendMessage(chatId,
          `👋 <b>Hello ${this.escapeHtml(userName)}!</b>\n\n` +
          `Welcome to the <b>Zoee Donation Official Bot</b> (@${this.botUsername}) 🤖\n\n` +
          `⚡ <b>What you can do:</b>\n` +
          `• <b>Scan to Login:</b> Authenticate into your stream dashboard instantly\n` +
          `• <b>Push Alerts:</b> Receive instant notifications when viewers tip via Bakong KHQR, ABA PayWay, or CutLuy\n` +
          `• <b>Live Stats:</b> Check your total donations using /stats\n\n` +
          `To connect your stream channel, send your <b>Pairing Code</b> (e.g. <code>DARA-123456</code>) from your dashboard.\n` +
          `Type <b>/help</b> for all available commands.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🌐 Visit Website', url: config.frontendUrl }],
                [{ text: '📊 Streamer Dashboard', url: `${config.frontendUrl}/dashboard` }]
              ]
            }
          }
        );
        return;
      }

      // 1b. Direct login token message (e.g., user sends TLOG-XXXXX)
      const loginTokenMatch = text.match(/\b(TLOG[-_][a-zA-Z0-9]+)\b/i);
      if (loginTokenMatch) {
        const sessionToken = loginTokenMatch[1].replace(/_/g, '-').toUpperCase();
        const authResult = await Store.authorizeTelegramLoginSession(sessionToken, message.from || message.chat);
        if (authResult && authResult.status === 'AUTHENTICATED') {
          const displayName = authResult.user?.display_name || authResult.user?.username || userName;
          await this.sendMessage(chatId,
            `🎉 <b>LOGIN APPROVED!</b> 🚀\n\n` +
            `👤 <b>User:</b> <code>${this.escapeHtml(displayName)}</code>\n` +
            `🟢 <b>Status:</b> Successfully Logged In\n\n` +
            `Your website session is now active!`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🖥 Open Dashboard', url: `${config.frontendUrl}/dashboard` }]
                ]
              }
            }
          );
          return;
        }
      }

      // 2. Direct pairing code input (e.g., DARA-123456 or /pair DARA-123456)
      const codeMatch = text.match(/\b(DARA[-_]\d{6})\b/i);
      if (codeMatch) {
        const code = codeMatch[1].replace(/_/g, '-').toUpperCase();
        await this.handlePairing(code, chatId, userId);
        return;
      }

      // 3. /status command
      if (text === '/status') {
        const connection = await Store.getTelegramConnectionByChatId(chatId);
        if (connection) {
          const streamer = await Store.findStreamerById(connection.streamer_id);
          const streamerName = streamer?.displayName || streamer?.username || 'Streamer';
          await this.sendMessage(chatId,
            `🟢 <b>Telegram Bot Connected!</b>\n\n` +
            `👤 <b>Streamer Account:</b> <code>${this.escapeHtml(streamerName)}</code>\n` +
            `🆔 <b>Chat ID:</b> <code>${chatId}</code>\n` +
            `✅ <b>Push Alerts:</b> ACTIVE\n` +
            `📅 <b>Connected Since:</b> <i>${new Date(connection.created_at || Date.now()).toLocaleDateString()}</i>\n\n` +
            `Type <b>/test</b> to trigger a sample alert, <b>/stats</b> for balance, or <b>/unlink</b> to disconnect.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔔 Test Push Alert', callback_data: 'test_alert' }, { text: '📊 Dashboard', url: `${config.frontendUrl}/dashboard` }]
                ]
              }
            }
          );
        } else {
          await this.sendMessage(chatId,
            `🔴 <b>Telegram Bot Not Connected</b>\n\n` +
            `This chat is not linked to any Zoee Donation streamer account.\n` +
            `Send your pairing code (e.g. <code>DARA-123456</code>) to link.`
          );
        }
        return;
      }

      // 4. /stats or /balance command
      if (text === '/stats' || text === '/balance') {
        const connection = await Store.getTelegramConnectionByChatId(chatId);
        if (connection) {
          const streamer = await Store.findStreamerById(connection.streamer_id);
          const totalReceived = Number(streamer?.total_received || 0).toFixed(2);
          const supporterCount = streamer?.supporter_count || 0;
          const streamerSlug = streamer?.slug || 'streamer';

          await this.sendMessage(chatId,
            `📊 <b>STREAMER CHANNEL OVERVIEW</b> 🇰🇭\n\n` +
            `👤 <b>Channel:</b> <code>@${this.escapeHtml(streamerSlug)}</code>\n` +
            `💰 <b>Total Received:</b> <b>$${totalReceived} USD</b>\n` +
            `👥 <b>Total Supporters:</b> <b>${supporterCount} donors</b>\n` +
            `🔗 <b>Tip Link:</b> <code>${config.frontendUrl}/tip/${streamerSlug}</code>\n\n` +
            `Keep up the great streams! 🎮`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎁 Open Tip Page', url: `${config.frontendUrl}/tip/${streamerSlug}` }]
                ]
              }
            }
          );
        } else {
          await this.sendMessage(chatId, `⚠️ Please link your account first by sending your pairing code.`);
        }
        return;
      }

      // 5. /test command
      if (text === '/test') {
        const connection = await Store.getTelegramConnectionByChatId(chatId);
        if (connection) {
          await this.sendTestNotification(connection.streamer_id);
        } else {
          await this.sendMessage(chatId,
            `⚠️ Please link your account first by sending your pairing code (e.g. <code>DARA-123456</code>).`
          );
        }
        return;
      }

      // 6. /unlink or /disconnect command
      if (text === '/unlink' || text === '/disconnect') {
        await Store.disconnectTelegramChat(chatId);
        await this.sendMessage(chatId,
          `🔌 <b>Telegram Disconnected</b>\n\n` +
          `This chat has been disconnected from your streamer account. You will no longer receive donation alerts here.\n\n` +
          `To reconnect in the future, simply generate a new code from your dashboard and send it here.`
        );
        return;
      }

      // 7. /help command
      if (text === '/help') {
        await this.sendMessage(chatId,
          `📖 <b>Zoee Donation Bot Commands:</b>\n\n` +
          `• <code>DARA-XXXXXX</code> - Connect streamer account using pairing code\n` +
          `• <b>/status</b> - Check connection status\n` +
          `• <b>/stats</b> - View total received donations &amp; supporter count\n` +
          `• <b>/test</b> - Send a test push notification\n` +
          `• <b>/unlink</b> - Disconnect this chat\n` +
          `• <b>/help</b> - Show this guide\n\n` +
          `🌐 <b>Website:</b> ${config.frontendUrl}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🖥 Open Dashboard', url: `${config.frontendUrl}/dashboard` }]
              ]
            }
          }
        );
        return;
      }

      // Default fallback
      await this.sendMessage(chatId,
        `🤖 <b>Zoee Donation Bot (@${this.botUsername})</b>\n\n` +
        `Send your 6-digit pairing code (e.g. <code>DARA-123456</code>) to link your streamer account, or type <b>/help</b> for commands.`
      );
    } catch (err) {
      console.error('Error in Telegram processUpdate:', err.message);
    }
  }

  /**
   * Handle pairing code logic
   */
  async handlePairing(code, chatId, userId) {
    const connection = await Store.pairTelegramChat(code, chatId, userId);
    if (connection) {
      let streamerName = 'Streamer';
      try {
        const streamer = await Store.findStreamerById(connection.streamer_id);
        if (streamer) streamerName = streamer.displayName || streamer.username || streamerName;
      } catch (e) {
        // ignore
      }

      await this.sendMessage(chatId,
        `🎉 <b>ACCOUNT CONNECTED SUCCESSFULLY!</b> 🇰🇭\n\n` +
        `👤 <b>Streamer:</b> <code>${this.escapeHtml(streamerName)}</code>\n` +
        `🆔 <b>Chat ID:</b> <code>${chatId}</code>\n` +
        `🟢 <b>Status:</b> ACTIVE &amp; READY\n\n` +
        `You will now receive instant push alerts with sound whenever someone donates via Bakong KHQR, ABA PayWay, or CutLuy! 🚀\n\n` +
        `💡 <i>Try sending /test to see what a donation alert looks like!</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔔 Test Push Alert', url: `${config.frontendUrl}/dashboard/telegram` }],
              [{ text: '📊 Streamer Dashboard', url: `${config.frontendUrl}/dashboard` }]
            ]
          }
        }
      );
    } else {
      await this.sendMessage(chatId,
        `❌ <b>Invalid or Expired Pairing Code</b>\n\n` +
        `Could not find a pending pairing request for code <code>${this.escapeHtml(code)}</code>.\n\n` +
        `Please go to your <b>Dashboard ➔ Telegram Alerts</b> to generate a fresh pairing code.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔑 Generate New Code', url: `${config.frontendUrl}/dashboard/telegram` }]
            ]
          }
        }
      );
    }
  }

  /**
   * Start long-polling Telegram API
   */
  startPolling() {
    if (this.isPolling) return;
    if (!this.botToken || !this.apiUrl) {
      console.log('⚠️ [Telegram] No BOT_TOKEN configured. Polling disabled.');
      return;
    }

    this.isPolling = true;
    console.log(`🤖 [Telegram] Bot @${this.botUsername} started long-polling for updates...`);
    this.pollLoop();
  }

  /**
   * Stop long-polling
   */
  stopPolling() {
    this.isPolling = false;
    if (this.pollAbortController) {
      this.pollAbortController.abort();
    }
    console.log('🛑 [Telegram] Polling stopped.');
  }

  /**
   * Recursive long-polling loop
   */
  async pollLoop() {
    while (this.isPolling) {
      try {
        const response = await axios.get(`${this.apiUrl}/getUpdates`, {
          params: {
            offset: this.lastUpdateId ? this.lastUpdateId + 1 : 0,
            timeout: 20,
            allowed_updates: JSON.stringify(['message'])
          },
          timeout: 30000
        });

        if (response.data && response.data.ok && Array.isArray(response.data.result)) {
          for (const update of response.data.result) {
            this.lastUpdateId = update.update_id;
            await this.processUpdate(update);
          }
        }
      } catch (err) {
        if (!this.isPolling) break;
        // Wait 3 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
}

module.exports = new TelegramService();
