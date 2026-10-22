import { BookingError, client, timed, toBookingError } from './booking-api';

/**
 * The member's own classes, through the CHR website's existing backend.
 * Reads are the member's own `bookings` rows (RLS: user_id = auth.uid(), and
 * every query also filters by the session user id because staff can read all
 * rows), each with its embedded:
 *
 *   class_sessions     date and wall-clock times (IST)
 *   attendance         recorded by staff only (admin_mark_attendance); one row per booking
 *   credit_ledger      that booking's own ledger rows (append-only, server-written)
 *   memberships        the plan the booking belongs to, for its reschedule allowance
 *   original           the booking this one was moved from (reschedule chain)
 *
 * Changes go only through the server's own functions:
 *
 *   reschedule_booking(p_booking_id, p_new_session_id)
 *       One transaction: locks both classes, checks ownership, timing, plan,
 *       allowance, window, weekly limit, duplicates and places, marks the old
 *       booking 'rescheduled', creates the new one, counts one reschedule and
 *       writes a 0-amount ledger row. Any failure rolls all of it back, so the
 *       member keeps the original booking. No extra class is used.
 *   cancel_booking(p_booking_id, p_reason)
 *       Marks the booking cancelled. A class is returned only when the club's
 *       cancellation_returns_credit setting is on (and then only before
 *       cancellation_cutoff_hours); otherwise it is not.
 */

const PAGE_SIZE = 20;

export type AttendanceStatus = 'present' | 'absent' | 'no_show' | 'excused';

export type ClassRecord = {
  id: string;
  status: string;
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionStatus: string;
  bookedAt: string | null;
  cancelledAt: string | null;
  rescheduleCount: number;
  attendance: { status: AttendanceStatus | string; markedAt: string | null } | null;
  ledger: { amount: number; type: string }[];
  membership: {
    status: string;
    endDate: string | null;
    reschedulesAllowed: number | null;
    reschedulesUsed: number | null;
  } | null;
  /** The class this booking was moved from, when it was rescheduled. */
  movedFrom: { date: string; startTime: string; endTime: string } | null;
};

export type Page = { items: ClassRecord[]; hasMore: boolean };

export type BookingPolicy = {
  /** null when the setting couldn't be read — callers then assume no class is returned. */
  cancellationReturnsClass: boolean | null;
  cancellationCutoffHours: number | null;
  bookingWindowDays: number | null;
};

const SELECT = [
  'id, status, session_id, booked_at, cancelled_at, reschedule_count',
  'class_sessions!inner(session_date, start_time, end_time, status)',
  'attendance(status, marked_at)',
  'credit_ledger(amount, transaction_type)',
  'membership:memberships(status, end_date, reschedules_allowed, reschedules_used)',
  'original:original_booking_id(class_sessions(session_date, start_time, end_time))',
].join(', ');

type SessionRow = { session_date: string; start_time: string; end_time: string; status?: string };
type Row = {
  id: string;
  status: string;
  session_id: string;
  booked_at: string | null;
  cancelled_at: string | null;
  reschedule_count: number | null;
  class_sessions: SessionRow;
  attendance: { status: string; marked_at: string | null } | { status: string; marked_at: string | null }[] | null;
  credit_ledger: { amount: number; transaction_type: string }[] | null;
  membership: {
    status: string;
    end_date: string | null;
    reschedules_allowed: number | null;
    reschedules_used: number | null;
  } | null;
  original: { class_sessions: SessionRow | null } | null;
};

function toRecord(r: Row): ClassRecord {
  const att = Array.isArray(r.attendance) ? (r.attendance[0] ?? null) : r.attendance;
  const from = r.original?.class_sessions ?? null;
  return {
    id: r.id,
    status: r.status,
    sessionId: r.session_id,
    date: r.class_sessions.session_date,
    startTime: r.class_sessions.start_time,
    endTime: r.class_sessions.end_time,
    sessionStatus: r.class_sessions.status ?? 'open',
    bookedAt: r.booked_at,
    cancelledAt: r.cancelled_at,
    rescheduleCount: r.reschedule_count ?? 0,
    attendance: att ? { status: att.status, markedAt: att.marked_at } : null,
    ledger: (r.credit_ledger ?? []).map((l) => ({ amount: l.amount, type: l.transaction_type })),
    membership: r.membership
      ? {
          status: r.membership.status,
          endDate: r.membership.end_date,
          reschedulesAllowed: r.membership.reschedules_allowed,
          reschedulesUsed: r.membership.reschedules_used,
        }
      : null,
    movedFrom: from ? { date: from.session_date, startTime: from.start_time, endTime: from.end_time } : null,
  };
}

