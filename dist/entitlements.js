'use strict';

(function () {
  let activeEntitlements = new Set();
  let loading = false;
  let loaded = false;

  window.EntitlementsModule = {
    isLoading: function () {
      return loading;
    },
    isLoaded: function () {
      return loaded;
    },
    has: function (productCode) {
      if (!productCode) return false;
      return activeEntitlements.has(String(productCode).trim());
    },
    getAll: function () {
      return Array.from(activeEntitlements);
    },
    clear: function () {
      activeEntitlements.clear();
      loading = false;
      loaded = false;
    },
    load: async function () {
      this.clear();

      if (!window.AuthModule || !window.AuthModule.isConfigured()) {
        loaded = true;
        return [];
      }

      // Obtain current session to scope query to authenticated user
      const session = await window.AuthModule.getSession();
      if (!session || !session.user || !session.user.id) {
        loaded = true;
        return [];
      }

      const client = window.AuthModule.getClient();
      if (!client) {
        loaded = true;
        return [];
      }

      loading = true;
      try {
        const { data, error } = await client
          .from('user_entitlements')
          .select('product_code, status')
          .eq('user_id', session.user.id)
          .eq('status', 'active');

        if (error) {
          console.error('Erro ao carregar permissões do usuário:', error);
          activeEntitlements.clear();
          loaded = true;
          loading = false;
          return [];
        }

        if (Array.isArray(data)) {
          data.forEach(function (item) {
            if (item && item.product_code && item.status === 'active') {
              activeEntitlements.add(item.product_code);
            }
          });
        }

        loaded = true;
        loading = false;
        return this.getAll();
      } catch (err) {
        console.error('Falha inesperada ao consultar permissões:', err);
        activeEntitlements.clear();
        loaded = true;
        loading = false;
        return [];
      }
    }
  };
})();
