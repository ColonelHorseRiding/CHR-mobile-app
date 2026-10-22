import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { todayIST } from '@/features/dashboard/dashboard-data';

import { BookingError } from './booking-api';
import { useBookingsVersion } from './booking-events';
import { classGroup } from './class-status';
import { fetchCancelledClasses, fetchPastClasses, fetchUpcomingClasses, type ClassRecord, type Page } from './my-classes-api';

export type ListKey = 'upcoming' | 'past' | 'cancelled';

type List = {
  items: ClassRecord[] | null;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: BookingError | null;
  loadedAt: number | null;
};

type State = { userId: string | null } & Record<ListKey, List>;

const emptyList = (): List => ({ items: null, page: 0, hasMore: false, loading: true, error: null, loadedAt: null });
const fresh = (userId: string | null): State => ({ userId, upcoming: emptyList(), past: emptyList(), cancelled: emptyList() });

const FOCUS_REFRESH_MS = 15_000;

function asError(error: unknown) {
  return error instanceof BookingError ? error : new BookingError('unknown', "Your classes couldn't be loaded.");
}

/** Adds rows to a list once each (a booking never appears twice). */
function merge(existing: ClassRecord[], next: ClassRecord[]) {
  const seen = new Set(existing.map((r) => r.id));
  return [...existing, ...next.filter((r) => !seen.has(r.id))];
}

/**
 * The signed-in member's classes in three lists. Everything is tied to the
 * user id: a new account starts empty and late replies for another account
 * are dropped. Lists re-read after any booking change, on focus (throttled)
 * and on request.
 */
export function useMyClasses() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const bookingsVersion = useBookingsVersion();
  const [state, setState] = useState<State>(() => fresh(userId));
  const latestUser = useRef(userId);
  const requests = useRef<Record<ListKey, number>>({ upcoming: 0, past: 0, cancelled: 0 });

  useEffect(() => {
    latestUser.current = userId;
  }, [userId]);

  const patch = useCallback(
    (key: ListKey, update: (list: List) => List) =>
      setState((s) => (s.userId === userId ? { ...s, [key]: update(s[key]) } : { ...fresh(userId), [key]: update(emptyList()) })),
    [userId]
  );

  const load = useCallback(
    async (key: ListKey, page = 0) => {
      if (!userId) return;
      const id = ++requests.current[key];
      patch(key, (l) => ({ ...l, loading: true }));
      try {
        const today = todayIST();
        const now = Date.now();
        let result: Page;
        if (key === 'upcoming') {
          const all = await fetchUpcomingClasses(userId, today);
          result = { items: all.filter((r) => classGroup(r, now) === 'upcoming'), hasMore: false };
        } else if (key === 'past') {
          const p = await fetchPastClasses(userId, today, page);
          // Today's classes that haven't finished yet belong to Upcoming.
          result = { items: p.items.filter((r) => classGroup(r, now) === 'past'), hasMore: p.hasMore };
        } else {
          result = await fetchCancelledClasses(userId, page);
        }
        if (id !== requests.current[key] || latestUser.current !== userId) return;
        patch(key, (l) => ({
          items: page === 0 ? result.items : merge(l.items ?? [], result.items),
          page,
          hasMore: result.hasMore,
          loading: false,
          error: null,
          loadedAt: Date.now(),
        }));
      } catch (error) {
        if (id !== requests.current[key] || latestUser.current !== userId) return;
        // Rows already shown stay visible, flagged as possibly out of date.
        patch(key, (l) => ({ ...l, loading: false, error: asError(error) }));
      }
    },
    [userId, patch]
  );

  const refresh = useCallback(async () => {
    await Promise.all([load('upcoming'), load('past'), load('cancelled')]);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh, bookingsVersion]);

  const loadedAt = state.userId === userId ? state.upcoming.loadedAt : null;
  useFocusEffect(
    useCallback(() => {
      if (loadedAt && Date.now() - loadedAt > FOCUS_REFRESH_MS) void refresh();
    }, [loadedAt, refresh])
  );

  const own = state.userId === userId ? state : fresh(userId);
  return {
    lists: own,
    refresh,
    retry: (key: ListKey) => load(key, 0),
    loadMore: (key: ListKey) => load(key, own[key].page + 1),
  };
}
