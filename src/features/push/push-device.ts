import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { authStorage } from '@/services/supabase/storage';

import { Notifications } from './notifications-module';
import { EXPO_TOKEN_RE, removePushDevice, savePushDevice } from './push-api';

/**
 * This phone's side of phone alerts: the Android channel, the permission, the
 * Expo push token and its registration with the club. Nothing here can stop
 * the app working — every failure resolves to a status, never a throw.
 */

/** Must match the config plugin's `defaultChannel` in app.json. */
export const CHANNEL_ID = 'club-updates';
const TOKEN_KEY = 'chr.push.token';
const ASKED_KEY = 'chr.push.asked';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PushStatus = 'registered' | 'denied' | 'undetermined' | 'unavailable' | 'failed' | 'withdrawn';

// Foreground alerts: show them as a banner too (the badge refresh is done by the listener).
try {
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Alerts simply stay unavailable.
}

function read(key: string) {
  try {
    return authStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) authStorage?.removeItem(key);
    else authStorage?.setItem(key, value);
  } catch {
    // Storage is a convenience here; the server registration is what counts.
  }
}

function projectId() {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

async function ensureChannel() {
  if (!Notifications || Platform.OS !== 'android') return;
  // Android 13+ shows the permission prompt only once a channel exists.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Club updates',
    description: 'Bookings, class reminders, memberships, payments and orders',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#C9A86A',
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** The phone's current permission, without asking. */
export async function pushPermission(): Promise<{ status: PushStatus; canAsk: boolean }> {
  if (!Notifications || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return { status: 'unavailable', canAsk: false };
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return { status: 'registered', canAsk: false };
    return { status: p.status === 'undetermined' ? 'undetermined' : 'denied', canAsk: p.canAskAgain };
  } catch {
    return { status: 'unavailable', canAsk: false };
  }
}

/**
 * Registers this phone for the signed-in member. With `prompt`, asks for
 * permission if the system still allows asking; otherwise only proceeds when
 * permission was already given. Re-running is safe: the server upserts.
 */
export async function registerThisDevice({ prompt }: { prompt: boolean }): Promise<PushStatus> {
  if (!Notifications || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return 'unavailable';
  // Emulators are tried too: one with Google Play services can receive pushes.
  // Where getting a token fails on an emulator, alerts are simply unavailable there.
  let stage: 'token' | 'server' = 'token';
  try {
    await ensureChannel();
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && prompt && permission.canAskAgain) {
      write(ASKED_KEY, '1');
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return permission.status === 'undetermined' ? 'undetermined' : 'denied';

    const id = projectId();
    if (!id) return 'failed';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!EXPO_TOKEN_RE.test(token)) return 'failed';

    stage = 'server';
    await savePushDevice(token, Platform.OS, Constants.expoConfig?.version ?? null);
    write(TOKEN_KEY, token);
    return 'registered';
  } catch (error) {
    // The member switched phone alerts off in Privacy & data: respected quietly, not an error.
    if (error instanceof Error && error.message === 'PUSH_WITHDRAWN') return 'withdrawn';
    // The reason only (never the token), for diagnosing a phone in the field.
    console.warn(`Phone alerts: ${stage} step failed: ${error instanceof Error ? error.message : String(error)}`);
    return stage === 'token' && !Device.isDevice ? 'unavailable' : 'failed';
  }
}

/** Whether the app has already shown its one automatic permission prompt on this phone. */
export function hasAskedBefore() {
  return read(ASKED_KEY) === '1';
}

/** Called just before sign-out (while the session is still valid): stop alerts for this member on this phone only. */
export async function unregisterThisDevice() {
  const token = read(TOKEN_KEY);
  if (!token) return;
  try {
    await removePushDevice(token);
  } catch {
    // Offline: the server also drops the registration when the token is next claimed or found invalid.
  } finally {
    write(TOKEN_KEY, null);
  }
}

/** Re-sends a changed token (Expo/FCM can rotate it) for the signed-in member. */
export function onTokenChange(callback: () => void) {
  if (!Notifications) return { remove() {} };
  return Notifications.addPushTokenListener(() => callback());
}
