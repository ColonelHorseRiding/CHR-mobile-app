import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

export type AuthAction = 'sign-in' | 'sign-up' | 'forgot' | 'reset' | 'resend' | 'google' | 'link';

export type FriendlyAuthError = {
  message: string;
  /** Lets the screen offer a follow-up, e.g. "resend confirmation email". */
  kind?: 'email-not-confirmed' | 'network' | 'rate-limit' | 'expired-link';
};

/**
 * Customer-facing wording for Supabase Auth errors. Raw server text is never
 * shown, and messages avoid confirming whether an account exists beyond what
 * Supabase itself reveals.
 */
export function friendlyAuthError(error: unknown, action: AuthAction): FriendlyAuthError {
  if (isAuthRetryableFetchError(error) || isNetworkError(error)) {
    return { message: "We couldn't reach the club's servers. Check your connection and try again.", kind: 'network' };
  }

  const code = isAuthApiError(error) ? error.code : undefined;
  const text = error instanceof Error ? error.message : '';

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(text)) {
    return { message: "That email and password don't match our records. Check them and try again." };
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(text)) {
    return {
      message: 'Please confirm your email address first. Check your inbox for the link we sent.',
      kind: 'email-not-confirmed',
    };
  }
  if (code === 'weak_password' || /password should|weak password/i.test(text)) {
    return { message: 'That password is too easy to guess. Try a longer one with letters and numbers.' };
  }
  if (code === 'same_password') {
    return { message: 'Choose a password different from your current one.' };
  }
  if (code === 'email_address_invalid' || /invalid.*email|unable to validate email/i.test(text)) {
    return { message: "We couldn't use that email address. Check it for typos, or try another." };
  }
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found') {
    return { message: 'That link has expired or was already used. Please request a new one.', kind: 'expired-link' };
  }
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(text)) {
    return {
      message: "We've sent several emails already. Please wait a few minutes before asking for another.",
      kind: 'rate-limit',
    };
  }
  if (code === 'over_request_rate_limit' || /rate limit|too many/i.test(text)) {
    return { message: 'Too many attempts. Please wait a moment and try again.', kind: 'rate-limit' };
  }
  if (code === 'signup_disabled') {
    return { message: 'New accounts cannot be created in the app right now. Please contact the club.' };
  }

  switch (action) {
    case 'sign-up':
      return { message: "We couldn't create your account just now. Please try again." };
    case 'sign-in':
      return { message: "We couldn't sign you in just now. Please try again." };
    case 'google':
      return { message: "Google sign-in didn't go through. Please try again, or use your email and password." };
    case 'link':
      return { message: "We couldn't complete that link. Please request a new one.", kind: 'expired-link' };
    default:
      return { message: 'Something went wrong. Please try again.' };
  }
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError && /network|fetch/i.test(error.message);
}
