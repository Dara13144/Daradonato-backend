const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { supabase, isConfigured } = require('../config/supabase');

// In-memory data store for local dev & testing fallback
const memoryDb = {
  profiles: [],
  streamers: [],
  donations: [],
  payment_transactions: [],
  donation_goals: [],
  alert_settings: [],
  leaderboard_settings: [],
  donation_page_settings: [],
  ticker_settings: [],
  telegram_connections: [],
  telegram_login_sessions: [],
  audit_logs: [],
  system_settings: {
    platform_info: {
      name: 'Zoee Donation',
      tagline: 'The Premier Live-Stream Donation Platform for Creators',
      currency: 'USD',
      supported_currencies: ['USD', 'KHR'],
      khr_exchange_rate: 4100,
      platform_fee_percent: 0.0,
      maintenance_mode: false
    },
    payment_gateways: {
      aba_payway: { enabled: true, name: 'ABA PayWay', type: 'qr_card' },
      bakong_khqr: { enabled: true, name: 'Bakong KHQR', type: 'khqr' },
      wing: { enabled: true, name: 'Wing Bank', type: 'qr' },
      truemoney: { enabled: true, name: 'TrueMoney', type: 'wallet' }
    }
  }
};

// Password hash caches (as Supabase profiles table does not store password_hash)
const passwordHashesByEmail = new Map();
const passwordHashesById = new Map();

