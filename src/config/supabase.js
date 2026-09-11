const { createClient } = require('@supabase/supabase-js');
const config = require('./index');

let supabase = null;
let isConfigured = false;

if (config.supabase.url && config.supabase.serviceRoleKey) {
  try {
    supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    isConfigured = true;
    console.log('✅ Supabase client initialized with Service Role credentials.');
  } catch (err) {
    console.warn('⚠️ Supabase client initialization failed, falling back to local store mode:', err.message);
  }
} else {
  console.log('ℹ️ Supabase credentials not set in .env. Running in local reactive store mode.');
}

module.exports = {
  supabase,
  isConfigured
};
