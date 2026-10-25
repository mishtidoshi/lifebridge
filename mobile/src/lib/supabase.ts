// Supabase client for accounts (sign-in) and saving plans to an account.
// Accounts are optional: if the two settings below aren't set, `supabase` is null and the
// app works exactly as before, with everything saved only on the device.
//
// Settings go in mobile/.env.local (not committed):
//   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//   EXPO_PUBLIC_SUPABASE_KEY=<the project's publishable (anon) key>
// The publishable key is meant to be public; Row Level Security (supabase/schema.sql) protects the data.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          // On the web, links in Supabase emails (confirm email, reset password) come back with
          // the session in the URL; on phones there is no URL to read.
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

// Keep the sign-in fresh only while the app is open (Supabase's recommendation for React Native).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