function bySessionAsc(a: ClassRecord, b: ClassRecord) {
  return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/** Booked classes from today on (the caller splits off any that have already ended). */
export async function fetchUpcomingClasses(userId: string, today: string): Promise<ClassRecord[]> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db
      .from('bookings')
      .select(SELECT)
      .eq('user_id', userId)
      .in('status', ['held', 'confirmed'])
      .gte('class_sessions.session_date', today)
      .order('class_sessions(session_date)', { ascending: true })
      .order('class_sessions(start_time)', { ascending: true })
      .limit(50)
      .abortSignal(signal)
  );
  if (error) throw toBookingError(error, "Your classes couldn't be loaded.");
  return ((data ?? []) as unknown as Row[]).map(toRecord).sort(bySessionAsc);
}

/**
 * Classes on or before today: ridden, absent, no-show, expired, and booked
 * classes still waiting for attendance. Newest first, one page at a time.
 */
export async function fetchPastClasses(userId: string, today: string, page: number): Promise<Page> {
  const db = client();
  const from = page * PAGE_SIZE;
  const { data, error } = await timed((signal) =>
    db
      .from('bookings')
      .select(SELECT)
      .eq('user_id', userId)
      .in('status', ['completed', 'absent', 'no_show', 'expired', 'held', 'confirmed'])
      .lte('class_sessions.session_date', today)
      .order('class_sessions(session_date)', { ascending: false })
      .order('class_sessions(start_time)', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
      .abortSignal(signal)
  );
  if (error) throw toBookingError(error, "Your class history couldn't be loaded.");
  const rows = (data ?? []) as unknown as Row[];
  return { items: rows.map(toRecord), hasMore: rows.length === PAGE_SIZE };
}

/** Cancelled classes, most recently cancelled first, one page at a time. */
export async function fetchCancelledClasses(userId: string, page: number): Promise<Page> {
  const db = client();
  const from = page * PAGE_SIZE;
  const { data, error } = await timed((signal) =>
    db
      .from('bookings')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('status', 'cancelled')
      .order('cancelled_at', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1)
      .abortSignal(signal)
  );
  if (error) throw toBookingError(error, "Your cancelled classes couldn't be loaded.");
  const rows = (data ?? []) as unknown as Row[];
  return { items: rows.map(toRecord), hasMore: rows.length === PAGE_SIZE };
}

/** One of the member's own bookings, or null if it isn't theirs / doesn't exist. */
export async function fetchClassRecord(userId: string, bookingId: string): Promise<ClassRecord | null> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db.from('bookings').select(SELECT).eq('user_id', userId).eq('id', bookingId).abortSignal(signal).maybeSingle()
  );
  if (error) throw toBookingError(error, "This class couldn't be loaded.");
  return data ? toRecord(data as unknown as Row) : null;
}

/** The booking a moved class became (bookings.original_booking_id = the old id). */
export async function findMovedTo(userId: string, oldBookingId: string): Promise<ClassRecord | null> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db
      .from('bookings')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('original_booking_id', oldBookingId)
      .order('booked_at', { ascending: false })
      .limit(1)
      .abortSignal(signal)
  );
  if (error) throw toBookingError(error, "We couldn't check your booking.");
  const row = ((data ?? []) as unknown as Row[])[0];
  return row ? toRecord(row) : null;
}

/** The club's published booking settings (system_settings is readable by everyone). */
export async function fetchBookingPolicy(): Promise<BookingPolicy> {
  const db = client();
  try {
    const { data, error } = await timed((signal) =>
      db
        .from('system_settings')
        .select('key, value')
        .in('key', ['cancellation_returns_credit', 'cancellation_cutoff_hours', 'booking_window_days'])
        .abortSignal(signal)
    );
    if (error) throw error;
    const map = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const returns = map.get('cancellation_returns_credit');
    const cutoff = map.get('cancellation_cutoff_hours');
    const window = map.get('booking_window_days');
    return {
      cancellationReturnsClass: typeof returns === 'boolean' ? returns : null,
      cancellationCutoffHours: typeof cutoff === 'number' ? cutoff : null,
      bookingWindowDays: typeof window === 'number' ? window : null,
    };
  } catch {
    return { cancellationReturnsClass: null, cancellationCutoffHours: null, bookingWindowDays: null };
  }
}

// ─── Changes (server functions only) ────────────────────────────────────────

type BookingRow = { id: string };

/** Moves a booked class. A 'network' error means the outcome is unknown. */
export async function rescheduleBooking(bookingId: string, newSessionId: string): Promise<string> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db.rpc('reschedule_booking', { p_booking_id: bookingId, p_new_session_id: newSessionId }).abortSignal(signal)
  );
  if (error) throw toBookingError(error, "We couldn't move this class. Please try again.");
  const row = data as BookingRow | null;
  if (!row?.id) throw new BookingError('network', "We couldn't confirm the change.");
  return row.id;
}

/** Cancels a booked class. A 'network' error means the outcome is unknown. */
export async function cancelBooking(bookingId: string): Promise<void> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db.rpc('cancel_booking', { p_booking_id: bookingId, p_reason: null }).abortSignal(signal)
  );
  if (error) throw toBookingError(error, "We couldn't cancel this class. Please try again.");
  if (!(data as BookingRow | null)?.id) throw new BookingError('network', "We couldn't confirm the cancellation.");
}
