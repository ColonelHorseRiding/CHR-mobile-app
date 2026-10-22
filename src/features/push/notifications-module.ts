import type * as NotificationsApi from 'expo-notifications';

/**
 * `expo-notifications`, or null when this build doesn't contain its native code
 * (Expo Go, or a development build made before it was added). Importing it
 * normally would throw while the app starts; loading it here turns that into
 * "phone alerts are unavailable" and leaves the rest of the app untouched.
 */
let loaded: typeof NotificationsApi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  loaded = require('expo-notifications') as typeof NotificationsApi;
} catch {
  loaded = null;
}

export const Notifications = loaded;
