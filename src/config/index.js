require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 5005,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:5005',
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_secret_key_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  supabase: {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
    jwksUrl: process.env.SUPABASE_JWKS_URL || 'https://pedgwofayqorxdimbquv.supabase.co/auth/v1/.well-known/jwks.json',
    oauthAuthorizeUrl: process.env.SUPABASE_OAUTH_AUTHORIZE_URL || 'https://pedgwofayqorxdimbquv.supabase.co/auth/v1/oauth/authorize',
    oauthTokenUrl: process.env.SUPABASE_OAUTH_TOKEN_URL || 'https://pedgwofayqorxdimbquv.supabase.co/auth/v1/oauth/token',
    openidConfigurationUrl: process.env.SUPABASE_OPENID_CONFIGURATION_URL || 'https://pedgwofayqorxdimbquv.supabase.co/auth/v1/.well-known/openid-configuration'
  },


  aba: {
    merchantId: process.env.ABA_MERCHANT_ID || 'ec438912',
    apiKey: process.env.ABA_API_KEY || 'sandbox_api_key',
    publicKey: process.env.ABA_PUBLIC_KEY || '',
    privateKey: process.env.ABA_PRIVATE_KEY || '',
    apiUrl: process.env.ABA_API_URL || 'https://checkout-sandbox.payway.com.kh/api/webrequest/',
    environment: process.env.ABA_ENVIRONMENT || 'sandbox'
  },
  bakong: {
    apiUrl: process.env.BAKONG_API_URL || 'https://api-bakong.nbc.gov.kh/v1',
    token: process.env.BAKONG_TOKEN || '',
    merchantId: process.env.BAKONG_MERCHANT_ID || 'zoee_donation@abaa',
    merchantName: process.env.BAKONG_MERCHANT_NAME || 'Zoee Donation'
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'darastore_bot'
  },
  cutluy: {
    apiKey: process.env.CUTLUY_API_KEY || 'ck_live_zqlY_ZZbxkCD0c80W8ltXOuiljORdeG_',
    webhookSecret: process.env.CUTLUY_WEBHOOK_SECRET || '',
    apiUrl: process.env.CUTLUY_API_URL || 'https://cutluy.com/v1'
  }
};

module.exports = config;
