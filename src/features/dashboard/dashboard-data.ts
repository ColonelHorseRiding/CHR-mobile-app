import { supabase } from '@/services/supabase/client';

/**
 * Member dashboard data, read through the customer's own session (RLS).
 * Every query is also filtered to the signed-in user's id: staff accounts can
 * read all rows under RLS, and a dashboard must only ever show its owner.
 *
 * Sources (shared CHR Supabase project, same as the website's member area):
 *   profiles.full_name                       greeting
 *   memberships (+ membership_plans)         plan, status, dates, credits, reschedules
 *     credits_remaining  server-maintained cache = SUM(credit_ledger.amount) for the membership
 *     total_credits      credits granted at activation (falls back to the plan's class_credits)
 *     reschedules_*      allowance and usage, maintained by the server
 *     plan.kind          'membership' | 'one_time_ride'
 *   credit_ledger (+ its membership's plan, its booking's class time)   credit history
 *   orders (+ order_items, payments)         purchases whose payment succeeded
 * Nothing here computes a business rule; it only reads and words server values.
 */

export type PlanKind = 'membership' | 'one_time_ride';

export type DashboardMembership = {
  id: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  totalCredits: number | null;
  creditsRemaining: number | null;
  reschedulesAllowed: number | null;
  reschedulesUsed: number | null;
  createdAt: string;
  planName: string | null;
  planCode: string | null;
  kind: PlanKind;
};

/**
 * One event in the member's recent activity, exactly as the server recorded it.
 * Wording and icons are decided in `activity-presentation.ts`; nothing here is
 * merged, invented or re-labelled.
 */
export type ActivityItem =
  | {
      /** A credit_ledger row (append-only, server-written). */
      source: 'ledger';
      id: string;
      at: string;
      /** credit_ledger.transaction_type, e.g. membership_purchase, booking, reschedule. */
      type: string;
      /** Signed class-credit change recorded on the row. */
      credits: number;
      planName: string | null;
      planKind: PlanKind | null;
      /** The booking the row belongs to, with its class time, when it has one. */
      bookingId: string | null;
      session: { date: string; startTime: string; endTime: string } | null;
    }
  | {
      /** A paid order whose payment the server marked successful. */
      source: 'payment';
      id: string;
      at: string;
      orderId: string;
      amount: number;
      items: string[];
    };

export type DashboardData = {
  fullName: string | null;
  memberships: DashboardMembership[];
  activity: ActivityItem[];
};

export class DashboardError extends Error {
  constructor(
    readonly kind: 'network' | 'unknown',
    message: string
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;
const ACTIVITY_LIMIT = 6;

// ─── Dates on the club's business calendar (IST, UTC+5:30, no DST) ──────────

const IST_OFFSET_MS = 330 * 60_000;

/** Today's date in India as YYYY-MM-DD — the same reference the server uses for validity. */
export function todayIST(now = Date.now()) {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function hourIST(now = Date.now()) {
  return new Date(now + IST_OFFSET_MS).getUTCHours();
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative if `to` is earlier. */
export function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

// ─── Classification (display only; the server decides every booking rule) ──

export type MembershipView =
  | { kind: 'active'; current: DashboardMembership[] }
  | { kind: 'lapsed'; latest: DashboardMembership }
  | { kind: 'none' };

/**
 * Mirrors the website member area: a membership is current when it is
 * 'active' and its end date (IST) has not passed. Several current entitlements
 * are shown separately — their credits are never added together.
 */
export function classifyMemberships(rows: DashboardMembership[], today = todayIST()): MembershipView {
  const current = rows.filter((m) => m.status === 'active' && !!m.endDate && m.endDate >= today);
  if (current.length > 0) return { kind: 'active', current };
  const lapsed = rows.find(
    (m) =>
      m.status === 'expired' ||
      m.status === 'cancelled' ||
      m.status === 'suspended' ||
      (m.status === 'active' && !!m.endDate && m.endDate < today)
  );
  return lapsed ? { kind: 'lapsed', latest: lapsed } : { kind: 'none' };
}

/** Credit figures, or null parts where the stored values are missing or inconsistent. */
export function creditFigures(m: DashboardMembership) {
  const total = m.totalCredits;
  const remaining = m.creditsRemaining;
  const consistent = total !== null && remaining !== null && total > 0 && remaining >= 0 && remaining <= total;
  return {
    total: consistent ? total : null,
    remaining: remaining !== null && remaining >= 0 ? remaining : null,
    used: consistent ? total - (remaining as number) : null,
  };
}

/** Reschedules left, only when both stored values are present and sensible. */
export function reschedulesLeft(m: DashboardMembership) {
  const { reschedulesAllowed: allowed, reschedulesUsed: used } = m;
  if (allowed === null || used === null || used < 0 || used > allowed) return null;
  return allowed - used;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

type MembershipRow = {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  total_credits: number | null;
  credits_remaining: number | null;
  reschedules_allowed: number | null;
  reschedules_used: number | null;
  created_at: string;
  plan: { name: string; plan_code: string | null; kind: string | null; class_credits: number | null } | null;
};

type LedgerRow = {
  id: string;
  amount: number;
  transaction_type: string;
  created_at: string;
  booking_id: string | null;
  membership: { plan: { name: string; kind: string | null } | null } | null;
  booking: { class_sessions: { session_date: string; start_time: string; end_time: string } | null } | null;
};

type OrderRow = {
  id: string;
  total_amount: number | string;
  paid_at: string | null;
  order_items: { name: string }[] | null;
  payments: { status: string }[] | null;
};

export async function fetchDashboard(userId: string): Promise<DashboardData> {
  if (!supabase) throw new DashboardError('unknown', 'The app is not connected to the club.');
  const db = supabase;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DashboardError('network', "We couldn't reach the club's servers."));
    }, TIMEOUT_MS);
  });

