import { supabase } from '@/services/supabase/client';

/**
 * The member's notification centre, from the CHR backend's `notifications`
 * table (shared with the website's bell). Records are written only by the
 * server (`_notify_user` inside booking, payment, order and membership
 * functions); RLS lets a member read only `audience = 'user'` rows addressed to
 * them, and every query here also filters by the session user id because
 * staff can read the admin feed. A record here is NOT proof that anything was
 * pushed to a phone: delivery is separate (push-send, see features/push).
 *
 *   mark_notifications_read(p_ids uuid[] | null)
 *     sets read_at on the caller's own unread rows (all of them when null) and
 *     returns how many it changed. The only write this module makes.
 */

const PAGE_SIZE = 20;
const TIMEOUT_MS = 15_000;

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export class NotificationsError extends Error {
  constructor(
    readonly kind: 'network' | 'session' | 'unknown',
    message: string
  ) {
    super(message);
  }
}

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

async function timed<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new NotificationsError('network', "We couldn't reach the club's servers."));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } catch (error) {
    if (error instanceof NotificationsError) throw error;
    throw new NotificationsError('network', "We couldn't reach the club's servers.");
  } finally {
    clearTimeout(timer);
  }
}

function toError(error: { message: string; code?: string }, fallback: string) {
  if (error.code === 'PGRST301' || /jwt|not authenticated/i.test(error.message)) {
    return new NotificationsError('session', 'Your session has expired. Please sign in again.');
  }
  if (/network|fetch|abort|timed? ?out/i.test(error.message)) {
    return new NotificationsError('network', "We couldn't reach the club's servers.");
  }
  return new NotificationsError('unknown', fallback);
}

function client() {
  if (!supabase) throw new NotificationsError('unknown', 'The app is not connected to the club.');
  return supabase;
}

export async function fetchNotifications(userId: string, page: number) {
  const db = client();
  const from = page * PAGE_SIZE;
  const { data, error } = await timed((signal) =>
    db
      .from('notifications')
      .select('id, type, title, body, data, read_at, created_at')
      .eq('audience', 'user')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
      .abortSignal(signal)
  );
  if (error) throw toError(error, "Your notifications couldn't be loaded.");
  const rows = (data ?? []) as Row[];
  return {
    items: rows.map(
      (r): AppNotification => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        data: r.data ?? {},
        readAt: r.read_at,
        createdAt: r.created_at,
      })
    ),
    hasMore: rows.length === PAGE_SIZE,
  };
}

/** How many of the member's notifications are unread, counted by the server. */
export async function fetchUnreadCount(userId: string) {
  const db = client();
  const { count, error } = await timed((signal) =>
    db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('audience', 'user')
      .eq('user_id', userId)
      .is('read_at', null)
      .abortSignal(signal)
  );
  if (error) throw toError(error, "Your notifications couldn't be checked.");
  return count ?? 0;
}

/** Marks the given notifications (or all of the member's, when null) as read. Resolves only once the server has done it. */
export async function markRead(ids: string[] | null) {
  const db = client();
  const { data, error } = await timed((signal) => db.rpc('mark_notifications_read', { p_ids: ids }).abortSignal(signal));
  if (error) throw toError(error, "We couldn't mark that as read.");
  return typeof data === 'number' ? data : 0;
}
