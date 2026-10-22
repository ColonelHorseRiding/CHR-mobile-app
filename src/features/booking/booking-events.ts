import { useSyncExternalStore } from 'react';

/**
 * A counter bumped whenever a booking is confirmed (or may have been). Screens
 * that show bookings or class balances watch it and re-read the server, so the
 * schedule and dashboard never keep showing pre-booking numbers.
 */
let version = 0;
const listeners = new Set<() => void>();

export function notifyBookingsChanged() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBookingsVersion() {
  return useSyncExternalStore(subscribe, () => version);
}
