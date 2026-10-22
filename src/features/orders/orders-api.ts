import { orderReference } from '@/features/checkout/order-status';
import { supabase } from '@/services/supabase/client';

/**
 * The signed-in customer's own orders (RLS: members read only their own
 * orders, order items and payments; every query also filters by the session
 * user id because staff can read all orders). Read-only: nothing here changes
 * an order, a payment or a collection status.
 *
 *   orders.status    pending | paid | ready_for_collection | collected | cancelled | failed
 *                    paid/failed come from the payment webhook; ready/collected/cancelled from staff
 *   payments.status  created | pending | success | failed | expired  (one payment per order)
 */

const PAGE_SIZE = 20;
const TIMEOUT_MS = 15_000;

export type OrderFilter = 'all' | 'unpaid' | 'paid' | 'closed';

const STATUSES: Record<Exclude<OrderFilter, 'all'>, string[]> = {
  unpaid: ['pending'],
  paid: ['paid', 'ready_for_collection', 'collected'],
  closed: ['cancelled', 'failed'],
};

export type OrderSummary = {
  id: string;
  reference: string;
  status: string;
  total: number;
  currency: string;
  hasMembership: boolean;
  hasInStore: boolean;
  createdAt: string;
  paidAt: string | null;
  collectedAt: string | null;
  items: { name: string; quantity: number; unitPrice: number; category: string }[];
  payment: { status: string; amount: number; underReview: boolean } | null;
};

export class OrdersError extends Error {
  constructor(
    readonly kind: 'network' | 'unknown',
    message: string
  ) {
    super(message);
  }
}

type Row = {
  id: string;
  status: string;
  total_amount: number | string;
  currency: string;
  has_membership: boolean;
  has_in_store: boolean;
  created_at: string;
  paid_at: string | null;
  collected_at: string | null;
  order_items: { name: string; variant_label?: string | null; quantity: number; unit_price: number | string; category: string }[] | null;
  payments: { status: string; amount: number | string; metadata: Record<string, unknown> | null }[] | null;
};

export async function fetchOrders(userId: string, filter: OrderFilter, page: number) {
  if (!supabase) throw new OrdersError('unknown', 'The app is not connected to the club.');
  const db = supabase;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new OrdersError('network', "We couldn't reach the club's servers."));
    }, TIMEOUT_MS);
  });
  try {
    let query = db
      .from('orders')
      .select(
        'id, status, total_amount, currency, has_membership, has_in_store, created_at, paid_at, collected_at, ' +
          'order_items(name, variant_label, quantity, unit_price, category), payments(status, amount, metadata)'
      )
      .eq('user_id', userId);
    if (filter !== 'all') query = query.in('status', STATUSES[filter]);
    const from = page * PAGE_SIZE;
    const { data, error } = await Promise.race([
      query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
        .abortSignal(controller.signal),
      timeout,
    ]);
    if (error) {
      const network = /network|fetch|abort|timed? ?out/i.test(error.message);
      throw new OrdersError(network ? 'network' : 'unknown', network ? "We couldn't reach the club's servers." : "Your orders couldn't be loaded.");
    }
    const rows = (data ?? []) as unknown as Row[];
    return { items: rows.map(toSummary), hasMore: rows.length === PAGE_SIZE };
  } catch (error) {
    if (error instanceof OrdersError) throw error;
    throw new OrdersError('network', "We couldn't reach the club's servers.");
  } finally {
    clearTimeout(timer);
  }
}

function toSummary(r: Row): OrderSummary {
  const payment = (r.payments ?? [])[0] ?? null;
  return {
    id: r.id,
    reference: orderReference(r.id),
    status: r.status,
    total: Number(r.total_amount),
    currency: r.currency,
    hasMembership: r.has_membership,
    hasInStore: r.has_in_store,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    collectedAt: r.collected_at,
    items: (r.order_items ?? []).map((i) => ({ name: i.variant_label ? `${i.name} (${i.variant_label})` : i.name, quantity: i.quantity, unitPrice: Number(i.unit_price), category: i.category })),
    payment: payment
      ? { status: payment.status, amount: Number(payment.amount), underReview: !!payment.metadata && 'amount_mismatch' in payment.metadata }
      : null,
  };
}
