import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useProfileVersion } from '@/features/account/profile-api';
import { useAuth } from '@/features/auth/auth-provider';
import { useBookingsVersion } from '@/features/booking/booking-events';

import { DashboardError, fetchDashboard, type DashboardData } from './dashboard-data';

type State = {
  /** Whose data this is; anything for another user is discarded, never shown. */
  userId: string | null;
  data: DashboardData | null;
  /** When `data` was last confirmed by the server. */
  loadedAt: number | null;
  error: DashboardError | null;
  loading: boolean;
};

/** Re-checking on every tab switch would be wasteful; a focus refresh waits at least this long. */
const FOCUS_REFRESH_MS = 30_000;

/**
 * Loads the signed-in member's dashboard and keeps it current: on first view,
 * whenever the screen regains focus (e.g. after a purchase), and on request.
 * Data lives only in memory and is tied to the user id, so signing out or
 * switching accounts can never show the previous member's details.
 */
export function useDashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<State>({ userId, data: null, loadedAt: null, error: null, loading: true });
  const inFlight = useRef<Promise<void> | null>(null);
  const latestUser = useRef(userId);

  // A new account must never reuse (or receive) the previous account's request.
  useEffect(() => {
    latestUser.current = userId;
    inFlight.current = null;
  }, [userId]);

  const load = useCallback(() => {
    if (!userId) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    setState((s) => (s.userId === userId ? { ...s, loading: true } : { userId, data: null, loadedAt: null, error: null, loading: true }));
    const request = fetchDashboard(userId)
      .then((data) => {
        if (latestUser.current !== userId) return;
        setState({ userId, data, loadedAt: Date.now(), error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (latestUser.current !== userId) return;
        const failure = error instanceof DashboardError ? error : new DashboardError('unknown', "Your details couldn't be loaded.");
        // Keep the last confirmed snapshot (same user only) so the screen stays useful, flagged as not current.
        setState((s) => ({ ...s, userId, error: failure, loading: false }));
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [userId]);

  // New user (or first mount): load from scratch. A booking re-reads the balance.
  const bookingsVersion = useBookingsVersion();
  const profileVersion = useProfileVersion();
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, bookingsVersion, profileVersion]);

  // Returning to the dashboard (e.g. from checkout) re-reads the server, throttled.
  const loadedAt = state.loadedAt;
  useFocusEffect(
    useCallback(() => {
      if (loadedAt && Date.now() - loadedAt > FOCUS_REFRESH_MS) void load();
    }, [loadedAt, load])
  );

  const own = state.userId === userId;
  return {
    data: own ? state.data : null,
    error: own ? state.error : null,
    loading: own ? state.loading : true,
    loadedAt: own ? state.loadedAt : null,
    refresh: load,
  };
}
