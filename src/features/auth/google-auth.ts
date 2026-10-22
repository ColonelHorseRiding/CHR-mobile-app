import * as WebBrowser from 'expo-web-browser';

import { supabase, supabasePublic } from '@/services/supabase/client';

import { authRedirectUrl, completeAuthFromParams, paramsFromUrl } from './auth-callback';
import { friendlyAuthError, type FriendlyAuthError } from './auth-errors';

let googleEnabled: Promise<boolean> | null = null;

/**
 * Whether Google is switched on for the Supabase project (public settings
 * endpoint, asked once per launch). The button is only offered when it is,
 * because otherwise Supabase answers with a bare error page.
 */
export function isGoogleSignInEnabled(): Promise<boolean> {
  if (!supabasePublic) return Promise.resolve(false);
  if (!googleEnabled) {
    googleEnabled = fetch(`${supabasePublic.url}/auth/v1/settings`, {
      headers: { apikey: supabasePublic.key },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => settings?.external?.google === true)
      .catch(() => {
        googleEnabled = null; // retry on the next screen visit
        return false;
      });
  }
  return googleEnabled;
}

export type GoogleSignInResult = { status: 'signed-in' } | { status: 'cancelled' } | { status: 'error'; error: FriendlyAuthError };

/**
 * Google sign-in through Supabase Auth: Supabase builds the Google consent URL,
 * an in-app browser session shows it, and Google returns to the app's
 * `auth/callback` deep link with a one-time PKCE code that is exchanged for a
 * Supabase session. Creates the account on first use (the database fills the
 * profile from the name Google supplies). No Google secret lives in the app.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!supabase) return { status: 'error', error: friendlyAuthError(null, 'google') };

  const redirectTo = authRedirectUrl();
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        // Always ask which account, so a shared family phone does not sign in the wrong rider.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error || !data.url) return { status: 'error', error: friendlyAuthError(error, 'google') };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { status: 'cancelled' };

    const params = paramsFromUrl(result.url);
    // Pressing Cancel on Google's consent page comes back as access_denied.
    if (params.error === 'access_denied') return { status: 'cancelled' };

    const completed = await completeAuthFromParams(params);
    if (completed.status === 'signed-in') return { status: 'signed-in' };
    if (completed.status === 'error' && completed.error.kind === 'network') return completed;
    return { status: 'error', error: friendlyAuthError(null, 'google') };
  } catch (error) {
    return { status: 'error', error: friendlyAuthError(error, 'google') };
  }
}

