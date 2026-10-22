import * as Linking from 'expo-linking';

import { supabase } from '@/services/supabase/client';

import { friendlyAuthError, type FriendlyAuthError } from './auth-errors';

/** Route that receives OAuth, email-confirmation and password-reset redirects. */
export const AUTH_CALLBACK_PATH = 'auth/callback';

/**
 * The redirect URL Supabase sends people back to, e.g. `chrmobileapp://auth/callback`
 * in a development or release build (Expo Go uses an `exp://` address instead).
 * It must be listed under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function authRedirectUrl() {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export type CallbackParams = Record<string, string | undefined>;

export type CallbackResult =
  | { status: 'signed-in' }
  | { status: 'error'; error: FriendlyAuthError }
  | { status: 'ignored' };

/** Reads query and fragment parameters from a redirect URL (Supabase may use either). */
export function paramsFromUrl(url: string): CallbackParams {
  const params: CallbackParams = {};
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] ?? '';
  for (const part of [query, hash]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [rawKey, rawValue = ''] = pair.split('=');
      try {
        params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
      } catch {
        /* malformed pair: skip it */
      }
    }
  }
  return params;
}

// The same redirect can reach the app twice (the browser-session promise and the
// deep link Expo Router navigates to). A PKCE code may only be exchanged once,
// so concurrent and repeated calls share one result per code.
const exchanges = new Map<string, Promise<CallbackResult>>();

/**
 * Completes a sign-in from redirect parameters: exchanges a PKCE `code` for a
 * session, or turns an `error` (cancelled consent, expired link) into a
 * customer-facing message. Parameters it does not recognise are ignored.
 */
export function completeAuthFromParams(params: CallbackParams): Promise<CallbackResult> {
  if (!supabase) return Promise.resolve({ status: 'ignored' });

  if (params.error || params.error_code) {
    const code = params.error_code ?? params.error;
    const expired = code === 'otp_expired' || /expired|invalid/i.test(params.error_description ?? '');
    return Promise.resolve({
      status: 'error',
      error: expired
        ? { message: 'That link has expired or was already used. Please request a new one.', kind: 'expired-link' }
        : friendlyAuthError(new Error(params.error_description ?? code), 'link'),
    });
  }

  const code = params.code;
  if (!code) return Promise.resolve({ status: 'ignored' });

  let pending = exchanges.get(code);
  if (!pending) {
    const client = supabase;
    pending = client.auth
      .exchangeCodeForSession(code)
      .then(async ({ error }): Promise<CallbackResult> => {
        if (!error) return { status: 'signed-in' };
        // The other path may have exchanged it a moment earlier.
        const { data } = await client.auth.getSession();
        if (data.session) return { status: 'signed-in' };
        return { status: 'error', error: friendlyAuthError(error, 'link') };
      })
      .catch((error: unknown): CallbackResult => ({ status: 'error', error: friendlyAuthError(error, 'link') }));
    exchanges.set(code, pending);
  }
  return pending;
}

export function completeAuthFromUrl(url: string) {
  return completeAuthFromParams(paramsFromUrl(url));
}