  try {
    const [profile, memberships, ledger, orders] = await Promise.race([
      Promise.all([
        db.from('profiles').select('full_name').eq('id', userId).abortSignal(controller.signal).maybeSingle(),
        db
          .from('memberships')
          .select(
            'id, status, start_date, end_date, total_credits, credits_remaining, reschedules_allowed, reschedules_used, created_at, plan:membership_plans(name, plan_code, kind, class_credits)'
          )
          .eq('user_id', userId)
          .order('end_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal),
        db
          .from('credit_ledger')
          .select(LEDGER_SELECT)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(ACTIVITY_LIMIT)
          .abortSignal(controller.signal),
        db
          .from('orders')
          .select(ORDER_SELECT)
          .eq('user_id', userId)
          .not('paid_at', 'is', null)
          .order('paid_at', { ascending: false })
          .limit(ACTIVITY_LIMIT)
          .abortSignal(controller.signal),
      ]),
      timeout,
    ]);

    const failed = [profile.error, memberships.error, ledger.error, orders.error].find(Boolean);
    if (failed) {
      const network = /network|fetch|abort|timed? ?out/i.test(failed.message);
      throw new DashboardError(
        network ? 'network' : 'unknown',
        network ? "We couldn't reach the club's servers." : "Your membership details couldn't be loaded."
      );
    }

    const name = (profile.data as { full_name: string | null } | null)?.full_name?.trim();
    const rows = (memberships.data ?? []) as unknown as MembershipRow[];

    const activity = toActivity(ledger.data, orders.data, ACTIVITY_LIMIT);

    return {
      fullName: name ? name : null,
      memberships: rows.map((r) => ({
        id: r.id,
        status: r.status,
        startDate: r.start_date,
        endDate: r.end_date,
        totalCredits: r.total_credits ?? r.plan?.class_credits ?? null,
        creditsRemaining: r.credits_remaining,
        reschedulesAllowed: r.reschedules_allowed,
        reschedulesUsed: r.reschedules_used,
        createdAt: r.created_at,
        planName: r.plan?.name ?? null,
        planCode: r.plan?.plan_code ?? null,
        kind: r.plan?.kind === 'one_time_ride' ? 'one_time_ride' : 'membership',
      })),
      activity,
    };
  } catch (error) {
    if (error instanceof DashboardError) throw error;
    throw new DashboardError('network', "We couldn't reach the club's servers.");
  } finally {
    clearTimeout(timer);
  }
}

const LEDGER_SELECT =
  'id, amount, transaction_type, created_at, booking_id, membership:memberships(plan:membership_plans(name, kind)), booking:bookings(class_sessions(session_date, start_time, end_time))';
const ORDER_SELECT = 'id, total_amount, paid_at, order_items(name), payments(status)';

/** Ledger rows and confirmed payments, newest first, at most `limit` of them. */
function toActivity(ledgerData: unknown, ordersData: unknown, limit: number): ActivityItem[] {
  return [
      ...((ledgerData ?? []) as LedgerRow[]).map((l): ActivityItem => {
        const plan = l.membership?.plan ?? null;
        const session = l.booking?.class_sessions ?? null;
        return {
          source: 'ledger',
          id: `ledger:${l.id}`,
          at: l.created_at,
          type: l.transaction_type,
          credits: l.amount,
          planName: plan?.name ?? null,
          planKind: plan?.kind === 'one_time_ride' ? 'one_time_ride' : plan?.kind === 'membership' ? 'membership' : null,
          bookingId: l.booking_id,
          session: session ? { date: session.session_date, startTime: session.start_time, endTime: session.end_time } : null,
        };
      }),
      // Only payments the server confirmed: an order's paid_at alone is not treated as proof.
      ...((ordersData ?? []) as OrderRow[])
        .filter((o) => (o.payments ?? []).some((p) => p.status === 'success'))
        .map(
          (o): ActivityItem => ({
            source: 'payment',
            id: `order:${o.id}`,
            at: o.paid_at as string,
            orderId: o.id,
            amount: Number(o.total_amount),
            items: (o.order_items ?? []).map((i) => i.name),
          })
        ),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
}

/**
 * The member's activity history for the "See all" screen: the newest `limit`
 * events across the ledger and confirmed payments (own rows only).
 */
export async function fetchActivity(userId: string, limit: number): Promise<{ items: ActivityItem[]; hasMore: boolean }> {
  if (!supabase) throw new DashboardError('unknown', 'The app is not connected to the club.');
  const db = supabase;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DashboardError('network', "We couldn't reach the club's servers."));
    }, TIMEOUT_MS);
  });
  try {
    // One extra row per source tells whether older events exist.
    const [ledger, orders] = await Promise.race([
      Promise.all([
        db.from('credit_ledger').select(LEDGER_SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(limit + 1).abortSignal(controller.signal),
        db.from('orders').select(ORDER_SELECT).eq('user_id', userId).not('paid_at', 'is', null).order('paid_at', { ascending: false }).limit(limit + 1).abortSignal(controller.signal),
      ]),
      timeout,
    ]);
    const failed = ledger.error ?? orders.error;
    if (failed) {
      const network = /network|fetch|abort|timed? ?out/i.test(failed.message);
      throw new DashboardError(network ? 'network' : 'unknown', network ? "We couldn't reach the club's servers." : "Your activity couldn't be loaded.");
    }
    const all = toActivity(ledger.data, orders.data, limit + 1);
    return { items: all.slice(0, limit), hasMore: all.length > limit };
  } catch (error) {
    if (error instanceof DashboardError) throw error;
    throw new DashboardError('network', "We couldn't reach the club's servers.");
  } finally {
    clearTimeout(timer);
  }
}
