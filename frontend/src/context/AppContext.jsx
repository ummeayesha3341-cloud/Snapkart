import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { requireSupabase, supabase } from '../services/supabase';

const Ctx = createContext();
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState(null);
  const [assurance, setAssurance] = useState('aal1');
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
    setAssurance('aal1');
  }, []);

  const loadProfile = useCallback(async () => {
    const d = await api.me();
    const profile = d.user || d;
    setUser(profile);
    if (supabase) {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setAssurance(data?.currentLevel || 'aal1');
    }
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
          if (active) {
            setUser(d.user || d);
            const { data: assuranceData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            setAssurance(assuranceData?.currentLevel || 'aal1');
            await loadCart();
          }
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
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const emailVerified = Boolean(data.user?.email_confirmed_at || data.user?.confirmed_at);
    if (!emailVerified) {
      await client.auth.signOut({ scope: 'local' });
      throw new Error('Verify your email with the code we sent before signing in.');
    }
    const profile = await loadProfile();
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return { mfaRequired: profile.role === 'ADMIN' && aal?.currentLevel !== 'aal2' };
  };

  const register = async ({ name, email, password }) => {
    const client = requireSupabase();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name },
      },
    });
    if (error) throw error;
    const emailVerified = Boolean(data.user?.email_confirmed_at || data.user?.confirmed_at);
    if (!emailVerified || !data.session) {
      if (data.session) await client.auth.signOut({ scope: 'local' });
      return { confirmationRequired: true };
    }
    await loadProfile();
    return { confirmationRequired: false };
  };

  const verifySignupOtp = async ({ email, token }) => {
    const client = requireSupabase();
    const { error } = await client.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) throw error;
    await loadProfile();
  };

  const resendSignupOtp = async email => {
    const client = requireSupabase();
    const { error } = await client.auth.resend({ type: 'signup', email });
    if (error) throw error;
  };

  const requestPasswordReset = async email => {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async password => {
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    await client.auth.signOut({ scope: 'local' });
    setUser(null);
    setCart(null);
  };

  const beginMfaEnrollment = async () => {
    const client = requireSupabase();
    // A previous enrollment can be abandoned before its QR code is verified.
    // Supabase keeps that unverified factor and rejects another factor with the
    // same friendly name, so remove only our own unfinished TOTP factors first.
    const { data: existing, error: listError } = await client.auth.mfa.listFactors();
    if (listError) throw listError;
    const unfinished = (existing.all || []).filter(factor =>
      factor.factor_type === 'totp' &&
      factor.status === 'unverified' &&
      factor.friendly_name === 'SnapKart admin authenticator'
    );
    for (const factor of unfinished) {
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SnapKart admin authenticator' });
    if (error) throw error;
    const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: data.id });
    if (challengeError) throw challengeError;
    return { factorId: data.id, challengeId: challenge.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  };
  const listMfaFactors = async () => {
    const { data, error } = await requireSupabase().auth.mfa.listFactors();
    if (error) throw error;
    return data.totp.filter(factor => factor.status === 'verified');
  };
  const challengeMfa = async factorId => {
    const { data, error } = await requireSupabase().auth.mfa.challenge({ factorId });
    if (error) throw error;
    return data.id;
  };
  const verifyMfa = async ({ factorId, challengeId, code }) => {
    const { error } = await requireSupabase().auth.mfa.verify({ factorId, challengeId, code });
    if (error) throw error;
    return loadProfile();
  };

  const value = {
    user, ready, cart, toast, assurance, notify, logout, loadCart, login, register, verifySignupOtp, resendSignupOtp,
    requestPasswordReset, updatePassword,
    beginMfaEnrollment, listMfaFactors, challengeMfa, verifyMfa,
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
