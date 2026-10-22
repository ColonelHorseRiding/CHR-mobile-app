import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';

import { fetchOrders, OrdersError, type OrderFilter, type OrderSummary } from './orders-api';

type State = {
  userId: string | null;
  filter: OrderFilter;
  items: OrderSummary[] | null;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: OrdersError | null;
  loadedAt: number | null;
};

const FOCUS_REFRESH_MS = 15_000;

const fresh = (userId: string | null, filter: OrderFilter): State => ({
  userId,
  filter,
  items: null,
  page: 0,
  hasMore: false,
  loading: true,
  error: null,
  loadedAt: null,
});

/**
 * The signed-in customer's orders for one filter, newest first, a page at a
 * time. Tied to the user id: another account starts empty and late replies
 * for an older request, filter or user are dropped.
 */
export function useOrders(filter: OrderFilter) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<State>(() => fresh(userId, filter));
  const request = useRef(0);
  const latest = useRef({ userId, filter });

  useEffect(() => {
    latest.current = { userId, filter };
  }, [userId, filter]);

  const load = useCallback(
    async (page: number) => {
      if (!userId) return;
      const id = ++request.current;
      setState((s) => (s.userId === userId && s.filter === filter ? { ...s, loading: true } : { ...fresh(userId, filter) }));
      try {
        const result = await fetchOrders(userId, filter, page);
        if (id !== request.current || latest.current.userId !== userId || latest.current.filter !== filter) return;
        setState((s) => {
          const existing = page === 0 ? [] : (s.items ?? []);
          const seen = new Set(existing.map((o) => o.id));
          return {
            userId,
            filter,
            items: [...existing, ...result.items.filter((o) => !seen.has(o.id))],
            page,
            hasMore: result.hasMore,
            loading: false,
            error: null,
            loadedAt: Date.now(),
          };
        });
      } catch (error) {
        if (id !== request.current || latest.current.userId !== userId || latest.current.filter !== filter) return;
        const failure = error instanceof OrdersError ? error : new OrdersError('unknown', "Your orders couldn't be loaded.");
        // Orders already shown stay visible, flagged as possibly out of date.
        setState((s) => ({ ...s, loading: false, error: failure }));
      }
    },
    [userId, filter]
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(0), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const own = state.userId === userId && state.filter === filter ? state : fresh(userId, filter);
  const loadedAt = own.loadedAt;
  useFocusEffect(
    useCallback(() => {
      // Back from an order (e.g. after paying): its status may have changed.
      if (loadedAt && Date.now() - loadedAt > FOCUS_REFRESH_MS) void load(0);
    }, [loadedAt, load])
  );

  return {
    ...own,
    refresh: () => load(0),
    loadMore: () => load(own.page + 1),
  };
}
