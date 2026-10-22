import { supabase } from '@/services/supabase/client';

/**
 * Class booking, through the CHR website's existing backend (shared Supabase
 * project). The app only reads and asks; the database decides:
 *
 *   member_booking_eligibility()   RPC: the member's current plan, classes left, and the
 *                                  bookable date range (today … min(window, plan end))
 *   class_sessions                 sessions generated in advance from the club timetable
 *                                  (read here only to know which days have classes)
 *   session_availability(p_date)   RPC: each session's places left, whether it can be
 *                                  booked now, and whether the member already holds it
 *   book_class(p_session_id)       RPC: one transaction that locks the session, checks
 *                                  plan, classes left, window, weekly and upcoming-class
 *                                  limits, duplicates and capacity, then creates the
 *                                  booking and takes 1 class off the plan
 *   bookings                       the member's own rows (RLS), used to reconcile an
 *                                  uncertain booking request
 *
 * There is no horse in this model: the coach assigns horses at the ground.
 */

const TIMEOUT_MS = 15_000;

export type Eligibility = {
  hasActiveMembership: boolean;
  membershipEndDate: string | null;
  creditsRemaining: number | null;
  /** First and last bookable dates (IST), already limited by the server to the plan's end. */
  minDate: string | null;
  maxDate: string | null;
  blockLimit: number | null;
  blockUsed: number | null;
  blockEnd: string | null;
};

export type SessionSlot = {
  id: string;
  date: string;
  /** Wall-clock times at the club (IST), "HH:MM:SS", exactly as stored. */
  startTime: string;
  endTime: string;
  status: string;
  capacity: number;
  placesLeft: number;
  isBookable: boolean;
  isMine: boolean;
};

export type ConfirmedBooking = {
  bookingId: string;
  sessionId: string;
  status: string;
  bookedAt: string | null;
};

export type BookingErrorKind =
  | 'network' // request failed or timed out — a booking may or may not exist
  | 'session' // signed out / token rejected
  | 'stale' // the class changed: full, closed, started or gone
  | 'ineligible' // no plan, no classes left, plan ends before the class
  | 'limit' // weekly or upcoming-class limit
  | 'duplicate' // already booked into this class
  | 'not-allowed' // this booking can't be moved or cancelled (state, allowance, timing)
  | 'unknown';

export class BookingError extends Error {
  constructor(
    readonly kind: BookingErrorKind,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

/**
 * Codes raised by book_class(), reschedule_booking() and cancel_booking();
 * `details` is rider-facing copy written by the server.
 */
const CODES: Record<string, [BookingErrorKind, string, boolean]> = {
  // [kind, fallback message, use server detail when present]
  NO_ACTIVE_MEMBERSHIP: ['ineligible', "You don't have an active plan. Choose one in the Store to book classes.", false],
  NO_CREDITS_REMAINING: ['ineligible', 'You have no classes left on your plan.', false],
  MEMBERSHIP_EXPIRED: ['ineligible', 'This class falls after your plan ends. Choose an earlier date.', true],
  WEEKLY_LIMIT_REACHED: ['limit', "You've reached the class limit for that week. Pick a day in another week.", true],
  FUTURE_BOOKING_LIMIT: ['limit', 'You have reached the number of upcoming classes you can hold at once.', true],
  SESSION_NOT_FOUND: ['stale', 'This class is no longer on the schedule.', false],
  SESSION_NOT_AVAILABLE: ['stale', 'This class is not open for booking.', true],
  SESSION_FULL: ['stale', 'That class has just filled up. Please pick another time.', false],
  INVALID_SESSION_DATE: ['stale', "This class can't be booked.", true],
  DUPLICATE_BOOKING: ['duplicate', "You're already booked into this class.", false],
  // weekly schedule (confirm_recurring_schedule / book_replacement)
  TOO_MANY_SLOTS: ['limit', 'Your plan allows fewer classes a week than that.', true],
  INVALID_SLOTS: ['stale', 'Choose at least one day and time from the timetable.', true],
  PLAN_NOT_RECURRING: ['ineligible', 'Your plan does not include a weekly schedule.', true],
  NOT_A_SCHEDULE_CLASS: ['not-allowed', 'That class is not part of your weekly schedule.', false],
  ALREADY_REPLACED: ['not-allowed', 'This class has already been replaced.', false],
  NOT_EXCUSED: ['not-allowed', 'Only a class the club excused can be replaced this way.', true],
  // reschedule_booking() / cancel_booking()
  BOOKING_NOT_FOUND: ['not-allowed', "We couldn't find this booking.", false],
  BOOKING_NOT_RESCHEDULABLE: ['not-allowed', 'This class can no longer be moved.', true],
  ALREADY_RESCHEDULED: ['not-allowed', "This class has already been moved once and can't be moved again.", true],
  RESCHEDULE_LIMIT_REACHED: ['not-allowed', "You've used all the reschedules on this plan.", true],
  RESCHEDULE_WINDOW_CLOSED: ['not-allowed', "This class has already started, so it can't be moved.", true],
  SAME_SLOT: ['stale', "That's the time you already have. Choose a different one.", false],
  BOOKING_NOT_CANCELLABLE: ['not-allowed', 'This class can no longer be cancelled.', true],
  'Not authorized to cancel this booking': ['not-allowed', 'You can only cancel your own classes.', false],
  'Not authenticated': ['session', 'Your session has expired. Please sign in again.', false],
};

export function client() {
  if (!supabase) throw new BookingError('unknown', 'The app is not connected to the club.');
  return supabase;
}

function isNetworkMessage(text: string) {
  return /network|fetch|timed? ?out|abort/i.test(text);
}

type PgError = { message: string; details?: string | null; code?: string };

export function toBookingError(error: PgError, fallback: string): BookingError {
  const code = error.message?.trim();
  const known = CODES[code];
  if (known) {
    const [kind, message, useDetail] = known;
    return new BookingError(kind, useDetail && error.details ? error.details : message, code);
  }
  if (error.code === 'PGRST301' || /jwt/i.test(error.message)) {
    return new BookingError('session', CODES['Not authenticated'][1], 'Not authenticated');
  }
  if (isNetworkMessage(error.message)) return new BookingError('network', "We couldn't reach the club's servers.");
  // Never surface raw database text.
  return new BookingError('unknown', fallback);
}

/** Runs a Supabase request with a timeout that also aborts the HTTP request. */
export async function timed<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new BookingError('network', "We couldn't reach the club's servers."));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } catch (error) {
    if (error instanceof BookingError) throw error;
    throw new BookingError('network', "We couldn't reach the club's servers.");
  } finally {
    clearTimeout(timer);
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

type EligibilityRow = {
  has_active_membership: boolean;
  membership_end_date: string | null;
  credits_remaining: number | null;
  min_bookable_date: string | null;
  max_bookable_date: string | null;
  block_class_limit: number | null;
  block_classes_used: number | null;
  current_block_end: string | null;
};

export async function fetchEligibility(): Promise<Eligibility> {
  const db = client();
  const { data, error } = await timed((signal) => db.rpc('member_booking_eligibility').abortSignal(signal));
  if (error) throw toBookingError(error, "Your booking details couldn't be loaded.");
  const row = ((data ?? []) as EligibilityRow[])[0];
  return {
    hasActiveMembership: row?.has_active_membership === true,
    membershipEndDate: row?.membership_end_date ?? null,
    creditsRemaining: row?.credits_remaining ?? null,
    minDate: row?.min_bookable_date ?? null,
    maxDate: row?.max_bookable_date ?? null,
    blockLimit: row?.block_class_limit ?? null,
    blockUsed: row?.block_classes_used ?? null,
    blockEnd: row?.current_block_end ?? null,
  };
}

/** Days in [min, max] that have at least one open, generated session. */
export async function fetchClassDays(min: string, max: string): Promise<Set<string>> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db
      .from('class_sessions')
      .select('session_date')
      .eq('status', 'open')
      .gte('session_date', min)
      .lte('session_date', max)
      .abortSignal(signal)
  );
  if (error) throw toBookingError(error, "The schedule couldn't be loaded.");
  return new Set(((data ?? []) as { session_date: string }[]).map((r) => r.session_date));
}

