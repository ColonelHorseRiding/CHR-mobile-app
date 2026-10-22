import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/auth-provider';

import { fetchNotifications, fetchUnreadCount, markRead, NotificationsError, type AppNotification } from './notifications-api';

// ─── A change signal so the unread badge re-reads after a mark-as-read ──────
let version = 0;
const listeners = new Set<() => void>();
/** Re-reads the unread badge (after a mark-as-read, or when a push arrives). */
export function notifyChanged() {
  version += 1;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function useVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

function asError(error: unknown) {
  return error instanceof NotificationsError ? error : new NotificationsError('unknown', "Your notifications couldn't be loaded.");
}

type ListState = {
  userId: string | null;
  items: AppNotification[] | null;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: NotificationsError | null;
};

const empty = (userId: string | null): ListState => ({ userId, items: null, page: 0, hasMore: false, loading: true, error: null });

/**
 * The signed-in member's notifications, newest first, a page at a time. Tied
 * to the user id: another account starts empty and late replies are dropped.
 * A notification is shown as read only after the server has recorded it.
 */
export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<ListState>(() => empty(userId));
  const [marking, setMarking] = useState<Set<string> | 'all' | null>(null);
  const latestUser = useRef(userId);
  const request = useRef(0);

  useEffect(() => {
    latestUser.current = userId;
  }, [userId]);

  const load = useCallback(
    async (page: number) => {
      if (!userId) return;
      const id = ++request.current;
      setState((s) => (s.userId === userId ? { ...s, loading: true } : empty(userId)));
      try {
        const result = await fetchNotifications(userId, page);
        if (id !== request.current || latestUser.current !== userId) return;
        setState((s) => {
          const existing = page === 0 ? [] : (s.items ?? []);
          const seen = new Set(existing.map((n) => n.id));
          return {
            userId,
            items: [...existing, ...result.items.filter((n) => !seen.has(n.id))],
            page,
            hasMore: result.hasMore,
            loading: false,
            error: null,
          };
        });
      } catch (error) {
        if (id !== request.current || latestUser.current !== userId) return;
        setState((s) => ({ ...s, userId, loading: false, error: asError(error) }));
      }
    },
    [userId]
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(0), 0);
    return () => clearTimeout(timer);
  }, [load]);

  /** Marks one notification (or all) as read on the server, then reflects exactly what the server confirmed. */
  const markAsRead = useCallback(
    async (ids: string[] | null) => {
      if (!userId) return { ok: false as const };
      setMarking(ids ? new Set(ids) : 'all');
      try {
        await markRead(ids);
        if (latestUser.current !== userId) return { ok: false as const };
        const now = new Date().toISOString();
        setState((s) =>
          s.userId !== userId || !s.items
            ? s
            : { ...s, items: s.items.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n)) }
        );
        notifyChanged();
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error: asError(error) };
      } finally {
        setMarking(null);
      }
    },
    [userId]
  );

  const own = state.userId === userId ? state : empty(userId);
  return {
    ...own,
    marking,
    refresh: () => load(0),
    loadMore: () => load(own.page + 1),
    markAsRead,
  };
}

/** The server's unread count for the badge; null while unknown (never a guessed number). */
export function useUnreadCount() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const changes = useVersion();
  const [state, setState] = useState<{ userId: string | null; count: number | null }>({ userId, count: null });
  const latestUser = useRef(userId);

  useEffect(() => {
    latestUser.current = userId;
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const count = await fetchUnreadCount(userId);
      if (latestUser.current === userId) setState({ userId, count });
    } catch {
      if (latestUser.current === userId) setState({ userId, count: null });
    }
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, changes]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return state.userId === userId ? state.count : null;
}
