import 'expo-sqlite/localStorage/install';

/**
 * Persistent store for the Supabase session on Android/iOS: the expo-sqlite
 * `localStorage` shim (Expo's recommended Supabase setup). Data lives in the
 * app's private sandbox and is removed when the app is uninstalled.
 */
export const authStorage = globalThis.localStorage;
