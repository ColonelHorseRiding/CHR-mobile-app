import { supabase } from '@/services/supabase/client';

import { CheckoutError } from './payments-api';

/**
 * Presentation states derived from the backend's own values:
 *   orders.status    pending | paid | ready_for_collection | collected | cancelled | failed
 *   payments.status  created | pending | success | failed | expired
 *   memberships      created only by the server's fulfil_order() after a confirmed payment
 */
export type OrderState =
  | 'awaiting-payment' // order open, no confirmed payment yet
  | 'fulfilment-pending' // payment confirmed, plan not active yet
  | 'fulfilled' // payment confirmed and every plan in the order is active
  | 'under-review' // paid amount did not match the order (flagged server-side, not fulfilled)
  | 'needs-refund' // paid, but the order had been closed by the club
  | 'failed' // payment failed
  | 'expired'; // unpaid order cancelled by the server

export type OrderMembership = {
  id: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  totalCredits: number | null;
};

export type OrderStatus = {
  state: OrderState;
  orderId: string;
  /** Short, human-friendly order reference. */
  reference: string;
  productName: string;
  /** store_products.id of the single item, for paying the same order again. */
  productId: string | null;
  orderStatus: string;
  paymentId: string | null;
  paymentStatus: string | null;
  amount: number;
  currency: string;
  paidAt: string | null;
  membership: OrderMembership | null;
  /** The order's own lines, priced by the server when the order was created. */
  items: { name: string; category: string; quantity: number; unitPrice: number }[];
  /** orders.total_amount — the order's price (the payment can be less when a wallet balance was used). */
  orderTotal: number;
  hasMembership: boolean;
  /** Tack / café items, collected in store; collection is recorded by staff. */
  hasInStore: boolean;
  createdAt: string | null;
  collectedAt: string | null;
};

/** States the server can still change on its own (webhook/fulfilment). */
export function isUnresolved(state: OrderState) {
  return state === 'awaiting-payment' || state === 'fulfilment-pending';
}

/** A plan the server has confirmed and activated: the member can book classes. */
export function planIsActive(status: Pick<OrderStatus, 'state' | 'hasMembership' | 'membership'>) {
  return status.state === 'fulfilled' && status.hasMembership && status.membership?.status === 'active';
}

/**
 * Whether to send the member on to booking. Only when the SERVER has confirmed
 * the payment and activated the plan (never on the payment window's own report),
 * and only for a payment made in this visit — not when an old order is opened
 * from the orders list. "Made in this visit" = the window said it completed, or
 * this screen watched the order settle.
 */
export function shouldGoToBooking(
  status: Pick<OrderStatus, 'state' | 'hasMembership' | 'membership'> | null,
  outcome: string | undefined,
  sawUnresolved: boolean,
  fromOrders: boolean
) {
  return !!status && !fromOrders && planIsActive(status) && (outcome === 'completed' || sawUnresolved);
}

/** The product name with the size/colour the customer chose, as recorded on the order ("Breeches (M / Navy)"). */
const itemName = (item: { name: string; variant_label?: string | null }) =>
  item.variant_label ? `${item.name} (${item.variant_label})` : item.name;

