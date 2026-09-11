const rateLimit = require('express-rate-limit');

// Rate limit for authentication attempts (Login / Register / Password Reset)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 30 : 1000, // 1000 in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

// Rate limit for donation creation
const donationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 donation requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many donation requests from this IP. Please slow down.'
  }
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many API requests from this IP. Please try again later.'
  }
});

module.exports = {
  authLimiter,
  donationLimiter,
  apiLimiter
};
