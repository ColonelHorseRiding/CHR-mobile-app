import { authStorage } from '@/services/supabase/storage';

/**
 * The one checkout a customer has in flight, persisted so it can be recovered
 * after the app is closed, killed or loses its connection mid-payment.
 * Holds identifiers only — never amounts to trust, signatures or secrets.
 */
export type PendingCheckout = {
  orderId: string;
  paymentId: string;
  productId: string;
  productName: string;
  startedAt: string;
  /** Absent on records saved before Tack Shop orders existed: those are memberships. */
  kind?: 'membership' | 'shop';
};

const keyFor = (userId: string) => `chr.checkout.pending.${userId}`;

export function readPendingCheckout(userId: string): PendingCheckout | null {
  try {
    const raw = authStorage?.getItem(keyFor(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingCheckout;
    return value?.orderId && value.paymentId ? value : null;
  } catch {
    return null;
  }
}

export function savePendingCheckout(userId: string, checkout: PendingCheckout) {
  try {
    authStorage?.setItem(keyFor(userId), JSON.stringify(checkout));
  } catch {
    /* recovery falls back to the server's pending-order lookup */
  }
}

export function clearPendingCheckout(userId: string, orderId?: string) {
  try {
    const current = readPendingCheckout(userId);
    if (!orderId || current?.orderId === orderId) authStorage?.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}
