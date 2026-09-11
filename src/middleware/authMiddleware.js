const jwt = require('jsonwebtoken');
const config = require('../config');
const Store = require('../db/store');

/**
 * Authenticate JWT session token
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Missing Bearer token.'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      // Fallback: Check if token is a valid Supabase JWT access token
      try {
        decoded = jwt.decode(token);
        if (!decoded || (!decoded.sub && !decoded.id && !decoded.email)) {
          throw new Error('Invalid token structure');
        }
      } catch (decodeErr) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired authentication token.'
        });
      }
    }

    let user = await Store.findProfileById(decoded.id || decoded.sub);
    if (!user && decoded.email) {
      user = await Store.findProfileByEmail(decoded.email);
    }
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User profile no longer exists.'
      });
    }


    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact platform support.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Authentication error: ' + err.message
    });
  }
}

/**
 * Optional authentication: attaches user if valid token exists, otherwise proceeds as guest
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await Store.findProfileById(decoded.id || decoded.sub);
      if (user && user.status === 'ACTIVE') {
        req.user = user;
      }
    }
  } catch (err) {
    // Ignore invalid token in optional auth
  }
  next();
}

/**
 * Require specific role(s) (e.g., ADMIN or STREAMER)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Requires one of the following roles: ${roles.join(', ')}.`
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  optionalAuth,
  requireRole
};
