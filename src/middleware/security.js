const helmet = require('helmet');
const cors = require('cors');
const config = require('../config');

function setupSecurity(app) {
  // Helmet HTTP security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Allow OBS overlays and external assets
    crossOriginEmbedderPolicy: false
  }));

  // CORS configuration
  const allowedOrigins = [
    config.frontendUrl,
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ];

  app.use(cors({
    origin: (origin, callback) => {
      // Permissive for OBS overlays, Vercel, Render, custom creator domains & local dev
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // Cache preflight requests for 24 hours
    optionsSuccessStatus: 200
  }));
}


module.exports = { setupSecurity };
