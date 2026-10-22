import { supabase } from '@/services/supabase/client';

/**
 * The two server calls behind phone alerts (proposal 0026_push_devices.sql).
 * Both run as the signed-in member: the server takes the owner from the
 * session (auth.uid()), never from anything this app sends.
 *
 *   register_push_device(p_token, p_platform, p_app_version)
 *     records this phone's Expo push token against the caller (moving it from
 *     any previous account signed in on the same phone) and re-activates it.
 *   unregister_push_device(p_token)
 *     removes the caller's own registration of that token; other phones and
 *     other members are untouched.
 */

const TIMEOUT_MS = 10_000;

/** Expo's token format: ExponentPushToken[…] (older builds: ExpoPushToken[…]). */
export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;

async function call(fn: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('The app is not connected to the club.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { error } = await supabase.rpc(fn, args).abortSignal(controller.signal);
    if (error) throw new Error(error.message);
  } finally {
    clearTimeout(timer);
  }
}

export function savePushDevice(token: string, platform: 'android' | 'ios', appVersion: string | null) {
  return call('register_push_device', { p_token: token, p_platform: platform, p_app_version: appVersion });
}

export function removePushDevice(token: string) {
  return call('unregister_push_device', { p_token: token });
}