// Seed initial memory data
function initSeedData() {
  const adminPasswordHash = bcrypt.hashSync('Admin@123456', 10);
  const daraPasswordHash = bcrypt.hashSync('Streamer@123456', 10);

  passwordHashesByEmail.set('admin@daradonation.com', adminPasswordHash);
  passwordHashesByEmail.set('admin@zoeedonation.com', adminPasswordHash);
  passwordHashesByEmail.set('dara@stream.com', daraPasswordHash);
  passwordHashesById.set('a0000000-0000-0000-0000-000000000001', adminPasswordHash);
  passwordHashesById.set('b0000000-0000-0000-0000-000000000001', daraPasswordHash);

  // Admin
  memoryDb.profiles.push({
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'admin@zoeedonation.com',
    password_hash: adminPasswordHash,
    username: 'admin',
    display_name: 'Zoee Admin',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    bio: 'Platform Administrator and Security Manager',
    role: 'ADMIN',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Demo Streamer 1: Dara Gaming
  memoryDb.profiles.push({
    id: 'b0000000-0000-0000-0000-000000000001',
    email: 'dara@stream.com',
    password_hash: daraPasswordHash,
    username: 'dara_gaming',
    display_name: 'Dara Gaming KH',
    avatar_url: '/zoee-avatar.png',
    banner_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200',
    bio: 'Full-time esports streamer & MLBB caster! Thank you for supporting the stream! ❤️',
    role: 'STREAMER',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  memoryDb.streamers.push({
    id: 'c0000000-0000-0000-0000-000000000001',
    user_id: 'b0000000-0000-0000-0000-000000000001',
    slug: 'dara_gaming',
    donation_enabled: true,
    min_donation_amount: 1.00,
    currency: 'USD',
    total_received: 345.00,
    supporter_count: 28,
    social_links: {
      facebook: 'https://facebook.com',
      youtube: 'https://youtube.com',
      tiktok: 'https://tiktok.com'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  memoryDb.alert_settings.push({
    id: 'd0000000-0000-0000-0000-000000000001',
    streamer_id: 'c0000000-0000-0000-0000-000000000001',
    overlay_token: 'dara_overlay_secret_key_123',
    animation: 'neon',
    sound_url: 'chime',
    sound_volume: 0.85,
    tts_enabled: true,
    tts_voice: 'khmer_natural',
    tts_speed: 1.0,
    tts_template: '{donorName} បានឧបត្ថម្ភ {amount}។ អរគុណសម្រាប់ការគាំទ្រ! {message}',
    minimum_tts_amount: 1.00,
    duration: 8,
    custom_css: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  memoryDb.donation_goals.push({
    id: 'e0000000-0000-0000-0000-000000000001',
    streamer_id: 'c0000000-0000-0000-0000-000000000001',
    title: 'Upgrade Stream Cam to Sony A6700 📸',
    description: 'Helping improve the video quality for tournament broadcasts!',
    target_amount: 1000.00,
    current_amount: 345.00,
    start_date: new Date().toISOString(),
    end_date: null,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  memoryDb.leaderboard_settings.push({
    id: 'f0000000-0000-0000-0000-000000000001',
    user_id: 'b0000000-0000-0000-0000-000000000001',
    streamer_id: 'c0000000-0000-0000-0000-000000000001',
    enabled: true,
    title: 'Top Supporters',
    description: 'Thank you to everyone supporting the stream! ❤️',
    ranking_type: 'Total Donations',
    time_period: 'All Time',
    max_entries: 10,
    show_rank: true,
    show_avatar: true,
    show_username: true,
    show_amount: true,
    show_donation_count: true,
    anonymous_mode: 'Show Anonymous',
    currency: 'USD ($)',
    number_format: '1,000.00',
    layout: 'Card',
    theme: 'Glow Neon (Default)',
    font: 'Outfit (Recommended)',
    font_size: 'Medium',
    highlight_top3: true,
    top3_style: 'Gold / Silver / Bronze',
    animation_enabled: true,
    animation_style: 'Glow',
    refresh_interval: '5 seconds',
    empty_message: 'No donations yet. Be the first supporter!',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  memoryDb.donation_page_settings.push({
    id: 'h0000000-0000-0000-0000-000000000001',
    user_id: 'b0000000-0000-0000-0000-000000000001',
    streamer_id: 'c0000000-0000-0000-0000-000000000001',
    enabled: true,
    title: 'Donate For Dara Gaming KH ❤️',
    description: 'Support Dara by sending a donation! Your support helps improve stream broadcasts, new tournaments, and gaming gear. All donations trigger live voice alerts on stream!',
    currency: 'USD',
    min_amount: 1.00,
    max_amount: 5000.00,
    preset_amounts: [1, 5, 10, 20, 50, 100],
    custom_amount_enabled: true,
    anonymous_enabled: true,
    show_donor_name: true,
    show_donor_email: true,
    show_donor_message: true,
    show_recent_donations: true,
    show_social_links: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  memoryDb.ticker_settings.push({
    id: 'g0000000-0000-0000-0000-000000000001',
    user_id: 'b0000000-0000-0000-0000-000000000001',
    streamer_id: 'c0000000-0000-0000-0000-000000000001',
    enabled: true,
    theme: 'Gaming',
    animation: 'Scroll Left',
    direction: 'left',
    speed: 40,
    font_size: 'Medium',
    font_weight: 'Bold',
    show_avatar: true,
    show_name: true,
    show_amount: true,
    show_message: true,
    show_currency: true,
    max_donations: 15,
    show_latest: true,
    show_largest: false,
    show_today: false,
    custom_text: '🎉 Live Supporter Feed •',
    avatar_size: 'Medium',
    spacing: 32,
    height: 64,
    pause_on_hover: true,
    infinite_loop: true,
    anonymous_mode: 'Show Anonymous',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Demo Streamer 2: Sreyneang Music
  memoryDb.profiles.push({
    id: 'b0000000-0000-0000-0000-000000000002',
    email: 'sreyneang@music.com',
    password_hash: daraPasswordHash,
    username: 'sreyneang_live',
    display_name: 'Sreyneang Acoustic',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    banner_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200',
    bio: 'Acoustic covers, live guitar requests & relaxing vibes every weekend 🎸✨',
    role: 'STREAMER',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  memoryDb.streamers.push({
    id: 'c0000000-0000-0000-0000-000000000002',
    user_id: 'b0000000-0000-0000-0000-000000000002',
    slug: 'sreyneang_live',
    donation_enabled: true,
    min_donation_amount: 1.00,
    currency: 'USD',
    total_received: 180.00,
    supporter_count: 15,
    social_links: {
      facebook: 'https://facebook.com',
      youtube: 'https://youtube.com'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  memoryDb.alert_settings.push({
    id: 'd0000000-0000-0000-0000-000000000002',
    streamer_id: 'c0000000-0000-0000-0000-000000000002',
    overlay_token: 'sreyneang_overlay_secret_key_456',
    animation: 'bounce',
    sound_url: 'ding',
    sound_volume: 0.80,
    tts_enabled: true,
    tts_voice: 'default',
    tts_speed: 1.0,
    minimum_tts_amount: 2.00,
    duration: 7,
    custom_css: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Demo Donations
  const now = Date.now();
  memoryDb.donations.push(
    {
      id: crypto.randomUUID(),
      streamer_id: 'c0000000-0000-0000-0000-000000000001',
      donor_id: null,
      donor_name: 'Sokha MLBB Fan',
      amount: 25.00,
      currency: 'USD',
      message: 'Great gameplay brother! Keep up the energetic casting!',
      anonymous: false,
      payment_method: 'ABA_PAYWAY',
      transaction_id: 'TXN-DEMO-001',
      payment_status: 'PAID',
      alert_status: 'PLAYED',
      tts_enabled: true,
      created_at: new Date(now - 7200000).toISOString(),
      paid_at: new Date(now - 7200000).toISOString()
    },
    {
      id: crypto.randomUUID(),
      streamer_id: 'c0000000-0000-0000-0000-000000000001',
      donor_id: null,
      donor_name: 'Anonymous',
      amount: 50.00,
      currency: 'USD',
      message: 'Coffee boost for the all-night stream! ☕🔥',
      anonymous: true,
      payment_method: 'BAKONG_KHQR',
      transaction_id: 'TXN-DEMO-002',
      payment_status: 'PAID',
      alert_status: 'PLAYED',
      tts_enabled: true,
      created_at: new Date(now - 18000000).toISOString(),
      paid_at: new Date(now - 18000000).toISOString()
    },
    {
      id: crypto.randomUUID(),
      streamer_id: 'c0000000-0000-0000-0000-000000000001',
      donor_id: null,
      donor_name: 'Vibol Gamer',
      amount: 10.00,
      currency: 'USD',
      message: 'Love the commentary today!',
      anonymous: false,
      payment_method: 'ABA_PAYWAY',
      transaction_id: 'TXN-DEMO-003',
      payment_status: 'PAID',
      alert_status: 'PLAYED',
      tts_enabled: true,
      created_at: new Date(now - 86400000).toISOString(),
      paid_at: new Date(now - 86400000).toISOString()
    }
  );
}

initSeedData();

// Repository functions
const Store = {
  // Profiles
  async findProfileByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    if (isConfigured) {
      let { data, error } = await supabase.from('profiles').select('*').eq('email', cleanEmail).maybeSingle();
      if (!data && (cleanEmail === 'admin@zoeedonation.com' || cleanEmail === 'admin@daradonation.com')) {
        const altEmail = cleanEmail === 'admin@zoeedonation.com' ? 'admin@daradonation.com' : 'admin@zoeedonation.com';
        const alt = await supabase.from('profiles').select('*').eq('email', altEmail).maybeSingle();
        if (alt.data) data = alt.data;
      }
      if (error) throw error;
      if (data && !data.password_hash) {
        data.password_hash = passwordHashesByEmail.get(cleanEmail) || passwordHashesByEmail.get(data.email?.toLowerCase()) || passwordHashesById.get(data.id) || null;
      }
      return data;
    }
    const mem = memoryDb.profiles.find(p => p.email.toLowerCase() === cleanEmail || (
      (cleanEmail === 'admin@zoeedonation.com' || cleanEmail === 'admin@daradonation.com') &&
      (p.email.toLowerCase() === 'admin@zoeedonation.com' || p.email.toLowerCase() === 'admin@daradonation.com')
    )) || null;
    if (mem && !mem.password_hash) {
      mem.password_hash = passwordHashesByEmail.get(cleanEmail) || passwordHashesById.get(mem.id) || null;
    }
    return mem;
  },

  async findProfileByUsername(username) {
    if (!username) return null;
    const cleanUsername = username.toLowerCase().trim();
    if (isConfigured) {
      const { data, error } = await supabase.from('profiles').select('*').eq('username', cleanUsername).maybeSingle();
      if (error) throw error;
      if (data && !data.password_hash) {
        data.password_hash = passwordHashesByEmail.get(data.email?.toLowerCase()) || passwordHashesById.get(data.id) || null;
      }
      return data;
    }
    const mem = memoryDb.profiles.find(p => p.username.toLowerCase() === cleanUsername) || null;
    if (mem && !mem.password_hash) {
      mem.password_hash = passwordHashesByEmail.get(mem.email?.toLowerCase()) || passwordHashesById.get(mem.id) || null;
    }
    return mem;
  },

  async findProfileById(id) {
    if (!id) return null;
    if (isConfigured) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (data && !data.password_hash) {
        data.password_hash = passwordHashesById.get(id) || passwordHashesByEmail.get(data.email?.toLowerCase()) || null;
      }
      return data;
    }
    const mem = memoryDb.profiles.find(p => p.id === id) || null;
    if (mem && !mem.password_hash) {
      mem.password_hash = passwordHashesById.get(id) || passwordHashesByEmail.get(mem.email?.toLowerCase()) || null;
    }
    return mem;
  },

  async createProfile(profileData) {
    const newProfile = {
      id: profileData.id || crypto.randomUUID(),
      auth_user_id: profileData.auth_user_id || null,
      email: profileData.email.toLowerCase(),
      password_hash: profileData.password_hash,
      username: profileData.username.toLowerCase(),
      display_name: profileData.display_name || profileData.username,
      avatar_url: profileData.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      banner_url: profileData.banner_url || null,
      bio: profileData.bio || '',
      role: profileData.role || 'USER',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (profileData.password_hash) {
      passwordHashesByEmail.set(newProfile.email.toLowerCase(), profileData.password_hash);
      if (newProfile.id) {
        passwordHashesById.set(newProfile.id, profileData.password_hash);
      }
    }

    if (isConfigured) {
      const { password_hash, telegram_id, telegram_username, ...supabaseProfileData } = newProfile;
      const { data, error } = await supabase.from('profiles').insert(supabaseProfileData).select().single();
      if (error) throw error;
      if (data) {
        if (profileData.password_hash) data.password_hash = profileData.password_hash;
        if (telegram_id) data.telegram_id = telegram_id;
        if (telegram_username) data.telegram_username = telegram_username;
      }
      return data;
    }

    memoryDb.profiles.push(newProfile);
    return newProfile;
  },


  async findOrCreateGoogleProfile({ googleId, email, displayName, avatarUrl }) {
    let profile = await this.findProfileByEmail(email);
    if (!profile) {
      // Generate clean unique username
      let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'user';
      let username = baseUsername;
      let counter = 1;
      while (await this.findProfileByUsername(username)) {
        username = `${baseUsername}_${counter}`;
        counter++;
      }

      profile = await this.createProfile({
        email: email.toLowerCase(),
        username,
        display_name: displayName || username,
        password_hash: '$2a$10$google_oauth_authenticated_dummy_hash_zoee',
        avatar_url: avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        role: 'USER'
      });
    } else if (avatarUrl && (!profile.avatar_url || profile.avatar_url.includes('placeholder') || profile.avatar_url.includes('default'))) {
      profile = await this.updateProfile(profile.id, { avatar_url: avatarUrl });
    }
    return profile;
  },

  async updateProfile(id, updates) {
    const { password_hash, telegram_id, telegram_username, ...restUpdates } = updates;
    if (password_hash) {
      passwordHashesById.set(id, password_hash);
      const existing = await this.findProfileById(id);
      if (existing?.email) {
        passwordHashesByEmail.set(existing.email.toLowerCase(), password_hash);
      }
    }

    const updatePayload = {
      ...restUpdates,
      updated_at: new Date().toISOString()
    };

    if (isConfigured) {
      const { data, error } = await supabase.from('profiles').update(updatePayload).eq('id', id).select().single();
      if (error) throw error;
      if (data) {
        data.password_hash = password_hash || passwordHashesById.get(id) || null;
        if (telegram_id) data.telegram_id = telegram_id;
        if (telegram_username) data.telegram_username = telegram_username;
      }
      return data;
    }

    const index = memoryDb.profiles.findIndex(p => p.id === id);
    if (index === -1) return null;
    memoryDb.profiles[index] = { ...memoryDb.profiles[index], ...updatePayload };
    if (password_hash) {
      memoryDb.profiles[index].password_hash = password_hash;
    }
    return memoryDb.profiles[index];
  },

  async getAllProfiles(filters = {}) {
    let list = [...memoryDb.profiles];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p => p.username.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.display_name.toLowerCase().includes(q));
    }
    if (filters.role) {
      list = list.filter(p => p.role === filters.role);
    }
    if (filters.status) {
      list = list.filter(p => p.status === filters.status);
    }
    return list;
  },

  // Streamers
  async findStreamerByUserId(userId) {
    if (!userId) return null;
    if (isConfigured) {
      let { data, error } = await supabase.from('streamers').select('*, profiles(*)').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (prof) {
          const newStreamer = {
            user_id: prof.id,
            slug: (prof.username || 'streamer').toLowerCase(),
            donation_enabled: true,
            min_donation_amount: 1.00,
            currency: 'USD',
            total_received: 0.00,
            supporter_count: 0,
            social_links: {}
          };
          const { data: created } = await supabase.from('streamers').insert(newStreamer).select('*, profiles(*)').single();
          data = created;
        }
      }
      if (data) {
        const profile = data.profiles || data.profile;
        return this.formatStreamer({ ...data, profile });
      }
      return null;
    }
    let streamer = memoryDb.streamers.find(s => s.user_id === userId);
    if (!streamer) {
      const prof = memoryDb.profiles.find(p => p.id === userId);
      if (prof) {
        streamer = {
          id: 'streamer-' + prof.id,
          user_id: prof.id,
          slug: prof.username.toLowerCase(),
          donation_enabled: true,
          min_donation_amount: 1.00,
          currency: 'USD',
          total_received: 0.00,
          supporter_count: 0,
          social_links: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        memoryDb.streamers.push(streamer);
      }
    }
    if (streamer) {
      const profile = memoryDb.profiles.find(p => p.id === streamer.user_id);
      return this.formatStreamer({ ...streamer, profile });
    }
    return null;
  },

  async findStreamerBySlug(slug) {
    if (!slug) return null;
    const clean = slug.toLowerCase().replace(/^@/, '');
    if (isConfigured) {
      const { data, error } = await supabase.from('streamers').select('*, profiles(*)').eq('slug', clean).maybeSingle();
      if (error) throw error;
      if (data) {
        const profile = data.profiles || data.profile;
        return this.formatStreamer({ ...data, profile });
      }
      const { data: profData } = await supabase.from('profiles').select('*').eq('username', clean).maybeSingle();
      if (profData) {
        let { data: stData } = await supabase.from('streamers').select('*, profiles(*)').eq('user_id', profData.id).maybeSingle();
        if (!stData) {
          const newStreamer = {
            user_id: profData.id,
            slug: (profData.username || clean).toLowerCase(),
            donation_enabled: true,
            min_donation_amount: 1.00,
            currency: 'USD',
            total_received: 0.00,
            supporter_count: 0,
            social_links: {}
          };
          const { data: created } = await supabase.from('streamers').insert(newStreamer).select('*, profiles(*)').single();
          stData = created;
        }
        if (stData) {
          const profile = stData.profiles || stData.profile || profData;
          return this.formatStreamer({ ...stData, profile });
        }
      }
      return null;
    }
    let streamer = memoryDb.streamers.find(s => s.slug.toLowerCase() === clean);
    if (!streamer) {
      const prof = memoryDb.profiles.find(p => p.username && p.username.toLowerCase() === clean);
      if (prof) {
        streamer = memoryDb.streamers.find(s => s.user_id === prof.id);
        if (!streamer) {
          streamer = {
            id: 'streamer-' + prof.id,
            user_id: prof.id,
            slug: prof.username.toLowerCase(),
            donation_enabled: true,
            min_donation_amount: 1.00,
            currency: 'USD',
            total_received: 0.00,
            supporter_count: 0,
            social_links: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          memoryDb.streamers.push(streamer);
        }
      }
    }
    if (!streamer) return null;
    const profile = memoryDb.profiles.find(p => p.id === streamer.user_id) || {
      id: streamer.user_id,
      display_name: streamer.slug,
      username: streamer.slug,
      avatar_url: '/zoee-avatar.png'
    };
    return this.formatStreamer({ ...streamer, profile });
  },


  async findStreamerById(id) {
    if (isConfigured) {
      const { data, error } = await supabase.from('streamers').select('*, profiles(*)').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return this.formatStreamer({ ...data, profile: data.profiles || data.profile });
    }
    const streamer = memoryDb.streamers.find(s => s.id === id);
    if (!streamer) return null;
    const profile = memoryDb.profiles.find(p => p.id === streamer.user_id);
    return this.formatStreamer({ ...streamer, profile });
  },

  async createStreamer(streamerData) {
    const newStreamer = {
      id: crypto.randomUUID(),
      user_id: streamerData.user_id,
      slug: streamerData.slug.toLowerCase(),
      donation_enabled: streamerData.donation_enabled !== false,
      min_donation_amount: Number(streamerData.min_donation_amount) || 1.00,
      currency: streamerData.currency || 'USD',
      total_received: 0.00,
      supporter_count: 0,
      social_links: streamerData.social_links || {},
      aba_payway_link: streamerData.aba_payway_link || '',
      aba_qr_url: streamerData.aba_qr_url || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isConfigured) {
      const { data, error } = await supabase.from('streamers').insert(newStreamer).select().single();
      if (error) throw error;
      return data;
    }

    memoryDb.streamers.push(newStreamer);

    // Create default alert settings
    const alertSetting = {
      id: crypto.randomUUID(),
      streamer_id: newStreamer.id,
      overlay_token: crypto.randomBytes(16).toString('hex'),
      animation: 'neon',
      sound_url: 'chime',
      sound_volume: 0.8,
      tts_enabled: true,
      tts_voice: 'default',
      tts_speed: 1.0,
      minimum_tts_amount: 1.00,
      duration: 8,
      custom_css: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryDb.alert_settings.push(alertSetting);

    return newStreamer;
  },

  formatStreamer(streamer) {
    if (!streamer) return null;
    const aba = streamer.social_links?.aba || {};
    const bakong = streamer.social_links?.bakong || {};
    return {
      ...streamer,
      aba_account_name: streamer.aba_account_name || aba.account_name || '',
      aba_account_number: streamer.aba_account_number || aba.account_number || '',
      aba_payway_link: streamer.aba_payway_link || aba.payway_link || streamer.social_links?.aba_payway_link || '',
      aba_qr_url: streamer.aba_qr_url || aba.qr_url || streamer.social_links?.aba_qr_url || '',
      aba_merchant_id: streamer.aba_merchant_id || aba.merchant_id || '',
      aba_api_key: streamer.aba_api_key || aba.api_key || '',
      aba_instructions: streamer.aba_instructions || aba.donor_instructions || '',
      aba_enabled: streamer.aba_enabled !== false && aba.enabled !== false,
      aba_mode: streamer.aba_mode || aba.mode || 'DIRECT_LINK',
      aba_environment: streamer.aba_environment || aba.environment || 'sandbox',
      bakong_id: streamer.bakong_id || bakong.account_id || streamer.social_links?.bakong_id || '',
      bakong_name: streamer.bakong_name || bakong.merchant_name || streamer.social_links?.bakong_name || '',
      bakong_enabled: streamer.bakong_enabled !== false && bakong.enabled !== false
    };
  },

  async updateStreamer(id, updates) {
    const {
      aba_account_name,
      aba_account_number,
      aba_merchant_id,
      aba_api_key,
      aba_instructions,
      aba_mode,
      aba_enabled,
      aba_environment,
      aba_payway_link,
      aba_qr_url,
      bakong_id,
      bakong_name,
      bakong_enabled,
      ...directUpdates
    } = updates;

    // Merge ABA & Bakong fields safely into social_links so Supabase schema error never occurs
    let existingStreamer = memoryDb.streamers.find(s => s.id === id);
    if (!existingStreamer && isConfigured) {
      try {
        const { data } = await supabase.from('streamers').select('*').eq('id', id).maybeSingle();
        if (data) existingStreamer = data;
      } catch (_) {}
    }

    const currentSocial = existingStreamer?.social_links || {};
    const updatedSocial = {
      ...currentSocial,
      ...(updates.social_links || {}),
      aba: {
        ...(currentSocial.aba || {}),
        ...(aba_account_name !== undefined && { account_name: aba_account_name }),
        ...(aba_account_number !== undefined && { account_number: aba_account_number }),
        ...(aba_merchant_id !== undefined && { merchant_id: aba_merchant_id }),
        ...(aba_api_key !== undefined && { api_key: aba_api_key }),
        ...(aba_instructions !== undefined && { donor_instructions: aba_instructions }),
        ...(aba_mode !== undefined && { mode: aba_mode }),
        ...(aba_enabled !== undefined && { enabled: aba_enabled }),
        ...(aba_environment !== undefined && { environment: aba_environment }),
        ...(aba_payway_link !== undefined && { payway_link: aba_payway_link }),
        ...(aba_qr_url !== undefined && { qr_url: aba_qr_url })
      },
      bakong: {
        ...(currentSocial.bakong || {}),
        ...(bakong_id !== undefined && { account_id: bakong_id }),
        ...(bakong_name !== undefined && { merchant_name: bakong_name }),
        ...(bakong_enabled !== undefined && { enabled: bakong_enabled })
      }
    };

    const updatePayload = {
      ...directUpdates,
      social_links: updatedSocial,
      updated_at: new Date().toISOString()
    };

    if (isConfigured) {
      const safeSupabasePayload = {
        donation_enabled: updatePayload.donation_enabled,
        min_donation_amount: updatePayload.min_donation_amount,
        currency: updatePayload.currency,
        social_links: updatedSocial,
        updated_at: updatePayload.updated_at
      };
      Object.keys(safeSupabasePayload).forEach(k => safeSupabasePayload[k] === undefined && delete safeSupabasePayload[k]);

      const { data, error } = await supabase.from('streamers').update(safeSupabasePayload).eq('id', id).select().single();
      if (error) throw error;
      return this.formatStreamer({ ...data, ...updates, social_links: updatedSocial });
    }

    const index = memoryDb.streamers.findIndex(s => s.id === id);
    if (index === -1) return null;
    memoryDb.streamers[index] = {
      ...memoryDb.streamers[index],
      ...updatePayload,
      ...updates,
      social_links: updatedSocial
    };
    return this.formatStreamer(memoryDb.streamers[index]);
  },

  async getAllStreamers(filters = {}) {
    let list = memoryDb.streamers.map(s => {
      const profile = memoryDb.profiles.find(p => p.id === s.user_id);
      return { ...s, profile };
    });

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(s => s.slug.includes(q) || (s.profile && (s.profile.display_name.toLowerCase().includes(q) || s.profile.username.toLowerCase().includes(q))));
    }

    return list;
  },

  // Donations
  async createDonation(donationData) {
    const newDonation = {
      id: crypto.randomUUID(),
      streamer_id: donationData.streamer_id,
      donor_id: donationData.donor_id || null,
      donor_name: donationData.anonymous ? 'Anonymous' : (donationData.donor_name || 'Anonymous'),
      amount: Number(donationData.amount),
      currency: donationData.currency || 'USD',
      message: donationData.message || '',
      media_url: donationData.media_url || null,
      anonymous: Boolean(donationData.anonymous),
      payment_method: donationData.payment_method,
      transaction_id: donationData.transaction_id,
      payment_status: 'PENDING',
      alert_status: 'PENDING',
      tts_enabled: donationData.tts_enabled !== false,
      created_at: new Date().toISOString(),
      paid_at: null
    };

    if (isConfigured) {
      const { data, error } = await supabase.from('donations').insert(newDonation).select().single();
      if (error) throw error;
      if (data) {
        memoryDb.donations.push(data);
      }
      return data;
    }

    memoryDb.donations.push(newDonation);
    return newDonation;
  },

  async findDonationByTransactionId(transactionId) {
    if (isConfigured) {
      try {
        const { data, error } = await supabase.from('donations').select('*').eq('transaction_id', transactionId).maybeSingle();
        if (!error && data) return data;
      } catch (err) {
        console.warn('Supabase findDonationByTransactionId notice:', err.message);
      }
    }
    return memoryDb.donations.find(d => d.transaction_id === transactionId) || null;
  },

  async findDonationById(id) {
    if (isConfigured) {
      try {
        const { data, error } = await supabase.from('donations').select('*').eq('id', id).maybeSingle();
        if (!error && data) return data;
      } catch (err) {
        console.warn('Supabase findDonationById notice:', err.message);
      }
    }
    return memoryDb.donations.find(d => d.id === id) || null;
  },

  async markDonationPaid(transactionId, paymentTxnMeta = {}) {
    const paidAt = new Date().toISOString();
    let donation = null;
    let streamer = null;
    let activeGoal = null;

    if (isConfigured) {
      const { data: dbDonation } = await supabase
        .from('donations')
        .select('*')
        .eq('transaction_id', transactionId)
        .maybeSingle();

      if (dbDonation) {
        if (dbDonation.payment_status === 'PAID') {
          return { donation: dbDonation, alreadyPaid: true };
        }

        const { data: updatedDonation } = await supabase
          .from('donations')
          .update({ payment_status: 'PAID', paid_at: paidAt })
          .eq('transaction_id', transactionId)
          .select()
          .single();

        donation = updatedDonation || { ...dbDonation, payment_status: 'PAID', paid_at: paidAt };

        // Update payment transaction record in Supabase
        await supabase
          .from('payment_transactions')
          .update({ status: 'PAID', updated_at: paidAt, metadata: paymentTxnMeta })
          .eq('transaction_id', transactionId);

        // Fetch streamer totals in Supabase (automatically updated by trg_handle_paid_donation)
        const { data: dbStreamer } = await supabase
          .from('streamers')
          .select('*')
          .eq('id', donation.streamer_id)
          .maybeSingle();

        streamer = dbStreamer;

        // Active goal update in Supabase (automatically updated by trg_handle_paid_donation)
        const { data: dbGoal } = await supabase
          .from('donation_goals')
          .select('*')
          .eq('streamer_id', donation.streamer_id)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        activeGoal = dbGoal;
      }
    }

    // Always keep memoryDb updated / fallback
    const memDonation = memoryDb.donations.find(d => d.transaction_id === transactionId);
    if (memDonation) {
      if (memDonation.payment_status === 'PAID') {
        return { donation: memDonation, alreadyPaid: true };
      }
      memDonation.payment_status = 'PAID';
      memDonation.paid_at = paidAt;

      const pTxn = memoryDb.payment_transactions.find(pt => pt.transaction_id === transactionId);
      if (pTxn) {
        pTxn.status = 'PAID';
        pTxn.updated_at = paidAt;
        pTxn.metadata = { ...pTxn.metadata, ...paymentTxnMeta };
      }

      const memStreamer = memoryDb.streamers.find(s => s.id === memDonation.streamer_id);
      if (memStreamer) {
        memStreamer.total_received = (Number(memStreamer.total_received) || 0) + memDonation.amount;
        memStreamer.supporter_count = (memStreamer.supporter_count || 0) + 1;
        memStreamer.updated_at = paidAt;
        if (!streamer) streamer = memStreamer;
      }

      const memGoal = memoryDb.donation_goals.find(g => g.streamer_id === memDonation.streamer_id && g.status === 'ACTIVE');
      if (memGoal) {
        memGoal.current_amount = (Number(memGoal.current_amount) || 0) + memDonation.amount;
        memGoal.updated_at = paidAt;
        if (!activeGoal) activeGoal = memGoal;
      }

      if (!donation) donation = memDonation;
    }

    if (!donation) return null;
    return { donation, streamer, activeGoal, alreadyPaid: false };
  },

  async markDonationExpired(transactionId) {
    if (isConfigured) {
      await supabase
        .from('donations')
        .update({ payment_status: 'EXPIRED' })
        .eq('transaction_id', transactionId)
        .neq('payment_status', 'PAID');
      await supabase
        .from('payment_transactions')
        .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
        .eq('transaction_id', transactionId);
    }
    const donation = memoryDb.donations.find(d => d.transaction_id === transactionId);
    if (!donation || donation.payment_status === 'PAID') return null;
    donation.payment_status = 'EXPIRED';

    const pTxn = memoryDb.payment_transactions.find(pt => pt.transaction_id === transactionId);
    if (pTxn) {
      pTxn.status = 'EXPIRED';
      pTxn.updated_at = new Date().toISOString();
    }
    return donation;
  },

  async markDonationFailed(transactionId, reason = '') {
    if (isConfigured) {
      await supabase
        .from('donations')
        .update({ payment_status: 'FAILED' })
        .eq('transaction_id', transactionId)
        .neq('payment_status', 'PAID');
      await supabase
        .from('payment_transactions')
        .update({ status: 'FAILED', updated_at: new Date().toISOString(), metadata: { fail_reason: reason } })
        .eq('transaction_id', transactionId);
    }
    const donation = memoryDb.donations.find(d => d.transaction_id === transactionId);
    if (!donation || donation.payment_status === 'PAID') return null;
    donation.payment_status = 'FAILED';

    const pTxn = memoryDb.payment_transactions.find(pt => pt.transaction_id === transactionId);
    if (pTxn) {
      pTxn.status = 'FAILED';
      pTxn.updated_at = new Date().toISOString();
      pTxn.metadata = { ...pTxn.metadata, fail_reason: reason };
    }
    return donation;
  },

  async getDonations(filters = {}, pagination = { page: 1, limit: 20 }) {
    let list = [...memoryDb.donations];

    if (filters.streamer_id) {
      list = list.filter(d => d.streamer_id === filters.streamer_id);
    }
    if (filters.payment_status) {
      list = list.filter(d => d.payment_status === filters.payment_status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(d => (d.donor_name && d.donor_name.toLowerCase().includes(q)) || d.transaction_id.toLowerCase().includes(q) || (d.message && d.message.toLowerCase().includes(q)));
    }

    // Sort descending by created_at / paid_at
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const page = Math.max(1, parseInt(pagination.page, 10) || 1);
    const limit = Math.max(1, parseInt(pagination.limit, 10) || 20);
    const startIndex = (page - 1) * limit;
    const paginated = list.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  // Payment Transactions
  async createPaymentTransaction(txnData) {
    const newTxn = {
      id: crypto.randomUUID(),
      donation_id: txnData.donation_id,
      transaction_id: txnData.transaction_id,
      provider: txnData.provider,
      provider_transaction_id: txnData.provider_transaction_id || null,
      amount: Number(txnData.amount),
      currency: txnData.currency || 'USD',
      status: 'PENDING',
      payment_url: txnData.payment_url || null,
      qr_data: txnData.qr_data || null,
      expires_at: txnData.expires_at || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      metadata: txnData.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isConfigured) {
      const { data, error } = await supabase.from('payment_transactions').insert(newTxn).select().single();
      if (error) throw error;
      return data;
    }

    memoryDb.payment_transactions.push(newTxn);
    return newTxn;
  },

  async findPaymentTransactionByTxnId(transactionId) {
    if (isConfigured) {
      try {
        const { data, error } = await supabase.from('payment_transactions').select('*').eq('transaction_id', transactionId).maybeSingle();
        if (!error && data) return data;
      } catch (err) {
        console.warn('Supabase findPaymentTransactionByTxnId notice:', err.message);
      }
    }
    return memoryDb.payment_transactions.find(pt => pt.transaction_id === transactionId) || null;
  },

  // Donation Goals
  async getActiveGoalByStreamerId(streamerId) {
    if (isConfigured) {
      const { data, error } = await supabase.from('donation_goals').select('*').eq('streamer_id', streamerId).eq('status', 'ACTIVE').maybeSingle();
      if (error) throw error;
      return data;
    }
    return memoryDb.donation_goals.find(g => g.streamer_id === streamerId && g.status === 'ACTIVE') || null;
  },

  async getGoalsByStreamerId(streamerId) {
    return memoryDb.donation_goals.filter(g => g.streamer_id === streamerId);
  },

  async createGoal(goalData) {
    const newGoal = {
      id: crypto.randomUUID(),
      streamer_id: goalData.streamer_id,
      title: goalData.title,
      description: goalData.description || '',
      target_amount: Number(goalData.target_amount),
      current_amount: Number(goalData.current_amount) || 0.00,
      start_date: goalData.start_date || new Date().toISOString(),
      end_date: goalData.end_date || null,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryDb.donation_goals.push(newGoal);
    return newGoal;
  },

  async updateGoal(id, updates) {
    const index = memoryDb.donation_goals.findIndex(g => g.id === id);
    if (index === -1) return null;
    memoryDb.donation_goals[index] = { ...memoryDb.donation_goals[index], ...updates, updated_at: new Date().toISOString() };
    return memoryDb.donation_goals[index];
  },

  // Alert Settings
  async getAlertSettingsByStreamerId(streamerId) {
    if (!streamerId) return null;
    let setting = memoryDb.alert_settings.find(a => a.streamer_id === streamerId);
    if (!setting) {
      setting = {
        id: crypto.randomUUID(),
        streamer_id: streamerId,
        overlay_token: crypto.randomBytes(16).toString('hex'),
        preset: 'cyber_gold',
        animation: 'neon',
        header_color: '#FFFFFF',
        background_color: 'transparent',
        border_color: '#FFAA00',
        glow_color: '#FFAA00',
        glow_size: 18,
        action_text: 'donated',
        bg_type: 'transparent',
        sound_url: 'chime',
        sound_volume: 0.85,
        video_volume: 0.8,
        duration: 8,
        tts_enabled: true,
        tts_voice: 'khmer_natural',
        tts_speed: 1.0,
        tts_volume: 0.8,
        tts_template: '{name} ឧបត្ថម្ភ {amount}! {message}',
        minimum_tts_amount: 1.00,
        custom_tiers: [
          { minAmount: 5, label: '$5+ Tier Alert', sound: 'cash' },
          { minAmount: 20, label: '$20+ VIP Alert', sound: 'victory' }
        ],
        custom_css: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.alert_settings.push(setting);
    } else {
      // Ensure any older settings have all modern styling properties
      if (!setting.preset) setting.preset = 'cyber_gold';
      if (!setting.header_color) setting.header_color = '#FFFFFF';
      if (!setting.border_color) setting.border_color = '#FFAA00';
      if (!setting.glow_color) setting.glow_color = '#FFAA00';
      if (setting.glow_size === undefined) setting.glow_size = 18;
      if (!setting.action_text) setting.action_text = 'donated';
      if (!setting.tts_template) setting.tts_template = '{name} ឧបត្ថម្ភ {amount}! {message}';
    }
    return setting;
  },

  async getAlertSettingsByToken(overlayToken) {
    if (!overlayToken) return null;
    const setting = memoryDb.alert_settings.find(a => a.overlay_token === overlayToken) || null;
    if (setting) {
      if (!setting.preset) setting.preset = 'cyber_gold';
      if (!setting.header_color) setting.header_color = '#FFFFFF';
      if (!setting.border_color) setting.border_color = '#FFAA00';
      if (!setting.glow_color) setting.glow_color = '#FFAA00';
      if (setting.glow_size === undefined) setting.glow_size = 18;
      if (!setting.action_text) setting.action_text = 'donated';
      if (!setting.tts_template) setting.tts_template = '{name} ឧបត្ថម្ភ {amount}! {message}';
    }
    return setting;
  },

  async updateAlertSettings(streamerId, updates) {
    let setting = memoryDb.alert_settings.find(a => a.streamer_id === streamerId);
    if (!setting) {
      setting = {
        id: crypto.randomUUID(),
        streamer_id: streamerId,
        overlay_token: crypto.randomBytes(16).toString('hex'),
        preset: 'cyber_gold',
        animation: 'neon',
        header_color: '#FFFFFF',
        background_color: 'transparent',
        border_color: '#FFAA00',
        glow_color: '#FFAA00',
        glow_size: 18,
        action_text: 'donated',
        bg_type: 'transparent',
        sound_url: 'chime',
        sound_volume: 0.85,
        video_volume: 0.8,
        duration: 8,
        tts_enabled: true,
        tts_voice: 'khmer_natural',
        tts_speed: 1.0,
        tts_volume: 0.8,
        tts_template: '{name} ឧបត្ថម្ភ {amount}! {message}',
        minimum_tts_amount: 1.00,
        custom_tiers: [
          { minAmount: 5, label: '$5+ Tier Alert', sound: 'cash' },
          { minAmount: 20, label: '$20+ VIP Alert', sound: 'victory' }
        ],
        custom_css: '',
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.alert_settings.push(setting);
      return setting;
    }
    Object.assign(setting, updates, { updated_at: new Date().toISOString() });
    return setting;
  },

  // Leaderboard Settings
  async getLeaderboardSettingsByStreamerId(streamerId) {
    if (isConfigured) {
      const { data } = await supabase.from('leaderboard_settings').select('*').eq('streamer_id', streamerId).maybeSingle();
      if (data) return data;
    }
    return memoryDb.leaderboard_settings.find(l => l.streamer_id === streamerId) || null;
  },

  async getLeaderboardSettingsByUserId(userId) {
    if (isConfigured) {
      const { data } = await supabase.from('leaderboard_settings').select('*').eq('user_id', userId).maybeSingle();
      if (data) return data;
    }

    let setting = memoryDb.leaderboard_settings.find(l => l.user_id === userId);
    if (!setting) {
      const streamer = memoryDb.streamers.find(s => s.user_id === userId);
      setting = {
        id: crypto.randomUUID(),
        user_id: userId,
        streamer_id: streamer ? streamer.id : null,
        enabled: true,
        title: 'Top Supporters',
        description: 'Thank you to everyone supporting the stream! ❤️',
        ranking_type: 'Total Donations',
        time_period: 'All Time',
        default_period: 'All Time',
        max_entries: 10,
        show_rank: true,
        show_avatar: true,
        show_username: true,
        show_amount: true,
        show_donation_count: true,
        anonymous_mode: 'Show Anonymous',
        currency: 'USD ($)',
        number_format: '1,000.00',
        layout: 'Card',
        theme: 'Gaming',
        avatar_size: 'Medium',
        font: 'Outfit (Recommended)',
        font_size: 'Medium',
        highlight_top3: true,
        top3_style: 'Gold / Silver / Bronze',
        show_crown: true,
        show_rank_badge: true,
        show_glow: true,
        animation_enabled: true,
        animation_style: 'Glow',
        animation_speed: 'Normal',
        refresh_interval: '5 seconds',
        empty_message: 'No donations yet. Be the first supporter!',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.leaderboard_settings.push(setting);
    }
    return setting;
  },

  async updateLeaderboardSettings(userId, updates) {
    if (isConfigured) {
      const { data, error } = await supabase.from('leaderboard_settings').upsert({
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString()
      }).select().single();
      if (!error && data) return data;
    }

    let setting = memoryDb.leaderboard_settings.find(l => l.user_id === userId);
    if (!setting) {
      const streamer = memoryDb.streamers.find(s => s.user_id === userId);
      setting = {
        id: crypto.randomUUID(),
        user_id: userId,
        streamer_id: streamer ? streamer.id : null,
        enabled: true,
        title: 'Top Supporters',
        description: 'Thank you to everyone supporting the stream! ❤️',
        ranking_type: 'Total Donations',
        time_period: 'All Time',
        default_period: 'All Time',
        max_entries: 10,
        show_rank: true,
        show_avatar: true,
        show_username: true,
        show_amount: true,
        show_donation_count: true,
        anonymous_mode: 'Show Anonymous',
        currency: 'USD ($)',
        number_format: '1,000.00',
        layout: 'Card',
        theme: 'Gaming',
        avatar_size: 'Medium',
        font: 'Outfit (Recommended)',
        font_size: 'Medium',
        highlight_top3: true,
        top3_style: 'Gold / Silver / Bronze',
        show_crown: true,
        show_rank_badge: true,
        show_glow: true,
        animation_enabled: true,
        animation_style: 'Glow',
        animation_speed: 'Normal',
        refresh_interval: '5 seconds',
        empty_message: 'No donations yet. Be the first supporter!',
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.leaderboard_settings.push(setting);
      return setting;
    }
    Object.assign(setting, updates, { updated_at: new Date().toISOString() });
    return setting;
  },

  async resetLeaderboardSettings(userId) {
    const defaultSettings = {
      enabled: true,
      title: 'Top Supporters',
      description: 'Thank you to everyone supporting the stream! ❤️',
      ranking_type: 'Total Donations',
      time_period: 'All Time',
      default_period: 'All Time',
      max_entries: 10,
      show_rank: true,
      show_avatar: true,
      show_username: true,
      show_amount: true,
      show_donation_count: true,
      anonymous_mode: 'Show Anonymous',
      currency: 'USD ($)',
      number_format: '1,000.00',
      layout: 'Card',
      theme: 'Gaming',
      avatar_size: 'Medium',
      font: 'Outfit (Recommended)',
      font_size: 'Medium',
      highlight_top3: true,
      top3_style: 'Gold / Silver / Bronze',
      show_crown: true,
      show_rank_badge: true,
      show_glow: true,
      animation_enabled: true,
      animation_style: 'Glow',
      animation_speed: 'Normal',
      refresh_interval: '5 seconds',
      empty_message: 'No donations yet. Be the first supporter!',
      updated_at: new Date().toISOString()
    };
    return this.updateLeaderboardSettings(userId, defaultSettings);
  },

  // Donation Page Settings
  async getDonationPageSettingsByStreamerId(streamerId) {
    if (!streamerId) return null;
    if (isConfigured) {
      const { data } = await supabase.from('donation_page_settings').select('*').eq('streamer_id', streamerId).maybeSingle();
      if (data) return data;
      // Also lookup streamer to check by user_id
      const streamer = await this.findStreamerById(streamerId);
      if (streamer?.user_id) {
        const { data: byUser } = await supabase.from('donation_page_settings').select('*').eq('user_id', streamer.user_id).maybeSingle();
        if (byUser) return byUser;
      }
    }
    let setting = memoryDb.donation_page_settings.find(d => d.streamer_id === streamerId);
    if (!setting) {
      const streamer = memoryDb.streamers.find(s => s.id === streamerId);
      if (streamer) {
        setting = memoryDb.donation_page_settings.find(d => d.user_id === streamer.user_id);
      }
    }
    return setting || null;
  },

  async getDonationPageSettingsByUserId(userId) {
    if (!userId) return null;
    if (isConfigured) {
      const { data } = await supabase.from('donation_page_settings').select('*').eq('user_id', userId).maybeSingle();
      if (data) return data;
      // Also lookup streamer to check by streamer_id
      const streamer = await this.findStreamerByUserId(userId);
      if (streamer?.id) {
        const { data: byStreamer } = await supabase.from('donation_page_settings').select('*').eq('streamer_id', streamer.id).maybeSingle();
        if (byStreamer) return byStreamer;
      }
    }

    let setting = memoryDb.donation_page_settings.find(d => d.user_id === userId);
    if (!setting) {
      const streamer = memoryDb.streamers.find(s => s.user_id === userId);
      setting = {
        id: crypto.randomUUID(),
        user_id: userId,
        streamer_id: streamer ? streamer.id : null,
        enabled: true,
        title: streamer ? `Donate For ${streamer.slug} ❤️` : 'Donate to Creator ❤️',
        description: 'Support my stream and content creation! Every donation triggers live on-stream alerts.',
        currency: 'USD',
        min_amount: 1.00,
        max_amount: 5000.00,
        preset_amounts: [1, 5, 10, 20, 50, 100],
        custom_amount_enabled: true,
        anonymous_enabled: true,
        show_donor_name: true,
        show_donor_email: true,
        show_donor_message: true,
        show_recent_donations: true,
        show_social_links: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.donation_page_settings.push(setting);
    }
    return setting;
  },

  async updateDonationPageSettings(userId, updates) {
    let streamerId = updates.streamer_id;
    if (!streamerId) {
      const streamer = await this.findStreamerByUserId(userId);
      if (streamer) streamerId = streamer.id;
    }

    if (isConfigured) {
      const payload = {
        user_id: userId,
        streamer_id: streamerId || null,
        ...updates,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from('donation_page_settings').upsert(payload, { onConflict: 'user_id' }).select().single();
      if (!error && data) return data;
      if (error) {
        // Fallback update by user_id
        const { data: updated } = await supabase.from('donation_page_settings').update(payload).eq('user_id', userId).select().single();
        if (updated) return updated;
      }
    }

    let setting = memoryDb.donation_page_settings.find(d => d.user_id === userId);
    if (!setting) {
      const streamer = memoryDb.streamers.find(s => s.user_id === userId);
      setting = {
        id: crypto.randomUUID(),
        user_id: userId,
        streamer_id: streamerId || (streamer ? streamer.id : null),
        enabled: true,
        title: 'Donate to Creator ❤️',
        description: 'Support my stream and content creation! Every donation triggers live on-stream alerts.',
        currency: 'USD',
        min_amount: 1.00,
        max_amount: 5000.00,
        preset_amounts: [1, 5, 10, 20, 50, 100],
        custom_amount_enabled: true,
        anonymous_enabled: true,
        show_donor_name: true,
        show_donor_email: true,
        show_donor_message: true,
        show_recent_donations: true,
        show_social_links: true,
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.donation_page_settings.push(setting);
      return setting;
    }
    Object.assign(setting, updates, { streamer_id: streamerId || setting.streamer_id, updated_at: new Date().toISOString() });
    return setting;
  },

  async resetDonationPageSettings(userId) {
    const defaultSettings = {
      enabled: true,
      title: 'Donate to Creator ❤️',
      description: 'Support my stream and content creation! Every donation triggers live on-stream alerts.',
      currency: 'USD',
      min_amount: 1.00,
      max_amount: 5000.00,
      preset_amounts: [1, 5, 10, 20, 50, 100],
      custom_amount_enabled: true,
      anonymous_enabled: true,
      show_donor_name: true,
      show_donor_email: true,
      show_donor_message: true,
      show_recent_donations: true,
      show_social_links: true,
      updated_at: new Date().toISOString()
    };
    return this.updateDonationPageSettings(userId, defaultSettings);
  },

  // Ticker Settings
  async getTickerSettingsByStreamerId(streamerId) {
    return memoryDb.ticker_settings.find(t => t.streamer_id === streamerId) || null;
  },

  async getTickerSettingsByUserId(userId) {
    let setting = memoryDb.ticker_settings.find(t => t.user_id === userId);
    if (!setting) {
      const streamer = memoryDb.streamers.find(s => s.user_id === userId);
      setting = {
        id: crypto.randomUUID(),
        user_id: userId,
        streamer_id: streamer ? streamer.id : null,
        enabled: true,
        theme: 'Gaming',
        animation: 'Scroll Left',
        direction: 'left',
        speed: 40,
        font_size: 'Medium',
        font_weight: 'Bold',
        show_avatar: true,
        show_name: true,
        show_amount: true,
        show_message: true,
        show_currency: true,
        max_donations: 15,
        show_latest: true,
        show_largest: false,
        show_today: false,
        custom_text: '🎉 Live Supporter Feed •',
        avatar_size: 'Medium',
        spacing: 32,
        height: 64,
        pause_on_hover: true,
        infinite_loop: true,
        anonymous_mode: 'Show Anonymous',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.ticker_settings.push(setting);
    }
    return setting;
  },

  async updateTickerSettings(userId, updates) {
    let setting = memoryDb.ticker_settings.find(t => t.user_id === userId);
    if (!setting) {
      const streamer = memoryDb.streamers.find(s => s.user_id === userId);
      setting = {
        id: crypto.randomUUID(),
        user_id: userId,
        streamer_id: streamer ? streamer.id : null,
        enabled: true,
        theme: 'Gaming',
        animation: 'Scroll Left',
        direction: 'left',
        speed: 40,
        font_size: 'Medium',
        font_weight: 'Bold',
        show_avatar: true,
        show_name: true,
        show_amount: true,
        show_message: true,
        show_currency: true,
        max_donations: 15,
        show_latest: true,
        show_largest: false,
        show_today: false,
        custom_text: '🎉 Live Supporter Feed •',
        avatar_size: 'Medium',
        spacing: 32,
        height: 64,
        pause_on_hover: true,
        infinite_loop: true,
        anonymous_mode: 'Show Anonymous',
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryDb.ticker_settings.push(setting);
      return setting;
    }
    Object.assign(setting, updates, { updated_at: new Date().toISOString() });
    return setting;
  },

  async resetTickerSettings(userId) {
    const defaultSettings = {
      enabled: true,
      theme: 'Gaming',
      animation: 'Scroll Left',
      direction: 'left',
      speed: 40,
      font_size: 'Medium',
      font_weight: 'Bold',
      show_avatar: true,
      show_name: true,
      show_amount: true,
      show_message: true,
      show_currency: true,
      max_donations: 15,
      show_latest: true,
      show_largest: false,
      show_today: false,
      custom_text: '🎉 Live Supporter Feed •',
      avatar_size: 'Medium',
      spacing: 32,
      height: 64,
      pause_on_hover: true,
      infinite_loop: true,
      anonymous_mode: 'Show Anonymous',
      updated_at: new Date().toISOString()
    };
    return this.updateTickerSettings(userId, defaultSettings);
  },

  // Telegram Connections
  async getTelegramConnectionByStreamerId(streamerId) {
    if (isConfigured) {
      try {
        const { data, error } = await supabase
          .from('telegram_connections')
          .select('*')
          .eq('streamer_id', streamerId)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        if (!error && data) return data;
      } catch (err) {
        console.warn('Supabase getTelegramConnection fallback to memory:', err.message);
      }
    }
    return memoryDb.telegram_connections.find(t => t.streamer_id === streamerId && t.status === 'ACTIVE') || null;
  },

  async getTelegramConnectionByChatId(chatId) {
    if (isConfigured) {
      try {
        const { data, error } = await supabase
          .from('telegram_connections')
          .select('*')
          .eq('chat_id', String(chatId))
          .eq('status', 'ACTIVE')
          .maybeSingle();
        if (!error && data) return data;
      } catch (err) {
        console.warn('Supabase getTelegramConnectionByChatId fallback to memory:', err.message);
      }
    }
    return memoryDb.telegram_connections.find(t => t.chat_id === String(chatId) && t.status === 'ACTIVE') || null;
  },

  async createTelegramPairingCode(streamerId) {
    const code = 'DARA-' + Math.floor(100000 + Math.random() * 900000);
    const existing = memoryDb.telegram_connections.find(t => t.streamer_id === streamerId);
    if (existing) {
      existing.pairing_code = code;
      existing.status = 'PENDING';
      existing.updated_at = new Date().toISOString();
    } else {
      memoryDb.telegram_connections.push({
        id: crypto.randomUUID(),
        streamer_id: streamerId,
        telegram_user_id: null,
        chat_id: null,
        pairing_code: code,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    if (isConfigured) {
      try {
        await supabase
          .from('telegram_connections')
          .upsert({
            streamer_id: streamerId,
            pairing_code: code,
            status: 'PENDING',
            updated_at: new Date().toISOString()
          }, { onConflict: 'streamer_id' });
      } catch (err) {
        console.warn('Supabase createTelegramPairingCode fallback:', err.message);
      }
    }
    return code;
  },

  async pairTelegramChat(pairingCode, chatId, userId) {
    const normalizedCode = (pairingCode || '').trim().toUpperCase();
    let connection = memoryDb.telegram_connections.find(t => (t.pairing_code === normalizedCode || t.pairing_code?.replace(/-/g, '_') === normalizedCode) && t.status === 'PENDING');
    
    if (isConfigured) {
      try {
        const { data, error } = await supabase
          .from('telegram_connections')
          .select('*')
          .eq('pairing_code', normalizedCode)
          .eq('status', 'PENDING')
          .maybeSingle();
        if (!error && data) {
          connection = data;
        }
      } catch (err) {
        console.warn('Supabase pairTelegramChat fallback:', err.message);
      }
    }

    if (!connection) return null;

    connection.chat_id = String(chatId);
    connection.telegram_user_id = String(userId || chatId);
    connection.status = 'ACTIVE';
    connection.pairing_code = null;
    connection.updated_at = new Date().toISOString();

    // Sync memoryDb
    const memIdx = memoryDb.telegram_connections.findIndex(t => t.id === connection.id || t.streamer_id === connection.streamer_id);
    if (memIdx >= 0) {
      memoryDb.telegram_connections[memIdx] = { ...memoryDb.telegram_connections[memIdx], ...connection };
    } else {
      memoryDb.telegram_connections.push(connection);
    }

    if (isConfigured) {
      try {
        await supabase
          .from('telegram_connections')
          .update({
            chat_id: String(chatId),
            telegram_user_id: String(userId || chatId),
            status: 'ACTIVE',
            pairing_code: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', connection.id);
      } catch (err) {
        console.warn('Supabase pairTelegramChat update fallback:', err.message);
      }
    }

    return connection;
  },

  async disconnectTelegramConnection(streamerId) {
    const connection = memoryDb.telegram_connections.find(t => t.streamer_id === streamerId);
    if (connection) {
      connection.status = 'REVOKED';
      connection.chat_id = null;
      connection.pairing_code = null;
      connection.updated_at = new Date().toISOString();
    }

    if (isConfigured) {
      try {
        await supabase
          .from('telegram_connections')
          .update({
            status: 'REVOKED',
            chat_id: null,
            pairing_code: null,
            updated_at: new Date().toISOString()
          })
          .eq('streamer_id', streamerId);
      } catch (err) {
        console.warn('Supabase disconnectTelegram fallback:', err.message);
      }
    }
    return true;
  },

  async disconnectTelegramChat(chatId) {
    const connection = memoryDb.telegram_connections.find(t => t.chat_id === String(chatId));
    if (connection) {
      connection.status = 'REVOKED';
      connection.chat_id = null;
      connection.pairing_code = null;
      connection.updated_at = new Date().toISOString();
    }

    if (isConfigured) {
      try {
        await supabase
          .from('telegram_connections')
          .update({
            status: 'REVOKED',
            chat_id: null,
            pairing_code: null,
            updated_at: new Date().toISOString()
          })
          .eq('chat_id', String(chatId));
      } catch (err) {
        console.warn('Supabase disconnectTelegramChat fallback:', err.message);
      }
    }
    return true;
  },


  // Audit Logs
  async recordAuditLog(logData) {
    const newLog = {
      id: crypto.randomUUID(),
      user_id: logData.user_id || null,
      action: logData.action,
      entity: logData.entity,
      entity_id: logData.entity_id ? String(logData.entity_id) : null,
      metadata: logData.metadata || {},
      ip_address: logData.ip_address || '127.0.0.1',
      created_at: new Date().toISOString()
    };
    memoryDb.audit_logs.unshift(newLog);
    return newLog;
  },

  async getAuditLogs(filters = {}, pagination = { page: 1, limit: 30 }) {
    let list = [...memoryDb.audit_logs];
    if (filters.action) list = list.filter(l => l.action.toLowerCase().includes(filters.action.toLowerCase()));
    if (filters.entity) list = list.filter(l => l.entity === filters.entity);
    const total = list.length;
    const page = Math.max(1, parseInt(pagination.page, 10) || 1);
    const limit = Math.max(1, parseInt(pagination.limit, 10) || 30);
    const paginated = list.slice((page - 1) * limit, page * limit);
    return { data: paginated, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },

  // Leaderboard Calculation
  async getLeaderboard(streamerId, period = 'all') {
    let donations = [];
    if (isConfigured) {
      try {
        let query = supabase.from('donations').select('*').eq('payment_status', 'PAID');
        if (streamerId) {
          query = query.eq('streamer_id', streamerId);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data) && data.length > 0) {
          donations = data;
        }
      } catch (err) {
        console.warn('Supabase getLeaderboard fallback to memoryDb:', err.message);
      }
    }

    if (donations.length === 0) {
      donations = memoryDb.donations.filter(d => d.payment_status === 'PAID');
      if (streamerId) {
        donations = donations.filter(d => d.streamer_id === streamerId);
      }
    }

    const now = new Date();
    if (period === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      donations = donations.filter(d => new Date(d.paid_at || d.created_at).getTime() >= todayStart);
    } else if (period === 'week') {
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
      donations = donations.filter(d => new Date(d.paid_at || d.created_at).getTime() >= weekStart);
    } else if (period === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      donations = donations.filter(d => new Date(d.paid_at || d.created_at).getTime() >= monthStart);
    }

    // Aggregate by donor
    const donorTotals = {};
    for (const d of donations) {
      const name = d.anonymous ? 'Anonymous' : (d.donor_name || 'Anonymous');
      const key = d.anonymous ? `anon_${d.id}` : name.toLowerCase();

      // Find avatar if donor profile exists
      let avatarUrl = null;
      if (!d.anonymous) {
        if (d.donor_id) {
          const profile = memoryDb.profiles.find(p => p.id === d.donor_id);
          if (profile) avatarUrl = profile.avatar_url;
        }
        if (!avatarUrl) {
          const profileByName = memoryDb.profiles.find(p => p.display_name?.toLowerCase() === name.toLowerCase() || p.username?.toLowerCase() === name.toLowerCase());
          if (profileByName) avatarUrl = profileByName.avatar_url;
        }
      }

      const donationTime = new Date(d.paid_at || d.created_at).getTime();

      if (!donorTotals[key]) {
        donorTotals[key] = {
          donor_name: name,
          name,
          anonymous: Boolean(d.anonymous),
          total_amount: 0,
          total: 0,
          donation_count: 0,
          avatar_url: avatarUrl || (d.anonymous ? null : null),
          first_paid_at: d.paid_at || d.created_at,
          last_donated_at: d.paid_at || d.created_at
        };
      }

      donorTotals[key].total_amount += Number(d.amount);
      donorTotals[key].total = donorTotals[key].total_amount;
      donorTotals[key].donation_count += 1;

      if (avatarUrl && !donorTotals[key].avatar_url) {
        donorTotals[key].avatar_url = avatarUrl;
      }

      if (donationTime < new Date(donorTotals[key].first_paid_at).getTime()) {
        donorTotals[key].first_paid_at = d.paid_at || d.created_at;
      }
      if (donationTime > new Date(donorTotals[key].last_donated_at).getTime()) {
        donorTotals[key].last_donated_at = d.paid_at || d.created_at;
      }
    }

    // Strict Tie-Breaking: total_amount DESC, donation_count DESC, first_paid_at ASC
    const ranked = Object.values(donorTotals).sort((a, b) => {
      if (b.total_amount !== a.total_amount) {
        return b.total_amount - a.total_amount;
      }
      if (b.donation_count !== a.donation_count) {
        return b.donation_count - a.donation_count;
      }
      return new Date(a.first_paid_at).getTime() - new Date(b.first_paid_at).getTime();
    });

    return ranked.map((r, idx) => ({ rank: idx + 1, ...r }));
  },

  async getLeaderboardStats(streamerId, period = 'all') {
    let donations = [];
    if (isConfigured) {
      try {
        let query = supabase.from('donations').select('*').eq('payment_status', 'PAID');
        if (streamerId) {
          query = query.eq('streamer_id', streamerId);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data) && data.length > 0) {
          donations = data;
        }
      } catch (err) {
        console.warn('Supabase getLeaderboardStats fallback to memoryDb:', err.message);
      }
    }

    if (donations.length === 0) {
      donations = memoryDb.donations.filter(d => d.payment_status === 'PAID');
      if (streamerId) {
        donations = donations.filter(d => d.streamer_id === streamerId);
      }
    }

    const now = new Date();
    if (period === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      donations = donations.filter(d => new Date(d.paid_at || d.created_at).getTime() >= todayStart);
    } else if (period === 'week') {
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
      donations = donations.filter(d => new Date(d.paid_at || d.created_at).getTime() >= weekStart);
    } else if (period === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      donations = donations.filter(d => new Date(d.paid_at || d.created_at).getTime() >= monthStart);
    }

    const totalDonationsAmount = donations.reduce((sum, d) => sum + Number(d.amount), 0);
    const totalDonationsCount = donations.length;

    // Distinct donors
    const distinctDonors = new Set();
    for (const d of donations) {
      if (d.anonymous) {
        distinctDonors.add(`anon_${d.id}`);
      } else {
        distinctDonors.add((d.donor_name || 'Anonymous').toLowerCase());
      }
    }
    const totalDonorsCount = distinctDonors.size;

    const rankings = await this.getLeaderboard(streamerId, period);
    const topDonor = rankings.length > 0 ? rankings[0] : null;

    return {
      period,
      total_donations_amount: totalDonationsAmount,
      total_donations_count: totalDonationsCount,
      total_donors_count: totalDonorsCount,
      average_donation: totalDonationsCount > 0 ? Number((totalDonationsAmount / totalDonationsCount).toFixed(2)) : 0,
      top_donor: topDonor ? { name: topDonor.donor_name, amount: topDonor.total_amount, count: topDonor.donation_count } : null
    };
  },

  async getTopDonors(streamerId, period = 'all', limit = 3) {
    const rankings = await this.getLeaderboard(streamerId, period);
    return rankings.slice(0, Math.max(1, limit));
  },

  async getRecentDonations(streamerId, limit = 10) {
    let donations = memoryDb.donations.filter(d => d.payment_status === 'PAID');
    if (streamerId) {
      donations = donations.filter(d => d.streamer_id === streamerId);
    }

    donations.sort((a, b) => new Date(b.paid_at || b.created_at) - new Date(a.paid_at || a.created_at));
    const slice = donations.slice(0, Math.max(1, limit));

    return slice.map(d => {
      let avatarUrl = null;
      if (!d.anonymous) {
        if (d.donor_id) {
          const profile = memoryDb.profiles.find(p => p.id === d.donor_id);
          if (profile) avatarUrl = profile.avatar_url;
        }
        if (!avatarUrl) {
          const profileByName = memoryDb.profiles.find(p => p.display_name?.toLowerCase() === d.donor_name?.toLowerCase() || p.username?.toLowerCase() === d.donor_name?.toLowerCase());
          if (profileByName) avatarUrl = profileByName.avatar_url;
        }
      }

      return {
        id: d.id,
        donor_name: d.anonymous ? 'Anonymous' : (d.donor_name || 'Anonymous'),
        amount: Number(d.amount),
        currency: d.currency || 'USD',
        message: d.message || '',
        anonymous: Boolean(d.anonymous),
        avatar_url: avatarUrl,
        paid_at: d.paid_at || d.created_at,
        created_at: d.created_at
      };
    });
  },

  // System Stats
  async getSystemStats() {
    const totalUsers = memoryDb.profiles.length;
    const totalStreamers = memoryDb.streamers.length;
    const paidDonations = memoryDb.donations.filter(d => d.payment_status === 'PAID');
    const totalVolume = paidDonations.reduce((sum, d) => sum + Number(d.amount), 0);
    const pendingTransactions = memoryDb.payment_transactions.filter(pt => pt.status === 'PENDING').length;
    const failedTransactions = memoryDb.payment_transactions.filter(pt => pt.status === 'FAILED').length;

    return {
      totalUsers,
      totalStreamers,
      totalDonationsCount: paidDonations.length,
      totalVolumeUSD: totalVolume,
      pendingCount: pendingTransactions,
      failedCount: failedTransactions,
      activeGoalsCount: memoryDb.donation_goals.filter(g => g.status === 'ACTIVE').length
    };
  },

  // Telegram QR & Bot Authentication
  async createTelegramLoginSession() {
    const config = require('../config');
    const token = 'TLOG-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const botUsername = config.telegram.botToken ? (config.telegram.botUsername || 'darastore_bot') : 'darastore_bot';
    const deepLink = `https://t.me/${botUsername}?start=login_${token.replace(/-/g, '_')}`;

    const session = {
      token,
      status: 'PENDING', // PENDING, AUTHENTICATED, EXPIRED
      user: null,
      streamer: null,
      jwt: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
    };

    memoryDb.telegram_login_sessions.push(session);

    return {
      sessionToken: token,
      deepLink,
      qrData: deepLink,
      botUsername,
      expiresIn: 300
    };
  },

  async getTelegramLoginSession(sessionToken) {
    if (!sessionToken) return null;
    const normalized = sessionToken.trim().toUpperCase().replace(/_/g, '-');
    const session = memoryDb.telegram_login_sessions.find(s => s.token === normalized || s.token.replace(/-/g, '_') === normalized);
    if (!session) return null;

    if (new Date(session.expires_at) < new Date()) {
      session.status = 'EXPIRED';
    }

    return session;
  },

  async authorizeTelegramLoginSession(sessionToken, telegramUser) {
    const session = await this.getTelegramLoginSession(sessionToken);
    if (!session || session.status !== 'PENDING') {
      return null;
    }

    const jwt = require('jsonwebtoken');
    const config = require('../config');

    // Find or create profile for Telegram user
    const profile = await this.findOrCreateTelegramProfile(telegramUser);
    let streamer = await this.findStreamerByUserId(profile.id);
    if (!streamer) {
      streamer = await this.createStreamer({
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

    // Link telegram connection if not already linked
    if (telegramUser && telegramUser.id && streamer && streamer.id) {
      const existingConn = await this.getTelegramConnectionByStreamerId(streamer.id);
      if (!existingConn) {
        memoryDb.telegram_connections.push({
          id: crypto.randomUUID(),
          streamer_id: streamer.id,
          telegram_user_id: String(telegramUser.id),
          chat_id: String(telegramUser.id),
          pairing_code: null,
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    const { password_hash, ...safeProfile } = profile;

    session.status = 'AUTHENTICATED';
    session.user = safeProfile;
    session.streamer = streamer;
    session.jwt = token;
    session.authenticated_at = new Date().toISOString();

    return session;
  },

  async findOrCreateTelegramProfile(telegramUser) {
    const tgId = String(telegramUser.id || '');
    const tgUsername = (telegramUser.username || '').toLowerCase().trim();
    const displayName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || telegramUser.username || `Telegram User ${tgId.slice(-4)}`;
    const avatarUrl = telegramUser.photo_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${tgId || displayName}`;
    const email = tgUsername ? `${tgUsername}@telegram.user` : `tg_${tgId}@telegram.user`;
    const tgLink = tgUsername ? `https://t.me/${tgUsername}` : (tgId ? `https://t.me/user?id=${tgId}` : 'https://t.me');

    // 1. Try to find existing profile by email, username, or telegram ID
    let profile = await this.findProfileByEmail(email);
    if (!profile && tgUsername) {
      profile = await this.findProfileByUsername(tgUsername);
    }
    if (!profile && tgId) {
      const conn = await this.getTelegramConnectionByChatId(tgId);
      if (conn) {
        const streamer = memoryDb.streamers.find(s => s.id === conn.streamer_id);
        if (streamer) {
          profile = await this.findProfileById(streamer.user_id);
        }
      }
    }

    if (profile) {
      // Synchronize and update profile with latest Telegram account details
      const updates = {
        telegram_id: tgId || profile.telegram_id,
        telegram_username: tgUsername || profile.telegram_username,
        updated_at: new Date().toISOString()
      };
      if (telegramUser.photo_url && (!profile.avatar_url || profile.avatar_url.includes('dicebear') || profile.avatar_url.includes('placeholder'))) {
        updates.avatar_url = telegramUser.photo_url;
      }
      if (displayName && (!profile.display_name || profile.display_name.startsWith('tg_user_'))) {
        updates.display_name = displayName;
      }

      await this.updateProfile(profile.id, updates);
      profile = { ...profile, ...updates };

      // Ensure streamer record has Telegram social link & active connection
      let streamer = await this.findStreamerByUserId(profile.id);
      if (streamer) {
        const socialLinks = { ...(streamer.social_links || {}), telegram: tgLink };
        await this.updateStreamer(streamer.id, { social_links: socialLinks });
      }

      // Auto-activate Telegram push connection
      if (tgId && streamer) {
        const existingConn = await this.getTelegramConnectionByStreamerId(streamer.id);
        if (!existingConn) {
          memoryDb.telegram_connections.push({
            id: crypto.randomUUID(),
            streamer_id: streamer.id,
            telegram_user_id: tgId,
            chat_id: tgId,
            pairing_code: null,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      return profile;
    }

    // 2. Determine unique username following Telegram handle
    let baseUsername = tgUsername || `tg_user_${tgId.slice(-6) || Math.floor(1000 + Math.random() * 9000)}`;
    baseUsername = baseUsername.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'tg_user';
    let username = baseUsername;
    let counter = 1;
    while (await this.findProfileByUsername(username)) {
      username = `${baseUsername}_${counter}`;
      counter++;
    }

    // 3. Create new profile following Telegram user
    const newProfile = await this.createProfile({
      email,
      username,
      display_name: displayName,
      avatar_url: avatarUrl,
      bio: `Official live streamer on Zoee Donation 🇰🇭 | Telegram: @${tgUsername || username}`,
      password_hash: '$2a$10$telegram_oauth_authenticated_dummy_hash_zoee',
      role: 'STREAMER',
      telegram_id: tgId,
      telegram_username: tgUsername
    });

    // 4. Create streamer record with Telegram social link
    let streamer = await this.findStreamerByUserId(newProfile.id);
    if (!streamer) {
      streamer = await this.createStreamer({
        user_id: newProfile.id,
        slug: newProfile.username,
        donation_enabled: true,
        currency: 'USD',
        min_donation_amount: 1.00,
        social_links: { telegram: tgLink }
      });
    }

    // 5. Automatically activate Telegram instant push alerts
    if (tgId && streamer) {
      memoryDb.telegram_connections.push({
        id: crypto.randomUUID(),
        streamer_id: streamer.id,
        telegram_user_id: tgId,
        chat_id: tgId,
        pairing_code: null,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    return newProfile;
  }
};

module.exports = Store;


