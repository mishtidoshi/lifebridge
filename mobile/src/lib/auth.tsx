// Who is signed in, plus sign-up / sign-in / sign-out. Backed by Supabase Auth.
//
// Signing in also unlocks the account's encryption key with the password (lib/vault.ts).
// Someone only counts as signed in (`user` is set) once their key is unlocked, so nothing is
// ever saved to the account without encryption.

import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { forgetKey, recallKey, rememberKey } from './keystore';
import { supabase } from './supabase';
import { EMPTY_NAME, loadName, replaceVault, saveName, unlockVault, type Name } from './vault';

export type { Name } from './vault';

interface Auth {
  enabled: boolean; // false when the app isn't connected to Supabase yet
  loading: boolean; // checking the saved sign-in when the app opens
  user: User | null; // signed in AND unlocked
  name: Name; // from the encrypted profile
  dataKey: Uint8Array | null; // locks/unlocks everything saved to the account (never sent anywhere)
  recovering: boolean; // opened from a "reset your password" email: show the new-password form
  notice: string | null; // something to tell the person once (e.g. their old plan couldn't be unlocked)
  clearNotice: () => void;
  signUp: (email: string, password: string, name: Name) => Promise<{ needsEmailConfirmation: boolean }>;
  updateName: (name: Name) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

// Account emails (confirm email, reset password) are sent by Supabase until the project has its
// own email service (Supabase → Authentication → Emails → SMTP Settings). Update this if that changes.
export const EMAIL_SENDER = 'Supabase Auth (noreply@mail.app.supabase.io)';

const STARTED_OVER =
  "Your password was reset, so your old saved plan couldn't be opened. It was encrypted with your old password. " +
  'Your account is ready for a new plan.';

const AuthContext = createContext<Auth | null>(null);

/** Supabase's error messages, reworded for people who aren't developers. */
function friendly(error: { message: string; status?: number }): Error {
  const m = error.message.toLowerCase();
  if (m.includes('invalid login credentials')) return new Error("That email and password don't match.");
  if (m.includes('email not confirmed')) return new Error('Please confirm your email first. Check your inbox for a link.');
  if (m.includes('already registered')) return new Error('There is already an account with that email. Try signing in.');
  if (m.includes('rate limit') || error.status === 429) return new Error('Too many tries. Please wait a few minutes.');
  if (m.includes('password should be')) return new Error('Please choose a stronger password.');
  if (m.includes('fetch') || m.includes('network')) return new Error("Can't reach the account service. Check your internet connection.");
  return new Error(error.message);
}

function client() {
  if (!supabase) throw new Error("Accounts aren't set up yet.");
  return supabase;
}

/** Where links in Supabase emails should bring people back to (web only). */
function returnUrl(): string | undefined {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
}

/** The name typed at sign-up waits (readable) in the account info until the first sign-in moves it into the vault. */
function signUpName(user: User): Name {
  const meta = user.user_metadata ?? {};
  return { first: (meta.first_name as string) ?? '', last: (meta.last_name as string) ?? '' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [unlocked, setUnlocked] = useState<{ key: Uint8Array; name: Name } | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [recovering, setRecovering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    // Reopening the app: use the key remembered on this device. Without it, ask to sign in again.
    sb.auth.getSession().then(async ({ data }) => {
      const s = data.session;
      if (s) {
        // Ask Supabase whether this account still exists (it may have been deleted on another device or by an admin).
        const { error: gone } = await sb.auth.getUser();
        if (gone && (gone.status === 401 || gone.status === 403 || gone.status === 404)) {
          await forgetKey(s.user.id);
          await sb.auth.signOut({ scope: 'local' });
          setSession(null);
          setLoading(false);
          return;
        }
        const key = await recallKey(s.user.id);
        if (key) {
          const name = await loadName(s.user.id, key).catch(() => EMPTY_NAME);
          setUnlocked({ key, name });
        } else {
          await sb.auth.signOut({ scope: 'local' });
        }
      }
      setSession(s);
      setLoading(false);
    });
    const { data } = sb.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') setUnlocked(null);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<Auth>(() => {
    const uid = session?.user.id ?? null;
    return {
      enabled: !!supabase,
      loading,
      user: session && unlocked ? session.user : null,
      name: unlocked?.name ?? EMPTY_NAME,
      dataKey: unlocked?.key ?? null,
      recovering,
      notice,
      clearNotice: () => setNotice(null),

      async signUp(email, password, name) {
        const { data, error } = await client().auth.signUp({
          email,
          password,
          options: { data: { first_name: name.first, last_name: name.last }, emailRedirectTo: returnUrl() },
        });
        if (error) throw friendly(error);
        return { needsEmailConfirmation: !data.session };
      },

      // (Doesn't touch `loading`: the sign-in form shows its own progress, and keeps its error message.)
      async signIn(email, password) {
        const { data, error } = await client().auth.signInWithPassword({ email, password });
        if (error) throw friendly(error);
        const user = data.user;
        let result;
        try {
          result = await unlockVault(user.id, password, signUpName(user));
        } catch (e) {
          await client().auth.signOut({ scope: 'local' });
          throw e;
        }
        if (user.user_metadata?.first_name || user.user_metadata?.last_name) {
          // the name now lives (encrypted) in the vault: erase the readable copy
          await client().auth.updateUser({ data: { first_name: null, last_name: null } }).catch(() => undefined);
        }
        await rememberKey(user.id, result.key);
        setUnlocked({ key: result.key, name: result.name });
        if (result.startedOver) setNotice(STARTED_OVER);
      },

      async updateName(name) {
        if (!uid || !unlocked) throw new Error('Please sign in again.');
        await saveName(uid, unlocked.key, name);
        setUnlocked({ ...unlocked, name });
      },

      async signOut() {
        const { error } = await client().auth.signOut();
        if (uid) await forgetKey(uid);
        setUnlocked(null);
        if (error) throw friendly(error);
      },

      async sendPasswordReset(email) {
        const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
        if (error) throw friendly(error);
      },

      async setNewPassword(password) {
        const { error } = await client().auth.updateUser({ password });
        if (error) throw friendly(error);
        if (uid) {
          const result = await replaceVault(uid, password); // the old key was locked with the old password
          await rememberKey(uid, result.key);
          setUnlocked({ key: result.key, name: result.name });
          setNotice(STARTED_OVER);
        }
        setRecovering(false);
      },

      async deleteAccount() {
        const { error } = await client().rpc('delete_my_account');
        if (error) throw friendly(error);
        if (uid) await forgetKey(uid);
        setUnlocked(null);
        await client().auth.signOut({ scope: 'local' });
      },
    };
  }, [loading, session, unlocked, recovering, notice]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

// --- checking what people type ------------------------------------------------

export function nameProblem(name: Name): string | null {
  if (!name.first.trim() || !name.last.trim()) return 'Please enter your first and last name.';
  if (name.first.length > 50 || name.last.length > 50) return 'Please keep each name under 50 characters.';
  return null;
}

export function emailProblem(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Please enter a valid email address.';
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Use at least one letter and one number.';
  return null;
}
