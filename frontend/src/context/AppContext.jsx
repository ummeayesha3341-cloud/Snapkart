import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { requireSupabase, supabase } from '../services/supabase';

const Ctx = createContext();
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState(null);
  const [toast, setToast] = useState(null);
  const notify = useCallback((msg, err) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2600);
  }, []);
  const loadCart = useCallback(async () => {
    try { setCart(await api.cart()); } catch { setCart(null); }
  }, []);

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setCart(null);
  }, []);

  const loadProfile = useCallback(async () => {
    const d = await api.me();
    const profile = d.user || d;
    setUser(profile);
    await loadCart();
    return profile;
  }, [loadCart]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!supabase) { setReady(true); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const d = await api.me();
          if (active) { setUser(d.user || d); await loadCart(); }
        } catch {
          await supabase.auth.signOut();
        }
      }
      if (active) setReady(true);
    };
    void init();
    const { data: { subscription } } = supabase?.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { setUser(null); setCart(null); }
    }) || { data: { subscription: null } };
    return () => { active = false; subscription?.unsubscribe(); };
  }, [loadCart]);

  useEffect(() => {
    const expired = () => {
      void logout();
      notify('Your session has expired. Please sign in again.', true);
    };
    window.addEventListener('sk:unauthorized', expired);
    return () => window.removeEventListener('sk:unauthorized', expired);
  }, [logout, notify]);

  const login = async ({ email, password }) => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return loadProfile();
  };

  const register = async ({ name, email, password }) => {
    const client = requireSupabase();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
    if (!data.session) return { confirmationRequired: true };
    await loadProfile();
    return { confirmationRequired: false };
  };

  const value = {
    user, ready, cart, toast, notify, logout, loadCart, login, register,
    add: async (barcode, quantity) => {
      const d = await api.addItem(barcode, quantity);
      setCart(d.cart || d);
      return d;
    },
    setQty: async (id, quantity) => { await api.setQty(id, quantity); await loadCart(); },
    remove: async id => { await api.removeItem(id); await loadCart(); },
    count: (cart?.items || []).reduce((n, item) => n + item.quantity, 0),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
