'use strict';

(function () {
  let supabaseClient = null;

  function getSupabaseLib() {
    if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
      return window.supabase;
    }
    if (typeof supabase !== 'undefined' && supabase && typeof supabase.createClient === 'function') {
      return supabase;
    }
    if (typeof globalThis !== 'undefined' && globalThis.supabase && typeof globalThis.supabase.createClient === 'function') {
      return globalThis.supabase;
    }
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
    if (lib) {
      try {
        const config = getConfig();
        supabaseClient = lib.createClient(config.url.trim(), config.anonKey.trim());
      } catch (err) {
        console.error('Erro ao inicializar o cliente Supabase:', err);
      }
    }
    return supabaseClient;
  }

  // Tenta inicialização imediata
  getClient();

  async function signInWithPassword(email, password) {
    const client = getClient();
    if (!client) {
      throw new Error('Supabase não configurado. Adicione suas credenciais no arquivo dist/supabase-config.js');
    }
    const { data, error } = await client.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (error) {
      throw error;
    }
    return data;
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
    signIn: signInWithPassword,
    signInWithPassword: signInWithPassword,
    signOut: async function () {
      const client = getClient();
      if (!client) return;
      const { error } = await client.auth.signOut();
      if (error) {
        console.error('Erro no logout:', error);
      }
    },
    onAuthStateChange: function (callback) {
      const client = getClient();
      if (!client) return null;
      const { data: authListener } = client.auth.onAuthStateChange(callback);
      return authListener;
    }
  };
})();


