import type { Href } from 'expo-router';

import type { AppNotification } from './notifications-api';

/**
 * Where a notification leads, from the identifiers the server put in its
 * `data` (booking_id, order_id, membership_id, session_id). Only real
 * identifiers are used; each destination screen re-reads the record for the
 * signed-in member and shows "not found" if it isn't theirs. A notification
 * without a usable identifier has no destination and is simply shown.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(n: AppNotification, key: string) {
  const value = n.data[key];
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "15 Oct, 9:09 am" in India time (year added when it isn't this year). */
export function whenIST(iso: string, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + IST_OFFSET_MS);
  const thisYear = new Date(now + IST_OFFSET_MS).getUTCFullYear();
  const h = d.getUTCHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear() === thisYear ? '' : ` ${d.getUTCFullYear()}`}, ${time}`;
}

export type Category = 'Classes' | 'Membership' | 'Payments' | 'Orders' | 'Account';

/** A short label grouping the server's event types; unknown types fall back to "Account". */
export function categoryOf(type: string): Category {
  if (/booking|reschedule|class|attendance|credit_restored|waitlist|recurring/.test(type)) return 'Classes';
  if (/membership/.test(type)) return 'Membership';
  if (/payment/.test(type)) return 'Payments';
  if (/order/.test(type)) return 'Orders';
  return 'Account';
}

export function destinationFor(n: AppNotification): { href: Href; label: string } | null {
  const bookingId = idOf(n, 'booking_id');
  if (bookingId) return { href: { pathname: '/class/[bookingId]', params: { bookingId } }, label: 'View class' };

  const orderId = idOf(n, 'order_id');
  if (orderId) return { href: { pathname: '/order/[orderId]', params: { orderId, from: 'orders' } }, label: 'View order' };

  // The class-detail screen needs the class date, which a waitlist notice doesn't carry: open the schedule.
  if (idOf(n, 'session_id')) return { href: '/book', label: 'Open schedule' };

  if (idOf(n, 'membership_id')) return { href: '/', label: 'View membership' };

  return null;
}
