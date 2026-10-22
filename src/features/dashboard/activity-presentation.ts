import type { Href } from 'expo-router';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

import { formatDayShort, formatTimeRange } from '@/features/booking/schedule-format';
import { formatINR, plural } from '@/features/store/format';

import type { ActivityItem } from './dashboard-data';

/**
 * Member-facing wording for recent activity. Presentation only: each server
 * record becomes exactly one row, nothing is merged or dropped, and every
 * figure shown (credits, amounts, plan names, class times) is the one stored on
 * the record. Missing details are left out rather than guessed.
 *
 * The ledger's `membership_purchase` row is the credit grant written in the
 * same server step that creates the membership, so it is shown as the
 * activation itself — one row instead of a separate "Classes added" line.
 */

/** Material Symbols (Android/web) and SF Symbols (iOS) names, as expo-symbols expects. */
export type ActivityIcon = { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };

export type ActivityView = {
  icon: ActivityIcon;
  title: string;
  detail: string | null;
  /** Signed credit change, shown as a small secondary figure; null when not relevant. */
  credits: number | null;
  /** An existing screen for this record, when there is one. */
  href: Href | null;
};

const icon = (ios: SFSymbol, android: AndroidSymbol): ActivityIcon => ({ ios, android, web: android });

const ICONS = {
  membership: icon('checkmark.seal', 'verified'),
  booked: icon('calendar.badge.checkmark', 'event_available'),
  rescheduled: icon('calendar.badge.clock', 'update'),
  cancelled: icon('calendar.badge.minus', 'event_busy'),
  restored: icon('plus.circle', 'add_circle'),
  expired: icon('hourglass', 'hourglass_bottom'),
  adjusted: icon('slider.horizontal.3', 'tune'),
  refund: icon('indianrupeesign.circle', 'currency_rupee'),
  payment: icon('checkmark.circle', 'receipt_long'),
  other: icon('info.circle', 'info'),
};

function classTime(session: { date: string; startTime: string; endTime: string } | null) {
  return session ? `${formatDayShort(session.date)} · ${formatTimeRange(session.startTime, session.endTime)}` : null;
}

function classHref(bookingId: string | null): Href | null {
  return bookingId ? { pathname: '/class/[bookingId]', params: { bookingId } } : null;
}

export function describeActivity(item: ActivityItem): ActivityView {
  if (item.source === 'payment') {
    const what = item.items.length > 0 ? item.items.join(', ') : null;
    return {
      icon: ICONS.payment,
      title: 'Payment successful',
      detail: [what, formatINR(item.amount)].filter(Boolean).join(' · '),
      credits: null,
      href: { pathname: '/order/[orderId]', params: { orderId: item.orderId, from: 'orders' } },
    };
  }

  const credits = item.credits !== 0 ? item.credits : null;
  switch (item.type) {
    case 'membership_purchase': {
      const unit = item.planKind === 'one_time_ride' ? ['riding session', 'riding sessions'] : ['class', 'classes'];
      const added = item.credits > 0 ? `${plural(item.credits, unit[0], unit[1])} added` : null;
      return {
        icon: ICONS.membership,
        title: 'Membership activated',
        detail: [item.planName, added].filter(Boolean).join(' · ') || null,
        credits,
        href: null,
      };
    }
    case 'booking':
      return {
        icon: ICONS.booked,
        title: 'Class booked',
        detail: classTime(item.session) ?? 'Your riding session is confirmed',
        credits,
        href: classHref(item.bookingId),
      };
    case 'reschedule': {
      // The row belongs to the new booking, so its class time is the new time.
      const when = classTime(item.session);
      return {
        icon: ICONS.rescheduled,
        title: 'Class rescheduled',
        detail: when ? `Moved to ${when}` : 'Moved to another time',
        credits,
        href: classHref(item.bookingId),
      };
    }
    case 'cancellation': {
      const when = classTime(item.session);
      return {
        icon: ICONS.cancelled,
        title: 'Class cancelled',
        detail: when ? `${when} · returned to your plan` : 'Returned to your plan',
        credits,
        href: classHref(item.bookingId),
      };
    }
    case 'absence_restore':
      return {
        icon: ICONS.restored,
        title: 'Class restored',
        detail: classTime(item.session) ? `${classTime(item.session)} · absence recorded` : 'Returned after a recorded absence',
        credits,
        href: classHref(item.bookingId),
      };
    case 'expiry':
      return {
        icon: ICONS.expired,
        title: 'Classes expired',
        detail: item.planName ? `${item.planName} ended` : 'Unused classes expired',
        credits,
        href: null,
      };
    case 'admin_adjustment':
      return { icon: ICONS.adjusted, title: 'Adjusted by the club', detail: 'Your class balance was updated', credits, href: null };
    case 'refund':
      return { icon: ICONS.refund, title: 'Refund recorded', detail: item.planName, credits, href: null };
    default:
      return { icon: ICONS.other, title: 'Account update', detail: null, credits, href: null };
  }
}

// ─── Time ───────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function istParts(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

/**
 * The event's own time in India: "Just now", "Today · 11:46 AM",
 * "Yesterday · 4:20 PM", "14 Oct · 7:43 PM", or "14 Oct 2025 · 7:43 PM".
 */
export function formatActivityTime(iso: string, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  if (now - t >= 0 && now - t < 60_000) return 'Just now';
  const e = istParts(t);
  const time = `${e.h % 12 === 0 ? 12 : e.h % 12}:${String(e.min).padStart(2, '0')} ${e.h >= 12 ? 'PM' : 'AM'}`;
  const dayKey = (p: { y: number; m: number; d: number }) => Date.UTC(p.y, p.m, p.d);
  const today = istParts(now);
  const diffDays = Math.round((dayKey(today) - dayKey(e)) / 86_400_000);
  if (diffDays === 0) return `Today · ${time}`;
  if (diffDays === 1) return `Yesterday · ${time}`;
  return `${e.d} ${MONTHS[e.m]}${e.y === today.y ? '' : ` ${e.y}`} · ${time}`;
}
