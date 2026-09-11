const EventEmitter = require('events');

class RealtimeService extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // identifier/streamerId -> Set of express res objects (SSE)
  }

  /**
   * Register an SSE client (e.g., OBS Overlay or Streamer Dashboard)
   * Supports multiple alias keys (UUID, slug, token) so alerts are never missed.
   */
  registerClient(streamerId, res, aliases = []) {
    const keys = [streamerId, ...aliases].filter(Boolean);
    keys.forEach(k => {
      if (!this.clients.has(k)) {
        this.clients.set(k, new Set());
      }
      this.clients.get(k).add(res);
    });

    // Keep connection alive with periodic heartbeats (20s)
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (err) {
        clearInterval(heartbeat);
      }
    }, 20000);

    res.on('close', () => {
      clearInterval(heartbeat);
      keys.forEach(k => {
        if (this.clients.has(k)) {
          this.clients.get(k).delete(res);
          if (this.clients.get(k).size === 0) {
            this.clients.delete(k);
          }
        }
      });
    });
  }

  /**
   * Broadcast paid donation alert to streamer's registered OBS overlays and dashboard
   */
  broadcastDonationAlert(streamerId, donationData) {
    const payload = JSON.stringify({
      type: 'NEW_DONATION',
      data: donationData,
      timestamp: new Date().toISOString()
    });

    const sent = new Set();
    const targets = [
      streamerId,
      donationData.streamer_id,
      donationData.streamer_slug,
      donationData.streamerSlug
    ].filter(Boolean);

    targets.forEach(target => {
      if (this.clients.has(target)) {
        for (const res of this.clients.get(target)) {
          if (!sent.has(res)) {
            sent.add(res);
            try {
              res.write(`data: ${payload}\n\n`);
            } catch (err) {
              console.error('Failed to send SSE event to client:', err.message);
            }
          }
        }
      }
    });

    // Also emit node event
    this.emit('donation_paid', { streamerId, donation: donationData });
  }

  /**
   * Broadcast a manual test alert
   */
  broadcastTestAlert(streamerId, testData) {
    const payload = JSON.stringify({
      type: 'TEST_ALERT',
      data: testData,
      timestamp: new Date().toISOString()
    });

    const sent = new Set();
    const targets = [
      streamerId,
      testData.streamer_id,
      testData.streamer_slug,
      testData.streamerSlug
    ].filter(Boolean);

    targets.forEach(target => {
      if (this.clients.has(target)) {
        for (const res of this.clients.get(target)) {
          if (!sent.has(res)) {
            sent.add(res);
            try {
              res.write(`data: ${payload}\n\n`);
            } catch (err) {
              console.error('Failed to send test SSE event to client:', err.message);
            }
          }
        }
      }
    });
  }

  /**
   * Broadcast arbitrary realtime event (e.g. settings update, ticker, leaderboard)
   */
  broadcastEvent(streamerId, eventData) {
    const payload = JSON.stringify(eventData);

    const sent = new Set();
    const targets = [
      streamerId,
      eventData.streamerId,
      eventData.streamer_id,
      eventData.streamerSlug,
      eventData.streamer_slug
    ].filter(Boolean);

    targets.forEach(target => {
      if (this.clients.has(target)) {
        for (const res of this.clients.get(target)) {
          if (!sent.has(res)) {
            sent.add(res);
            try {
              res.write(`data: ${payload}\n\n`);
            } catch (err) {
              console.error('Failed to send SSE event to client:', err.message);
            }
          }
        }
      }
    });
  }
}

module.exports = new RealtimeService();
