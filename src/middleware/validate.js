function validateRegister(req, res, next) {
  const { email, username, password } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'A valid email address is required.'
    });
  }

  if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({
      success: false,
      message: 'Username must be 3-30 characters long and contain only letters, numbers, and underscores.'
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long.'
    });
  }

  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.'
    });
  }
  next();
}

function validateDonation(req, res, next) {
  const { streamerSlug, amount } = req.body;

  if (!streamerSlug || typeof streamerSlug !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Streamer username/slug is required.'
    });
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Donation amount must be greater than 0.'
    });
  }

  next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateDonation
};
