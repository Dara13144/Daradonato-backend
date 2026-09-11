const xss = require('xss');

const xssOptions = {
  whiteList: {}, // Strip all HTML tags
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style', 'xml']
};

class SanitizerService {
  /**
   * Sanitize text messages against XSS, HTML injections, and excessive whitespace
   */
  sanitizeText(input, maxLength = 255) {
    if (!input || typeof input !== 'string') return '';
    
    // 1. Strip HTML tags
    let cleaned = xss(input, xssOptions).trim();
    
    // 2. Remove control characters
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 3. Enforce maximum length
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
    }

    return cleaned;
  }

  /**
   * Sanitize donor name
   */
  sanitizeDonorName(input, anonymous = false) {
    if (anonymous) return 'Anonymous';
    if (!input || typeof input !== 'string' || !input.trim()) return 'Anonymous';
    const cleaned = xss(input, xssOptions).trim();
    return cleaned.slice(0, 50) || 'Anonymous';
  }

  /**
   * Validate alphanumeric slug for streamer username
   */
  isValidSlug(slug) {
    return /^[a-zA-Z0-9_]{3,30}$/.test(slug);
  }
}

module.exports = new SanitizerService();