/** Days in [min, max] on which this member already holds a class (own rows only). */
export async function fetchMyClassDays(userId: string, min: string, max: string): Promise<Set<string>> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db
      .from('bookings')
      .select('class_sessions!inner(session_date)')
      .eq('user_id', userId)
      .in('status', ['held', 'confirmed'])
      .gte('class_sessions.session_date', min)
      .lte('class_sessions.session_date', max)
      .abortSignal(signal)
  );
  if (error) throw toBookingError(error, "The schedule couldn't be loaded.");
  const rows = (data ?? []) as unknown as { class_sessions: { session_date: string } | null }[];
  return new Set(rows.map((r) => r.class_sessions?.session_date).filter((d): d is string => !!d));
}

type AvailabilityRow = {
  session_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_status: string;
  capacity: number;
  places_left: number;
  is_bookable: boolean;
  is_mine: boolean;
};

export async function fetchDaySessions(date: string): Promise<SessionSlot[]> {
  const db = client();
  const { data, error } = await timed((signal) => db.rpc('session_availability', { p_date: date }).abortSignal(signal));
  if (error) throw toBookingError(error, "The classes for this day couldn't be loaded.");
  return ((data ?? []) as AvailabilityRow[]).map((r) => ({
    id: r.session_id,
    date: r.session_date,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.session_status,
    capacity: r.capacity,
    placesLeft: r.places_left,
    isBookable: r.is_bookable,
    isMine: r.is_mine,
  }));
}

type BookingRow = { id: string; session_id: string; status: string; booked_at: string | null };

/**
 * The member's active booking for a session, if any. Used to settle a request
 * whose response never arrived: the server may have booked it regardless.
 */
export async function findMyBooking(userId: string, sessionId: string): Promise<ConfirmedBooking | null> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db
      .from('bookings')
      .select('id, session_id, status, booked_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .in('status', ['held', 'confirmed'])
      .order('booked_at', { ascending: false })
      .limit(1)
      .abortSignal(signal)
  );
  if (error) throw toBookingError(error, "We couldn't check your booking.");
  const row = ((data ?? []) as BookingRow[])[0];
  return row ? { bookingId: row.id, sessionId: row.session_id, status: row.status, bookedAt: row.booked_at } : null;
}

// ─── Booking ────────────────────────────────────────────────────────────────

/**
 * Asks the server to book one place. Only the session id is sent; the server
 * picks the membership, checks every rule and takes the class off the plan in
 * the same transaction. A 'network' error means the outcome is unknown.
 */
export async function bookClass(sessionId: string): Promise<ConfirmedBooking> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db.rpc('book_class', { p_session_id: sessionId }).abortSignal(signal)
  );
  if (error) throw toBookingError(error, "We couldn't book this class. Please try again.");
  const row = data as BookingRow | null;
  if (!row?.id) throw new BookingError('network', "We couldn't confirm the booking.");
  return { bookingId: row.id, sessionId: row.session_id, status: row.status, bookedAt: row.booked_at };
}