export function orderReference(orderId: string) {
  return `CHR-${orderId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

type Row = {
  id: string;
  status: string;
  total_amount: number | string;
  currency: string;
  has_membership: boolean | null;
  has_in_store: boolean | null;
  created_at: string | null;
  collected_at: string | null;
  order_items:
    | { id: string; name: string; category: string; product_id: string | null; variant_label?: string | null; quantity: number; unit_price: number | string }[]
    | null;
  payments: {
    id: string;
    status: string;
    amount: number | string;
    currency: string;
    paid_at: string | null;
    metadata: Record<string, unknown> | null;
  }[] | null;
};

const TIMEOUT_MS = 15_000;

/** Reads the authoritative state of one of the signed-in customer's orders (RLS-scoped). */
export async function fetchOrderStatus(orderId: string, userId?: string): Promise<OrderStatus | null> {
  if (!supabase) throw new CheckoutError('not-configured', 'The app is not connected to the club.');
  const db = supabase;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CheckoutError('network', "We couldn't reach the club's servers."));
    }, TIMEOUT_MS);
  });

  try {
    const orderResult = await Promise.race([
      db
        .from('orders')
        .select(
          'id, status, total_amount, currency, has_membership, has_in_store, created_at, collected_at, order_items(id, name, category, product_id, variant_label, quantity, unit_price), payments(id, status, amount, currency, paid_at, metadata)'
        )
        .eq('id', orderId)
        // Staff accounts can read every order under RLS; a customer screen shows only its owner's.
        .match(userId ? { user_id: userId } : {})
        .abortSignal(controller.signal)
        .maybeSingle(),
      timeout,
    ]);
    if (orderResult.error) {
      throw new CheckoutError(
        /network|fetch|abort/i.test(orderResult.error.message) ? 'network' : 'unknown',
        "We couldn't check this order just now."
      );
    }
    const order = orderResult.data as Row | null;
    if (!order) return null;

    const payment = (order.payments ?? [])[0] ?? null;
    const items = order.order_items ?? [];
    const membershipItems = items.filter((item) => item.category === 'membership');

    let membership: OrderMembership | null = null;
    if (payment && membershipItems.length > 0) {
      const membershipResult = await Promise.race([
        db
          .from('memberships')
          .select('id, status, start_date, end_date, total_credits')
          .eq('payment_id', payment.id)
          .abortSignal(controller.signal)
          .maybeSingle(),
        timeout,
      ]);
      if (!membershipResult.error && membershipResult.data) {
        const m = membershipResult.data as {
          id: string;
          status: string;
          start_date: string | null;
          end_date: string | null;
          total_credits: number | null;
        };
        membership = { id: m.id, status: m.status, startDate: m.start_date, endDate: m.end_date, totalCredits: m.total_credits };
      }
    }

    return {
      state: deriveState(order.status, payment, membershipItems.length > 0, membership),
      orderId: order.id,
      reference: orderReference(order.id),
      productName: items.map(itemName).join(', ') || 'Your order',
      productId: items.length === 1 ? items[0].product_id : null,
      orderStatus: order.status,
      paymentId: payment?.id ?? null,
      paymentStatus: payment?.status ?? null,
      amount: Number(payment?.amount ?? order.total_amount),
      currency: payment?.currency ?? order.currency,
      paidAt: payment?.paid_at ?? null,
      membership,
      items: items.map((item) => ({
        name: itemName(item),
        category: item.category,
        quantity: item.quantity ?? 1,
        unitPrice: Number(item.unit_price),
      })),
      orderTotal: Number(order.total_amount),
      hasMembership: order.has_membership ?? membershipItems.length > 0,
      hasInStore: order.has_in_store ?? items.some((item) => item.category !== 'membership'),
      createdAt: order.created_at,
      collectedAt: order.collected_at,
    };
  } finally {
    clearTimeout(timer);
  }
}

function deriveState(
  orderStatus: string,
  payment: Row['payments'] extends (infer P)[] | null ? P | null : never,
  hasMembership: boolean,
  membership: OrderMembership | null
): OrderState {
  if (payment?.status === 'success') {
    if (orderStatus === 'cancelled' || orderStatus === 'failed') return 'needs-refund';
    if (orderStatus === 'pending') return 'fulfilment-pending';
    if (hasMembership && !membership) return 'fulfilment-pending';
    return 'fulfilled';
  }
  if (payment?.metadata && 'amount_mismatch' in payment.metadata) return 'under-review';
  if (payment?.status === 'failed' || orderStatus === 'failed') return 'failed';
  if (payment?.status === 'expired' || orderStatus === 'cancelled') return 'expired';
  return 'awaiting-payment';
}
