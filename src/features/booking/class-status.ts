import type { BookingPolicy, ClassRecord } from './my-classes-api';

/**
 * How a member's class reads, from the server's own records only:
 * bookings.status (set by book_class / reschedule_booking / cancel_booking /
 * admin_mark_attendance), the staff-recorded attendance row, and the
 * booking's own ledger rows. A class is never called attended or missed
 * because of its date — only because staff recorded it.
 */

const IST_OFFSET = '+05:30';

/** The instant a class starts or ends (session dates and times are IST wall-clock). */
export function classInstant(date: string, time: string) {
  return Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}${IST_OFFSET}`);
}

export type Timing = 'before' | 'during' | 'after';

export function classTiming(r: Pick<ClassRecord, 'date' | 'startTime' | 'endTime'>, now = Date.now()): Timing {
  if (now < classInstant(r.date, r.startTime)) return 'before';
  if (now < classInstant(r.date, r.endTime)) return 'during';
  return 'after';
}

const ACTIVE = ['held', 'confirmed'];

export type Group = 'upcoming' | 'past' | 'cancelled' | 'moved';

/** Which list a booking belongs in. Moved bookings are shown on the booking they became. */
export function classGroup(r: ClassRecord, now = Date.now()): Group {
  if (r.status === 'cancelled') return 'cancelled';
  if (r.status === 'rescheduled') return 'moved';
  if (ACTIVE.includes(r.status) && classTiming(r, now) !== 'after') return 'upcoming';
  return 'past';
}

export type Tone = 'good' | 'neutral' | 'attention' | 'muted';

export type ClassStatus = { label: string; tone: Tone; note: string | null };

function returned(r: ClassRecord, type: 'absence_restore' | 'cancellation') {
  return r.ledger.some((l) => l.type === type && l.amount > 0);
}

export function describeClass(r: ClassRecord, now = Date.now()): ClassStatus {
  switch (r.status) {
    case 'held':
    case 'confirmed': {
      const timing = classTiming(r, now);
      if (timing === 'before') return { label: 'Booked', tone: 'good', note: null };
      if (timing === 'during') return { label: 'In progress', tone: 'good', note: null };
      // Staff haven't recorded attendance yet — not "missed", not "attended".
      return { label: 'Attendance pending', tone: 'muted', note: 'The club hasn’t recorded attendance yet' };
    }
    case 'completed':
      return { label: 'Attended', tone: 'good', note: 'Used 1 class' };
    case 'absent': {
      const label = r.attendance?.status === 'excused' ? 'Excused' : 'Absent';
      return returned(r, 'absence_restore')
        ? { label, tone: 'neutral', note: 'Class returned to your plan' }
        : { label, tone: 'attention', note: 'Class not returned' };
    }
    case 'no_show':
      return { label: 'No-show', tone: 'attention', note: 'Used 1 class' };
    case 'cancelled':
      return returned(r, 'cancellation')
        ? { label: 'Cancelled', tone: 'neutral', note: 'Class returned to your plan' }
        : { label: 'Cancelled', tone: 'attention', note: 'Class not returned' };
    case 'rescheduled':
      return { label: 'Moved', tone: 'muted', note: 'Moved to another time' };
    case 'expired':
      return { label: 'Expired', tone: 'muted', note: null };
    default:
      return { label: r.status.charAt(0).toUpperCase() + r.status.slice(1).replace(/_/g, ' '), tone: 'muted', note: null };
  }
}

/** Attendance as recorded by staff, or null when nothing has been recorded. */
export function attendanceLabel(r: ClassRecord) {
  switch (r.attendance?.status) {
    case 'present':
      return 'Present';
    case 'absent':
      return 'Absent';
    case 'excused':
      return 'Excused';
    case 'no_show':
      return 'No-show';
    default:
      return null;
  }
}

/** Reschedules left on the booking's own plan, only when the stored values are sensible. */
export function reschedulesLeft(r: ClassRecord) {
  const allowed = r.membership?.reschedulesAllowed;
  const used = r.membership?.reschedulesUsed;
  if (allowed == null || used == null || used < 0 || used > allowed) return null;
  return allowed - used;
}

export type MoveState = { canMove: true; remaining: number | null } | { canMove: false; reason: string | null };

/**
 * Whether to offer "Move class" — the same conditions reschedule_booking()
 * checks before looking at the new time. The server still decides.
 */
export function moveState(r: ClassRecord, todayIST: string, now = Date.now()): MoveState {
  if (!ACTIVE.includes(r.status)) return { canMove: false, reason: null };
  if (classTiming(r, now) !== 'before') return { canMove: false, reason: 'This class has started and can no longer be rescheduled.' };
  if (r.rescheduleCount >= 1) return { canMove: false, reason: 'This class has already been rescheduled once and can’t be moved again.' };
  const m = r.membership;
  if (m && (m.status !== 'active' || (m.endDate !== null && m.endDate < todayIST))) {
    return { canMove: false, reason: 'The plan this class belongs to has ended.' };
  }
  const left = reschedulesLeft(r);
  if (left !== null && left <= 0) return { canMove: false, reason: 'You have used all reschedules available on this plan.' };
  return { canMove: true, remaining: left };
}

/** Cancelling is offered until the class starts (cancel_booking() accepts any held/confirmed booking). */
export function canCancel(r: ClassRecord, now = Date.now()) {
  return ACTIVE.includes(r.status) && classTiming(r, now) === 'before';
}

/** What cancelling will do to the member's plan, worded from the club's live settings. */
export function cancellationEffect(policy: BookingPolicy | null, r: ClassRecord, now = Date.now()) {
  if (!policy || policy.cancellationReturnsClass === null) {
    return { returnsClass: false, text: 'We couldn’t confirm the club’s cancellation policy just now, so assume the class won’t be returned to your plan.' };
  }
  if (!policy.cancellationReturnsClass) {
    return { returnsClass: false, text: 'Cancelling does not return the class to your plan.' };
  }
  const cutoff = policy.cancellationCutoffHours;
  if (cutoff === null) return { returnsClass: true, text: 'Cancelling returns the class to your plan.' };
  const inTime = classInstant(r.date, r.startTime) - now >= cutoff * 3_600_000;
  return inTime
    ? { returnsClass: true, text: `You’re cancelling at least ${cutoff} hours before the class, so it should go back on your plan. The club confirms this when you cancel.` }
    : { returnsClass: false, text: `It’s less than ${cutoff} hours before the class, so cancelling won’t return it to your plan.` };
}
