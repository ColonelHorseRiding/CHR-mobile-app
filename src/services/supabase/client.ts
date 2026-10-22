// Must load before supabase-js generates any PKCE verifier.
import './crypto-polyfill';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from './storage';

// EXPO_PUBLIC_* values are inlined at build time, so they must be read with
// static property access (no destructuring or dynamic keys).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = (
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

function looksLikeServiceRoleKey(value: string) {
  if (value.startsWith('sb_secret_')) return true;
  // Legacy keys are JWTs; the role claim is in the payload.
  try {
    const payload = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

function configurationProblem(): string | null {
  if (!url || !key) {
    return 'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or _PUBLISHABLE_KEY) are not set. Copy .env.example to .env.local, fill them in and restart the dev server.';
  }
  if (!/^https:\/\/.+/.test(url)) return 'EXPO_PUBLIC_SUPABASE_URL must be an https:// URL.';
  if (looksLikeServiceRoleKey(key)) {
    return 'The configured Supabase key is a service-role/secret key. Only the anon or publishable key may be used in the app.';
  }
  return null;
}

/** Why Supabase is unavailable, or null when it is configured. Shown to developers only. */
export const supabaseConfigError = configurationProblem();
export const supabaseConfigured = supabaseConfigError === null;

if (!supabaseConfigured && __DEV__) {
  console.warn(`[supabase] ${supabaseConfigError}`);
}

/**
 * The single Supabase client for the app, or null when not configured (callers
 * show a configuration message instead of pretending to sign anyone in).
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        // Native apps have no URL to read a session from; deep links are
        // handled explicitly (see features/auth/auth-callback.ts).
        detectSessionInUrl: false,
        // PKCE: OAuth and email links return a one-time code, not tokens in the URL.
        flowType: 'pkce',
      },
    })
  : null;

/** Base URL + public key, for the unauthenticated settings endpoint. */
export const supabasePublic = supabaseConfigured ? { url: url!, key: key! } : null;

// Only refresh tokens while the app is in the foreground (Supabase's guidance
// for React Native). Registered once, at module load.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
