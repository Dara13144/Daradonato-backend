const express = require('express');
const morgan = require('morgan');
const { setupSecurity } = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route imports
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const streamerRoutes = require('./routes/streamers');
const donationRoutes = require('./routes/donations');
const paymentRoutes = require('./routes/payments');
const webhookRoutes = require('./routes/webhooks');
const alertRoutes = require('./routes/alerts');
const leaderboardRoutes = require('./routes/leaderboard');
const tickerRoutes = require('./routes/ticker');
const settingsRoutes = require('./routes/settings');
const telegramRoutes = require('./routes/telegram');
const adminRoutes = require('./routes/admin');

const webhookController = require('./controllers/webhookController');

const app = express();

// Trust proxy for rate limiting behind reverse proxies (Render / Vercel / Nginx)
app.set('trust proxy', 1);

// Normalize incoming URL paths (collapse multiple consecutive slashes, e.g. //dashboard -> /dashboard)
app.use((req, res, next) => {
  if (req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

// Security & CORS
setupSecurity(app);


// Raw webhook handler for CutLuy signature verification
app.post('/webhooks/cutluy', express.raw({ type: 'application/json' }), (req, res, next) => {
  webhookController.handleCutluyWebhook(req, res, next);
});

// Request parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global API Rate Limiter
app.use('/api/', apiLimiter);

// Mount API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/streamers', streamerRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/tip', donationRoutes);
app.use('/api/tips', donationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/ticker', tickerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/admin', adminRoutes);

// API Root & Health Discovery Routes
app.get(['/', '/api', '/api/'], (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Zoee Donation API',
    status: 'ACTIVE',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      dashboard: '/api/dashboard',
      streamers: '/api/streamers',
      donations: '/api/donations',
      alerts: '/api/alerts',
      leaderboard: '/api/leaderboard',
      ticker: '/api/ticker',
      settings: '/api/settings'
    },
    timestamp: new Date().toISOString()
  });
});

// Dashboard Direct & Alias Routes (/api/dashboard, /api/dashboad, /dashboard)
const { optionalAuth } = require('./middleware/authMiddleware');
const streamerController = require('./controllers/streamerController');

app.get(['/api/dashboard', '/api/dashboad', '/dashboard'], optionalAuth, (req, res, next) => {
  if (req.user) {
    return streamerController.getDashboardStats(req, res, next);
  }
  return res.json({
    success: true,
    message: 'Zoee Creator Dashboard API Gateway',
    documentation: 'Authenticate with Bearer token to receive private streamer statistics.',
    routes: {
      stats: '/api/streamers/dashboard/stats',
      profile: '/api/streamers/dashboard/profile',
      goals: '/api/streamers/dashboard/goals',
      donationPage: '/api/settings/donation-page',
      leaderboard: '/api/settings/leaderboard',
      ticker: '/api/settings/ticker',
      alerts: '/api/alerts/config',
      telegram: '/api/telegram/status',
      history: '/api/donations/history'
    },
    status: 'ACTIVE',
    timestamp: new Date().toISOString()
  });
});



// 404 & Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
