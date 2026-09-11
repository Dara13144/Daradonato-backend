const app = require('./app');
const config = require('./config');
const telegramService = require('./services/telegramService');

const server = app.listen(config.port, () => {
  console.log(`
  🚀 ======================================================= 🚀
     ZOEE DONATION BACKEND API SERVER RUNNING
     Port:        http://localhost:${config.port}
     Environment: ${config.nodeEnv}
     Health Check:http://localhost:${config.port}/api/health
     Telegram:    @${telegramService.botUsername} (${telegramService.botToken ? 'ENABLED' : 'DISABLED'})
  🚀 ======================================================= 🚀
  `);

  if (process.env.NODE_ENV !== 'test') {
    telegramService.startPolling();
  }
});

// Handle graceful termination
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  telegramService.stopPolling();
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  telegramService.stopPolling();
  server.close(() => {
    process.exit(0);
  });
});

module.exports = server;

