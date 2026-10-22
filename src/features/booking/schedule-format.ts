import type { SessionSlot } from './booking-api';

/**
 * Presentation helpers for the schedule. Session dates and times are stored as
 * the club's local (IST) calendar date and wall-clock time, so they are only
 * reformatted here — never converted between time zones.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

/** "Thursday, 15 October" */
export function formatDayLong(iso: string) {
  const { m, d, weekday } = parts(iso);
  return `${WEEKDAYS[weekday]}, ${d} ${MONTHS[m - 1]}`;
}

/** "Thu 15 Oct" */
export function formatDayShort(iso: string) {
  const { m, d, weekday } = parts(iso);
  return `${WEEKDAYS[weekday].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** A short, readable form of the server's booking id (not a separate reference). */
export function shortRef(id: string) {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** { weekday: "Thu", day: "15", month: "Oct" } for the date strip. */
export function dayChip(iso: string) {
  const { m, d, weekday } = parts(iso);
  return { weekday: WEEKDAYS[weekday].slice(0, 3), day: String(d), month: MONTHS[m - 1].slice(0, 3) };
}

/** Every date from `min` to `max` inclusive (YYYY-MM-DD), capped for safety. */
export function datesBetween(min: string, max: string, cap = 120) {
  const out: string[] = [];
  const start = Date.parse(`${min}T00:00:00Z`);
  const end = Date.parse(`${max}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return out;
  for (let t = start; t <= end && out.length < cap; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function clock(time: string) {
  const [h, m] = time.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { text: m ? `${hour12}:${String(m).padStart(2, '0')}` : `${hour12}`, pm: h >= 12 };
}

/** "7 – 8 am", "11 am – 12 pm", "4:30 – 5:30 pm" */
export function formatTimeRange(start: string, end: string) {
  const a = clock(start);
  const b = clock(end);
  return a.pm === b.pm
    ? `${a.text} – ${b.text} ${b.pm ? 'pm' : 'am'}`
    : `${a.text} ${a.pm ? 'pm' : 'am'} – ${b.text} ${b.pm ? 'pm' : 'am'}`;
}

export function partOfDay(startTime: string) {
  const hour = Number(startTime.split(':')[0]);
  if (hour < 12) return 'Morning';
  if (hour < 16) return 'Afternoon';
  return 'Evening';
}

/** [["Morning", [...]], ["Evening", [...]]] in time order. */
export function groupByPartOfDay(sessions: SessionSlot[]) {
  const groups = new Map<string, SessionSlot[]>();
  for (const s of [...sessions].sort((x, y) => x.startTime.localeCompare(y.startTime))) {
    const key = partOfDay(s.startTime);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()];
}

export type SlotState = 'open' | 'full' | 'mine' | 'closed';

/** What a session is from the member's point of view — read from the server's flags. */
export function slotState(s: SessionSlot): SlotState {
  if (s.isMine) return 'mine';
  if (s.status !== 'open' || !s.isBookable) return 'closed';
  if (s.placesLeft <= 0) return 'full';
  return 'open';
}

export function slotLabel(s: SessionSlot) {
  switch (slotState(s)) {
    case 'mine':
      return 'Booked';
    case 'full':
      return 'Fully booked';
    case 'closed':
      return s.status === 'cancelled' ? 'Cancelled' : 'Not available';
    default:
      return s.placesLeft === 1 ? 'Last place' : `${s.placesLeft} places left`;
  }
}
