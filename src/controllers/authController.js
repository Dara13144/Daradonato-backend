const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const Store = require('../db/store');
const auditService = require('../services/auditService');

class AuthController {
  /**
   * Register a new user
   */
  async register(req, res, next) {
    try {
      const { email, username, password, display_name } = req.body;

      // 1. Check duplicate email
      const existingEmail = await Store.findProfileByEmail(email);
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email address already exists.'
        });
      }

      // 2. Check duplicate username
      const existingUser = await Store.findProfileByUsername(username);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'This username is already taken. Please choose another.'
        });
      }

      // 3. Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // 4. Create profile
      const newProfile = await Store.createProfile({
        email,
        username,
        display_name: display_name || username,
        password_hash: passwordHash,
        role: 'STREAMER'
      });

      // 4b. Auto-provision Streamer record so the user can immediately use Dashboard
      let streamer = await Store.findStreamerByUserId(newProfile.id);
      if (!streamer) {
        streamer = await Store.createStreamer({
          user_id: newProfile.id,
          slug: newProfile.username,
          donation_enabled: true,
          currency: 'USD',
          min_donation_amount: 1.00
        });
      }

      // 5. Generate JWT token
      const token = jwt.sign(
        { id: newProfile.id, email: newProfile.email, role: 'STREAMER', username: newProfile.username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      await auditService.log({
        userId: newProfile.id,
        action: 'USER_REGISTERED',
        entity: 'USER',
        entityId: newProfile.id,
        ip: req.ip
      });

      const { password_hash, ...safeProfile } = newProfile;

      return res.status(201).json({
        success: true,
        message: 'Account registered successfully. Welcome to your Creator Dashboard!',
        data: {
          token,
          user: safeProfile,
          streamer: streamer || null
        }
      });
    } catch (err) {
      next(err);
    }
  }


  /**
   * Login user
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const profile = await Store.findProfileByEmail(email);
      if (!profile) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password credentials.'
        });
      }

      if (profile.status === 'SUSPENDED') {
        return res.status(403).json({
          success: false,
          message: 'Account is suspended. Please contact platform support.'
        });
      }

      // Compare password
      if (!profile.password_hash) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password credentials. If you signed in with Google, please use Google Login.'
        });
      }

      const isValid = await bcrypt.compare(password, profile.password_hash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password credentials.'
        });
      }

      // Check if user is also a streamer
      const streamer = await Store.findStreamerByUserId(profile.id);

      const token = jwt.sign(
        { id: profile.id, email: profile.email, role: profile.role, username: profile.username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      await auditService.log({
        userId: profile.id,
        action: 'USER_LOGIN',
        entity: 'USER',
        entityId: profile.id,
        ip: req.ip
      });

      const { password_hash, ...safeProfile } = profile;

      return res.json({
        success: true,
        message: 'Logged in successfully.',
        data: {
          token,
          user: safeProfile,
          streamer: streamer || null
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Google OAuth Sign-in & Register
   */
  async googleLogin(req, res, next) {
    try {
      const { email, displayName, avatarUrl, googleId } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Google profile email is required.'
        });
      }

      const profile = await Store.findOrCreateGoogleProfile({
        googleId: googleId || 'google_' + Date.now(),
        email,
        displayName: displayName || email.split('@')[0],
        avatarUrl
      });

      if (profile.status === 'SUSPENDED') {
        return res.status(403).json({
          success: false,
          message: 'Account is suspended. Please contact platform support.'
        });
      }

      let streamer = await Store.findStreamerByUserId(profile.id);
      if (!streamer) {
        streamer = await Store.createStreamer({
          user_id: profile.id,
          slug: profile.username,
          donation_enabled: true,
          currency: 'USD',
          min_donation_amount: 1.00
        });
      }

      const token = jwt.sign(
        { id: profile.id, email: profile.email, role: profile.role || 'STREAMER', username: profile.username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );


      await auditService.log({
        userId: profile.id,
        action: 'USER_GOOGLE_LOGIN',
        entity: 'USER',
        entityId: profile.id,
        ip: req.ip
      });

      const { password_hash, ...safeProfile } = profile;

      return res.json({
        success: true,
        message: 'Google login successful.',
        data: {
          token,
          user: safeProfile,
          streamer: streamer || null
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get current authenticated user session
   */
  async getMe(req, res, next) {
    try {
      const profile = req.user;
      const streamer = await Store.findStreamerByUserId(profile.id);
      const { password_hash, ...safeProfile } = profile;

      return res.json({
        success: true,
        data: {
          user: safeProfile,
          streamer: streamer || null
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Forgot password request
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const profile = await Store.findProfileByEmail(email);
      
      // Always return success to prevent email enumeration
      return res.json({
        success: true,
        message: 'If that email exists in our system, a password reset link has been dispatched.'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Valid reset token and password of min 6 chars required.'
        });
      }

      return res.json({
        success: true,
        message: 'Password has been reset successfully. Please login with your new password.'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a new Telegram QR Scan Login Session
   */
  async createTelegramSession(req, res, next) {
    try {
      const sessionData = await Store.createTelegramLoginSession();
      return res.json({
        success: true,
        data: sessionData
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Check status of Telegram QR Scan Login Session
   */
  async checkTelegramSession(req, res, next) {
    try {
      const { sessionToken } = req.params;
      const session = await Store.getTelegramLoginSession(sessionToken);

      if (!session) {
        return res.status(404).json({
          success: false,
          authenticated: false,
          message: 'Login session not found or expired.'
        });
      }

      if (session.status === 'EXPIRED') {
        return res.json({
          success: false,
          authenticated: false,
          status: 'EXPIRED',
          message: 'QR code expired. Please generate a new scan.'
        });
      }

      if (session.status === 'AUTHENTICATED') {
        return res.json({
          success: true,
          authenticated: true,
          status: 'AUTHENTICATED',
          token: session.jwt,
          user: session.user,
          streamer: session.streamer,
          message: 'Logged in successfully via Telegram!'
        });
      }

      return res.json({
        success: true,
        authenticated: false,
        status: 'PENDING',
        message: 'Waiting for Telegram scan authorization...'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Verify/Authorize Telegram Scan Login (Programmatic or Bot Callback)
   */
  async verifyTelegramScan(req, res, next) {
    try {
      const { sessionToken, telegramUser } = req.body;
      if (!sessionToken || !telegramUser) {
        return res.status(400).json({
          success: false,
          message: 'Session token and Telegram user object are required.'
        });
      }

      const session = await Store.authorizeTelegramLoginSession(sessionToken, telegramUser);
      if (!session || session.status !== 'AUTHENTICATED') {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired login session.'
        });
      }

      return res.json({
        success: true,
        message: 'Telegram login approved!',
        data: {
          token: session.jwt,
          user: session.user,
          streamer: session.streamer
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Direct Telegram Login Widget authentication
   */
  async telegramLoginWidget(req, res, next) {
    try {
      const { id, first_name, last_name, username, photo_url, auth_date, hash } = req.body;
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Telegram user ID is required.'
        });
      }

      const profile = await Store.findOrCreateTelegramProfile({
        id,
        first_name,
        last_name,
        username,
        photo_url
      });

      const streamer = await Store.findStreamerByUserId(profile.id);

      const token = jwt.sign(
        { id: profile.id, email: profile.email, role: profile.role || 'STREAMER', username: profile.username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const { password_hash, ...safeProfile } = profile;

      return res.json({
        success: true,
        message: 'Logged in successfully via Telegram.',
        data: {
          token,
          user: safeProfile,
          streamer: streamer || null
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();

