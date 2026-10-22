import { addDays } from './recurring-presentation';
import type { Occurrence, WeeklySlot } from './recurring-presentation';
import { BookingError, client, fetchDaySessions, timed, toBookingError, type SessionSlot } from './booking-api';

/**
 * The weekly-schedule calls (proposal 0027_recurring_weekly_bookings.sql).
 * All of them run as the signed-in member; the server decides what is booked,
 * what it costs and what is full. Until that migration is applied these calls
 * report "unsupported" and the screen says so, rather than failing.
 *
 *   confirm_recurring_schedule(p_slots)   sets or changes the weekly pattern and books the matching classes
 *   end_recurring_schedule()              stops the pattern; bookings already made stay
 *   my_recurring_schedule()               the pattern, the classes it produced and their live state
 *   book_replacement(booking, session)    replaces a class the club excused, using the restored credit
 *   session_availability_range(from, to)  a week of classes and places left in one call
 */

/** PostgREST: the function (or column) does not exist yet. */
const MISSING = new Set(['PGRST202', '42883', '42703', '42P01', 'PGRST205']);

export type RecurringPlan = { planName: string; slotsPerWeek: number; validUntil: string } | null;

export type MySchedule = {
  scheduleId: string;
  planName: string;
  slotsPerWeek: number;
  validUntil: string;
  creditsRemaining: number;
  slots: WeeklySlot[];
  occurrences: Occurrence[];
};

export type ConfirmResult = { booked: number; skippedFull: number; skippedNoCredits: number; created: boolean; changed: boolean };

type Json = Record<string, unknown>;

/** The member's plan, if it allows a weekly schedule; `unsupported` before the migration is applied. */
export async function fetchRecurringPlan(userId: string, today: string): Promise<{ supported: boolean; plan: RecurringPlan }> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db
      .from('memberships')
      .select('end_date, membership_plans(name, recurring_slots_per_week)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('end_date', today)
      .order('end_date', { ascending: true })
      .abortSignal(signal)
  );
  if (error) {
    if (MISSING.has(error.code ?? '') || /recurring_slots_per_week/.test(error.message)) return { supported: false, plan: null };
    throw toBookingError(error, "Your plan couldn't be loaded.");
  }
  type Row = { end_date: string; membership_plans: { name: string; recurring_slots_per_week: number } | { name: string; recurring_slots_per_week: number }[] | null };
  for (const row of (data ?? []) as unknown as Row[]) {
    const p = Array.isArray(row.membership_plans) ? row.membership_plans[0] : row.membership_plans;
    if (p && p.recurring_slots_per_week > 0) {
      return { supported: true, plan: { planName: p.name, slotsPerWeek: p.recurring_slots_per_week, validUntil: row.end_date } };
    }
  }
  return { supported: true, plan: null };
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

/** Seven days of classes. Falls back to one call per day if the range function isn't deployed. */
export async function fetchWeekSessions(start: string): Promise<SessionSlot[]> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db.rpc('session_availability_range', { p_from: start, p_to: addDays(start, 6) }).abortSignal(signal)
  );
  if (!error) {
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
  if (!MISSING.has(error.code ?? '')) throw toBookingError(error, "This week's classes couldn't be loaded.");
  const days = await Promise.all(Array.from({ length: 7 }, (_, i) => fetchDaySessions(addDays(start, i))));
  return days.flat();
}

export async function fetchMySchedule(): Promise<{ supported: boolean; schedule: MySchedule | null }> {
  const db = client();
  const { data, error } = await timed((signal) => db.rpc('my_recurring_schedule').abortSignal(signal));
  if (error) {
    if (MISSING.has(error.code ?? '')) return { supported: false, schedule: null };
    throw toBookingError(error, "Your weekly schedule couldn't be loaded.");
  }
  const j = data as Json | null;
  if (!j || typeof j.schedule_id !== 'string') return { supported: true, schedule: null };
  const slots = ((j.slots as Json[] | null) ?? []).map((s) => ({
    dayOfWeek: Number(s.day_of_week),
    startTime: String(s.start_time),
    endTime: String(s.end_time),
  }));
  const occurrences = ((j.occurrences as Json[] | null) ?? []).map(
    (o): Occurrence => ({
      occurrenceId: String(o.occurrence_id),
      sessionId: String(o.session_id),
      sessionDate: String(o.session_date),
      startTime: String(o.start_time),
      endTime: String(o.end_time),
      status: String(o.status),
      bookingId: (o.booking_id as string | null) ?? null,
      bookingStatus: (o.booking_status as string | null) ?? null,
      attendance: (o.attendance as string | null) ?? null,
      replacementBookingId: (o.replacement_booking_id as string | null) ?? null,
      canReplace: o.can_replace === true,
    })
  );
  return {
    supported: true,
    schedule: {
      scheduleId: j.schedule_id,
      planName: String(j.plan_name ?? ''),
      slotsPerWeek: Number(j.slots_per_week ?? 0),
      validUntil: String(j.valid_until ?? ''),
      creditsRemaining: Number(j.credits_remaining ?? 0),
      slots,
      occurrences,
    },
  };
}

export async function confirmSchedule(slots: WeeklySlot[]): Promise<ConfirmResult> {
  const db = client();
  const payload = slots.map((s) => ({ day_of_week: s.dayOfWeek, start_time: s.startTime, end_time: s.endTime }));
  const { data, error } = await timed((signal) => db.rpc('confirm_recurring_schedule', { p_slots: payload }).abortSignal(signal));
  if (error) throw toBookingError(error, "We couldn't set up your weekly schedule. Please try again.");
  const j = (data ?? {}) as Json;
  if (typeof j.schedule_id !== 'string') throw new BookingError('network', "We couldn't confirm your weekly schedule.");
  return {
    booked: Number(j.booked ?? 0),
    skippedFull: Number(j.skipped_full ?? 0),
    skippedNoCredits: Number(j.skipped_no_credits ?? 0),
    created: j.created === true,
    changed: j.changed === true,
  };
}

export async function endSchedule() {
  const db = client();
  const { error } = await timed((signal) => db.rpc('end_recurring_schedule').abortSignal(signal));
  if (error) throw toBookingError(error, "We couldn't stop your weekly schedule. Please try again.");
}

export async function bookReplacement(excusedBookingId: string, sessionId: string): Promise<string> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db.rpc('book_replacement', { p_excused_booking_id: excusedBookingId, p_session_id: sessionId }).abortSignal(signal)
  );
  if (error) throw toBookingError(error, "We couldn't book the replacement. Please try again.");
  const id = (data as Json | null)?.booking_id;
  if (typeof id !== 'string') throw new BookingError('network', "We couldn't confirm the replacement.");
  return id;
}
