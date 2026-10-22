import { fetchOrderStatus } from './order-status';
import { startGatewayOrder, verifyPayment } from './payments-api';
import { openRazorpayCheckout } from './razorpay';

/**
 * Pays an order the server has already created and priced, through the
 * existing Edge Functions: razorpay-create-order (amount read server-side from
 * the payments row), the Razorpay sheet, then razorpay-verify-payment. The
 * result is only a hint for what to show next — the order status screen
 * re-reads the order, and only the server marks it paid.
 */
export type PayResult =
  | { kind: 'completed' } // sheet reported success; the server is verifying
  | { kind: 'cancelled' } // closed before paying (and the server shows no payment)
  | { kind: 'settled' } // closed, but the server already shows a change — go and look
  | { kind: 'failed' }
  | { kind: 'unknown' } // interrupted, or the amounts didn't match
  | { kind: 'unavailable' }; // this build has no payment module

export async function payExistingOrder(input: {
  orderId: string;
  paymentId: string;
  /** The amount the server set for this payment (payments.amount / create_order amount_due). */
  amountDue: number;
  currency: string;
  description: string;
  prefill: { name?: string; email?: string };
  themeColor: string;
}): Promise<PayResult> {
  const gateway = await startGatewayOrder(input.paymentId);
  // Defence in depth: the gateway order must charge exactly what the server recorded.
  if (gateway.amountPaise !== Math.round(input.amountDue * 100) || gateway.currency !== input.currency) {
    return { kind: 'unknown' };
  }

  const outcome = await openRazorpayCheckout({
    keyId: gateway.keyId,
    razorpayOrderId: gateway.razorpayOrderId,
    amountPaise: gateway.amountPaise,
    currency: gateway.currency,
    description: input.description,
    prefill: input.prefill,
    themeColor: input.themeColor,
  });

  switch (outcome.kind) {
    case 'completed':
      await verifyPayment({
        paymentId: input.paymentId,
        razorpayOrderId: outcome.razorpayOrderId,
        razorpayPaymentId: outcome.razorpayPaymentId,
        razorpaySignature: outcome.razorpaySignature,
      }).catch(() => null);
      return { kind: 'completed' };
    case 'cancelled': {
      // A payment can still have gone through just before the window closed.
      const status = await fetchOrderStatus(input.orderId).catch(() => null);
      return status && status.state !== 'awaiting-payment' ? { kind: 'settled' } : { kind: 'cancelled' };
    }
    case 'unavailable':
      return { kind: 'unavailable' };
    case 'failed':
      return { kind: 'failed' };
    default:
      return { kind: 'unknown' };
  }
}
