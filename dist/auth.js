'use strict';

(function () {
  const config = window.SUPABASE_CONFIG || {};
  const isConfigured = Boolean(
    config.url &&
    config.anonKey &&
    !config.url.includes('SUA_SUPABASE_URL_AQUI') &&
    !config.anonKey.includes('SUA_SUPABASE_ANON_KEY_AQUI')
  );

  let supabaseClient = null;

  if (isConfigured && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    } catch (err) {
      console.error('Erro ao inicializar o cliente Supabase:', err);
    }
  }

  window.AuthModule = {
    isConfigured: function () {
      return isConfigured && supabaseClient !== null;
    },
    getClient: function () {
      return supabaseClient;
    },
    getSession: async function () {
      if (!this.isConfigured()) return null;
      try {
        const { data, error } = await supabaseClient.auth.getSession();
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
    signIn: async function (email, password) {
      if (!this.isConfigured()) {
        throw new Error('Supabase não configurado. Adicione suas credenciais no arquivo dist/supabase-config.js');
      }
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
      });
      if (error) {
        throw error;
      }
      return data;
    },
    signOut: async function () {
      if (!this.isConfigured()) return;
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        console.error('Erro no logout:', error);
      }
    },
    onAuthStateChange: function (callback) {
      if (!this.isConfigured()) return null;
      const { data: authListener } = supabaseClient.auth.onAuthStateChange(callback);
      return authListener;
    }
  };
})();
