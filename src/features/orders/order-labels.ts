import type { OrderSummary } from './orders-api';

/**
 * Wording for an order, from the server's own values only. Payment and
 * collection are separate: a paid order is not a collected one, and "paid" is
 * shown only when the payment row says success.
 */

export type LabelTone = 'good' | 'neutral' | 'attention' | 'muted';

export function paymentLabel(o: Pick<OrderSummary, 'status' | 'payment'>): { label: string; tone: LabelTone } {
  const p = o.payment;
  if (p?.status === 'success') {
    if (o.status === 'cancelled' || o.status === 'failed') return { label: 'Paid · refund due', tone: 'attention' };
    return { label: 'Paid', tone: 'good' };
  }
  if (p?.underReview) return { label: 'Under review', tone: 'attention' };
  if (o.status === 'failed' || p?.status === 'failed') return { label: 'Payment failed', tone: 'attention' };
  if (o.status === 'cancelled' || p?.status === 'expired') return { label: 'Not paid', tone: 'muted' };
  return { label: 'Awaiting payment', tone: 'neutral' };
}

/** Collection of in-store items, as recorded by the club. Null for orders with nothing to collect. */
export function collectionLabel(o: Pick<OrderSummary, 'status' | 'hasInStore'>): { label: string; tone: LabelTone } | null {
  if (!o.hasInStore) return null;
  switch (o.status) {
    case 'pending':
      return { label: 'Collect in store once paid', tone: 'muted' };
    case 'paid':
      return { label: 'Not ready to collect yet', tone: 'neutral' };
    case 'ready_for_collection':
      return { label: 'Ready to collect in store', tone: 'good' };
    case 'collected':
      return { label: 'Collected', tone: 'good' };
    default:
      return null;
  }
}

/** "Helmet × 2, Chaps" */
export function itemsLine(o: Pick<OrderSummary, 'items'>) {
  return o.items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join(', ') || 'Order';
}
