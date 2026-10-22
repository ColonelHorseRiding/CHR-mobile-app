/** The web app has no phone alerts; these keep the same shape as the native module. */

export type PushStatus = 'registered' | 'denied' | 'undetermined' | 'unavailable' | 'failed' | 'withdrawn';

export async function pushPermission(): Promise<{ status: PushStatus; canAsk: boolean }> {
  return { status: 'unavailable', canAsk: false };
}

export async function registerThisDevice(_: { prompt: boolean }): Promise<PushStatus> {
  return 'unavailable';
}

export function hasAskedBefore() {
  return true;
}

export async function unregisterThisDevice() {}

export function onTokenChange(_: () => void) {
  return { remove() {} };
}
