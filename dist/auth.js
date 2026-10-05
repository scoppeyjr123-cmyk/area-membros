'use strict';

(function () {
  let supabaseClient = null;

  function getSupabaseLib() {
    if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') return window.supabase;
    if (typeof supabase !== 'undefined' && supabase && typeof supabase.createClient === 'function') return supabase;
    if (typeof globalThis !== 'undefined' && globalThis.supabase && typeof globalThis.supabase.createClient === 'function') return globalThis.supabase;
    return null;
  }

  function getConfig() {
    return (typeof window !== 'undefined' && window.SUPABASE_CONFIG) || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG : {});
  }

  function checkConfig() {
    const config = getConfig();
    return Boolean(
      config.url &&
      config.anonKey &&
      typeof config.url === 'string' &&
      typeof config.anonKey === 'string' &&
      config.url.trim().length > 0 &&
      config.anonKey.trim().length > 0 &&
      !config.url.includes('SUA_SUPABASE_URL_AQUI') &&
      !config.anonKey.includes('SUA_SUPABASE_ANON_KEY_AQUI')
    );
  }

  function getClient() {
    if (supabaseClient) return supabaseClient;
    if (!checkConfig()) return null;
    const lib = getSupabaseLib();
    if (!lib) return null;

    try {
      const config = getConfig();
      supabaseClient = lib.createClient(config.url.trim(), config.anonKey.trim(), {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } catch (err) {
      console.error('Erro ao inicializar o cliente Supabase:', err);
    }

    return supabaseClient;
  }

  getClient();

  async function callPublicFunction(name, payload) {
    const config = getConfig();
    const response = await fetch(config.url.trim() + '/functions/v1/' + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey.trim()
      },
      body: JSON.stringify(payload || {})
    });

    let body = {};
    try {
      body = await response.json();
    } catch (_) {
      body = {};
    }

    if (!response.ok || !body.ok) {
      const error = new Error(body.message || 'Não foi possível concluir o acesso.');
      error.status = response.status;
      throw error;
    }

    return body;
  }

  async function establishSessionFromTokenHash(tokenHash, type) {
    const client = getClient();
    if (!client) throw new Error('Supabase não configurado.');

    const { data, error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: type || 'email'
    });

    if (error) throw error;
    return data;
  }

  async function signInWithEmailOnly(email) {
    const client = getClient();
    if (!client) {
      throw new Error('Supabase não configurado. Adicione suas credenciais no arquivo dist/supabase-config.js');
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const result = await callPublicFunction('member-login', { email: normalizedEmail });
    return establishSessionFromTokenHash(result.token_hash, result.type || 'email');
  }

  async function signInFromPurchaseToken(token) {
    const client = getClient();
    if (!client) throw new Error('Supabase não configurado.');

    const result = await callPublicFunction('purchase-access', { token: String(token || '').trim() });
    return establishSessionFromTokenHash(result.token_hash, result.type || 'email');
  }

  window.AuthModule = {
    isConfigured: function () {
      return checkConfig() && getClient() !== null;
    },
    getClient: function () {
      return getClient();
    },
    getSession: async function () {
      const client = getClient();
      if (!client) return null;
      try {
        const { data, error } = await client.auth.getSession();
        if (error) {
          console.error('Erro ao buscar sessão:', error);
          return null;
        }
        return data.session;
      } catch (err) {
        console.error('Erro ao acessar sessão:', err);
        return null;
      }
    },
    signIn: signInWithEmailOnly,
    signInWithEmailOnly: signInWithEmailOnly,
    signInFromPurchaseToken: signInFromPurchaseToken,
    signOut: async function () {
      const client = getClient();
      if (!client) return;
      const { error } = await client.auth.signOut();
      if (error) console.error('Erro no logout:', error);
    },
    onAuthStateChange: function (callback) {
      const client = getClient();
      if (!client) return null;
      const { data: authListener } = client.auth.onAuthStateChange(callback);
      return authListener;
    }
  };
})();
