import type { SessionSlot } from './booking-api';

/**
 * How the weekly schedule is shown. Pure functions only: every fact (places,
 * times, which classes exist, what happened to each booking) comes from the
 * server; this only words it and decides what can be tapped.
 */

/** Shown for a class with no places left. The club has three horses, one per place. */
export const FULL_MESSAGE = 'Unavailable — All horses are booked.';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type WeeklySlot = { dayOfWeek: number; startTime: string; endTime: string };

/** One weekday-and-time, ignoring seconds ("17:00:00" and "17:00" are the same slot). */
export function slotKey(s: { dayOfWeek: number; startTime: string }) {
  return `${s.dayOfWeek}|${s.startTime.slice(0, 5)}`;
}

const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];

export function dayOfWeek(iso: string) {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(iso: string, n: number) {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** The Monday of the week containing `iso`. */
export function weekStart(iso: string) {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7));
}

export function weekDays(start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "13–19 Oct" (or "29 Oct – 4 Nov" across months). */
export function weekLabel(start: string) {
  const end = addDays(start, 6);
  const [, sm, sd] = parts(start);
  const [, em, ed] = parts(end);
  return sm === em ? `${sd}–${ed} ${MONTHS[em - 1]}` : `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]}`;
}

export function dayName(dow: number) {
  return DAY_NAMES[dow] ?? '';
}

/** "17:00:00" → "5:00 PM". */
export function clock12(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function timeRangeLabel(start: string, end: string) {
  return `${clock12(start)}–${clock12(end)}`;
}

/** "Tuesday: 5:00 PM–6:00 PM", Monday first. */
export function summaryLines(slots: WeeklySlot[]) {
  return [...slots]
    .sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7) || a.startTime.localeCompare(b.startTime))
    .map((s) => `${dayName(s.dayOfWeek)}: ${timeRangeLabel(s.startTime, s.endTime)}`);
}

// ─── One class on the weekly calendar ───────────────────────────────────────

export type CellState = 'mine' | 'full' | 'limited' | 'available' | 'unavailable';

export function cellState(s: SessionSlot): CellState {
  if (s.isMine) return 'mine';
  if (!s.isBookable) return 'unavailable';
  if (s.placesLeft <= 0) return 'full';
  if (s.placesLeft === 1 && s.capacity > 1) return 'limited';
  return 'available';
}

export function cellLabel(state: CellState, s: SessionSlot) {
  switch (state) {
    case 'mine':
      return 'Already booked';
    case 'full':
      return FULL_MESSAGE;
    case 'limited':
      return 'Limited availability — 1 place left';
    case 'available':
      return s.placesLeft >= 2 ? `Available — ${s.placesLeft} places left` : 'Available';
    default:
      return 'Unavailable';
  }
}

/** A class can be added to the weekly pattern when it is open with a place free; one already chosen can always be removed. */
export function canToggle(state: CellState, selected: boolean) {
  return selected || state === 'available' || state === 'limited';
}

// ─── One occurrence of the schedule ─────────────────────────────────────────

export type Occurrence = {
  occurrenceId: string;
  sessionId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
  bookingId: string | null;
  bookingStatus: string | null;
  attendance: string | null;
  replacementBookingId: string | null;
  canReplace: boolean;
};

export type Tone = 'ok' | 'info' | 'warn' | 'muted';

export function occurrenceStatus(o: Occurrence): { label: string; tone: Tone } {
  switch (o.status) {
    case 'skipped_full':
      return { label: 'Class full — we’ll keep trying until it starts', tone: 'warn' };
    case 'skipped_no_credits':
      return { label: 'Skipped — no classes left on your plan', tone: 'muted' };
    case 'skipped_other':
      return { label: 'Skipped — weekly limit reached', tone: 'muted' };
    case 'replaced':
      return { label: 'Excused — replacement booked', tone: 'info' };
  }
  if (o.canReplace) return { label: 'Excused by the club — book a replacement', tone: 'info' };
  switch (o.bookingStatus) {
    case 'confirmed':
    case 'held':
      return { label: 'Booked', tone: 'ok' };
    case 'completed':
      return { label: 'Attended', tone: 'ok' };
    case 'absent':
      return { label: o.attendance === 'excused' ? 'Excused by the club' : 'Absent', tone: 'muted' };
    case 'no_show':
      return { label: 'Missed', tone: 'muted' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'muted' };
    case 'rescheduled':
      return { label: 'Moved to another time', tone: 'muted' };
    default:
      return { label: 'Booked', tone: 'ok' };
  }
}

/** The result line after confirming: only what actually happened. */
export function resultMessage(r: { booked: number; skippedFull: number; skippedNoCredits: number; changed: boolean }) {
  const parts: string[] = [];
  parts.push(r.booked === 1 ? '1 class booked.' : `${r.booked} classes booked.`);
  if (r.skippedFull > 0) {
    parts.push(
      r.skippedFull === 1
        ? '1 class was full, so it was not booked. We’ll keep trying until it starts.'
        : `${r.skippedFull} classes were full, so they were not booked. We’ll keep trying until they start.`
    );
  }
  if (r.skippedNoCredits > 0) parts.push('Your classes are used up for the remaining dates, so nothing more was booked.');
  if (r.booked === 0 && r.skippedFull === 0 && r.skippedNoCredits === 0) {
    parts.push(r.changed ? 'Your weekly pattern was updated.' : 'Nothing has changed.');
  }
  return parts.join(' ');
}
