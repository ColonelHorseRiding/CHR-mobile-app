import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { sameItems, toOrderPayload } from '@/features/store/cart';
import { supabase } from '@/services/supabase/client';

/**
 * Client for the CHR website's existing payment backend (shared Supabase project).
 * The app is an untrusted client: it sends identifiers only. Amounts, product
 * terms, signature checks and fulfilment all happen on the server:
 *
 *   create_order(p_items)            RPC: validates product/price/eligibility, creates
 *                                    a pending order + payment (status 'created')
 *   razorpay-create-order            Edge Function: creates (or returns) the Razorpay
 *                                    order for that payment; amount read server-side
 *   razorpay-verify-payment          Edge Function: verifies the signature with the
 *                                    server-held secret, re-fetches the payment from
 *                                    Razorpay, then runs the idempotent fulfilment
 *   razorpay-webhook                 Authoritative async path (not called by the app)
 */

const REQUEST_TIMEOUT_MS = 20_000;
/** Unpaid orders are cancelled server-side after pending_order_expiry_hours (24 by default). */
const REUSABLE_ORDER_MAX_AGE_HOURS = 20;

export type CheckoutErrorKind =
  | 'network' // request failed or timed out — outcome may be unknown
  | 'session' // signed out / token rejected
  | 'unavailable' // product no longer on sale
  | 'already-owned' // plan lock / active membership with classes left
  | 'not-configured' // payments not set up on the server
  | 'not-payable' // order/payment no longer pending
  | 'verification' // signature/order mismatch or verification failure
  | 'rate-limited'
  | 'unknown';

export class CheckoutError extends Error {
  constructor(
    readonly kind: CheckoutErrorKind,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, [CheckoutErrorKind, string]> = {
  // create_order()
  'Not authenticated': ['session', 'Your session has expired. Please sign in again.'],
  ACCOUNT_NOT_ACTIVE: ['unavailable', 'Your account is not active. Please contact the club.'],
  PRODUCT_UNAVAILABLE: ['unavailable', 'This option is no longer on sale.'],
  PRICE_NOT_SET: ['unavailable', 'This option is not available to buy yet.'],
  MEMBERSHIP_ALREADY_ACTIVE: ['already-owned', 'You already hold this plan. You can buy it again after it ends.'],
  ACTIVE_MEMBERSHIP_EXISTS: [
    'already-owned',
    'You already have an active membership with classes remaining, so another membership cannot be bought yet.',
  ],
  TOO_MANY_PENDING_ORDERS: ['rate-limited', 'You have several unpaid orders. Please wait a while before starting another.'],
  // create_order() — shop carts
  EMPTY_CART: ['unavailable', 'Your order is empty.'],
  CART_TOO_LARGE: ['unavailable', 'That’s a lot of items — please split this into two orders.'],
  INVALID_QUANTITY: ['unavailable', 'One of the quantities isn’t accepted. Please review your order.'],
  INVALID_CART: ['unavailable', 'Something is wrong with your order. Please review it and try again.'],
  // create_order() — sizes (the server's own detail text, when present, names the product and size)
  VARIANT_REQUIRED: ['unavailable', 'One item needs a size. Remove it from your order and choose a size.'],
  VARIANT_UNAVAILABLE: ['unavailable', 'A size in your order is no longer offered. Please update your selection.'],
  OUT_OF_STOCK: ['unavailable', 'A size in your order is out of stock. Please update your selection.'],
  // razorpay-create-order / razorpay-verify-payment
  PAYMENT_NOT_FOUND: ['not-payable', "We couldn't find this payment. Please start again from the store."],
  PAYMENT_NOT_PENDING: ['not-payable', 'This payment has already been processed.'],
  ORDER_NOT_ELIGIBLE: ['not-payable', 'This order can no longer be paid. Please start a new one from the store.'],
  MEMBERSHIP_NOT_ELIGIBLE: ['not-payable', 'This membership can no longer be paid for.'],
  SERVER_NOT_CONFIGURED: ['not-configured', "Online payment isn't set up yet. Please try again later or contact the club."],
  ORDER_CREATION_FAILED: ['network', "We couldn't start the payment just now. Please try again in a moment."],
  ORDER_ATTACH_FAILED: ['network', "We couldn't start the payment just now. Please try again in a moment."],
  PAYMENT_LOOKUP_FAILED: ['network', "We couldn't start the payment just now. Please try again in a moment."],
  ORDER_ID_MISMATCH: ['verification', 'This payment session did not match your order. Please check the order status.'],
  INVALID_SIGNATURE: ['verification', "We couldn't verify this payment. Please check the order status or contact the club."],
  VERIFICATION_FAILED: ['verification', "We couldn't confirm this payment yet. If money was taken it will be confirmed shortly."],
  INTERNAL_ERROR: ['unknown', 'Something went wrong on our side. Please try again in a moment.'],
};

function errorFor(code: string | undefined, fallback: string, detail?: string): CheckoutError {
  const known = code ? MESSAGES[code] : undefined;
  if (known) return new CheckoutError(known[0], detail || known[1], code);
  return new CheckoutError('unknown', fallback, code);
}

async function withTimeout<T>(promise: PromiseLike<T>, controller?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new CheckoutError('network', "We couldn't reach the club's servers."));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function client() {
  if (!supabase) throw new CheckoutError('not-configured', 'The app is not connected to the club.');
  return supabase;
}

function isNetworkMessage(text: string) {
  return /network|fetch|timed? ?out|abort/i.test(text);
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type PreparedOrder = {
  orderId: string;
  paymentId: string;
  /** Amount to be charged by Razorpay, as recorded on the server-side payment row. */
  amountDue: number;
  currency: string;
  createdAt: string;
  reused: boolean;
};

type PendingOrderRow = {
  id: string;
  status: string;
  created_at: string;
  order_items: { product_id: string | null; variant_id?: string | null; quantity: number }[] | null;
  payments: { id: string; status: string; amount: number | string; currency: string }[] | null;
};

/**
 * An unpaid order the customer already has for exactly this product at the
 * current price. Reused instead of creating another, so retries, double taps
 * and uncertain earlier requests never multiply orders.
 */
export async function findReusableOrder(productId: string, currentPrice: number): Promise<PreparedOrder | null> {
  const db = client();
  const since = new Date(Date.now() - REUSABLE_ORDER_MAX_AGE_HOURS * 3600_000).toISOString();
  const controller = new AbortController();
  const { data, error } = await withTimeout(
    db
      .from('orders')
      .select('id, status, created_at, order_items(product_id, quantity), payments(id, status, amount, currency)')
      .eq('status', 'pending')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10)
      .abortSignal(controller.signal),
    controller
  );
  if (error) throw new CheckoutError(isNetworkMessage(error.message) ? 'network' : 'unknown', "We couldn't check your existing orders.");

  for (const order of (data ?? []) as PendingOrderRow[]) {
    const items = order.order_items ?? [];
    const payment = (order.payments ?? [])[0];
    const amount = Number(payment?.amount);
    if (
      items.length === 1 &&
      items[0].product_id === productId &&
      items[0].quantity === 1 &&
      payment?.status === 'created' &&
      // The order's price is fixed when placed; a stale price is never reused.
      amount === currentPrice
    ) {
      return {
        orderId: order.id,
        paymentId: payment.id,
        amountDue: amount,
        currency: payment.currency,
        createdAt: order.created_at,
        reused: true,
      };
    }
  }
  return null;
}

/** Creates a pending order through the existing create_order() RPC (server-priced). */
export async function createOrder(productId: string): Promise<PreparedOrder> {
  const db = client();
  const controller = new AbortController();
  const { data, error } = await withTimeout(
    db.rpc('create_order', { p_items: [{ product_id: productId, quantity: 1 }] }).abortSignal(controller.signal),
    controller
  );
  if (error) {
    if (isNetworkMessage(error.message)) throw new CheckoutError('network', "We couldn't reach the club's servers.");
    const code = Object.keys(MESSAGES).find((key) => error.message.includes(key));
    throw errorFor(code, "We couldn't create your order. Please try again.", error.details || undefined);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.order_id || !row?.payment_id) throw new CheckoutError('unknown', "We couldn't create your order. Please try again.");
  return {
    orderId: row.order_id,
    paymentId: row.payment_id,
    amountDue: Number(row.amount_due ?? row.total_amount),
    currency: row.currency ?? 'INR',
    createdAt: new Date().toISOString(),
    reused: false,
  };
}

/**
 * Returns the customer's pending order for this product, creating one only when
 * none exists. If a create request fails in a way that leaves its outcome
 * unknown (timeout, dropped connection), the existing orders are checked again
 * before anything else is attempted.
 */
export async function prepareOrder(productId: string, currentPrice: number): Promise<PreparedOrder> {
  const existing = await findReusableOrder(productId, currentPrice);
  if (existing) return existing;
  try {
    return await createOrder(productId);
  } catch (error) {
    if (error instanceof CheckoutError && error.kind === 'network') {
      const created = await findReusableOrder(productId, currentPrice).catch(() => null);
      if (created) return created;
    }
    throw error;
  }
}

// ─── Tack Shop / Café orders (same create_order() contract, several items) ───

export type CartOrderItem = { productId: string; variantId?: string | null; quantity: number };

/**
 * An unpaid order the customer already placed for exactly these items, with a
 * payment the server priced at `expectedAmount`. Reused instead of creating
 * another, so a retry after a lost reply never multiplies orders.
 */
export async function findReusableCartOrder(items: CartOrderItem[], expectedAmount: number): Promise<PreparedOrder | null> {
  const db = client();
  const since = new Date(Date.now() - REUSABLE_ORDER_MAX_AGE_HOURS * 3600_000).toISOString();
  const controller = new AbortController();
  const { data, error } = await withTimeout(
    db
      .from('orders')
      .select('id, status, created_at, order_items(product_id, variant_id, quantity), payments(id, status, amount, currency)')
      .eq('status', 'pending')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10)
      .abortSignal(controller.signal),
    controller
  );
  if (error) throw new CheckoutError(isNetworkMessage(error.message) ? 'network' : 'unknown', "We couldn't check your existing orders.");

  for (const order of (data ?? []) as PendingOrderRow[]) {
    const lines = (order.order_items ?? []).map((i) => ({ productId: i.product_id ?? '', variantId: i.variant_id ?? null, quantity: i.quantity }));
    const payment = (order.payments ?? [])[0];
    const amount = Number(payment?.amount);
    if (sameItems(lines, items) && payment?.status === 'created' && amount === expectedAmount) {
      return { orderId: order.id, paymentId: payment.id, amountDue: amount, currency: payment.currency, createdAt: order.created_at, reused: true };
    }
  }
  return null;
}

/** Creates a pending order for several shop items through create_order(); the server prices every line. */
export async function createCartOrder(items: CartOrderItem[]): Promise<PreparedOrder> {
  const db = client();
  const controller = new AbortController();
  const { data, error } = await withTimeout(
    db
      .rpc('create_order', { p_items: toOrderPayload(items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity }))) })
      .abortSignal(controller.signal),
    controller
  );
  if (error) {
    if (isNetworkMessage(error.message)) throw new CheckoutError('network', "We couldn't reach the club's servers.");
    const code = Object.keys(MESSAGES).find((key) => error.message.includes(key));
    throw errorFor(code, "We couldn't create your order. Please try again.", error.details || undefined);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.order_id || !row?.payment_id) throw new CheckoutError('unknown', "We couldn't create your order. Please try again.");
  return {
    orderId: row.order_id,
    paymentId: row.payment_id,
    amountDue: Number(row.amount_due ?? row.total_amount),
    currency: row.currency ?? 'INR',
    createdAt: new Date().toISOString(),
    reused: false,
  };
}

/**
 * Reuses an unpaid order for exactly this cart, or creates one. If a create
 * request's outcome is unknown, the customer's orders are checked again before
 * anything else is attempted.
 */
export async function prepareCartOrder(items: CartOrderItem[], expectedAmount: number): Promise<PreparedOrder> {
  const existing = await findReusableCartOrder(items, expectedAmount);
  if (existing) return existing;
  try {
    return await createCartOrder(items);
  } catch (error) {
    if (error instanceof CheckoutError && error.kind === 'network') {
      const created = await findReusableCartOrder(items, expectedAmount).catch(() => null);
      if (created) return created;
    }
    throw error;
  }
}

// ─── Razorpay order + verification (existing Edge Functions) ─────────────────

export type GatewayOrder = { keyId: string; razorpayOrderId: string; amountPaise: number; currency: string };

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const db = client();
  let result: Awaited<ReturnType<typeof db.functions.invoke>>;
  try {
    result = await withTimeout(db.functions.invoke(name, { body }));
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError('network', "We couldn't reach the club's servers.");
  }
  const { data, error } = result;
  if (!error) return data as T;
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    throw new CheckoutError('network', "We couldn't reach the club's servers.");
  }
  if (error instanceof FunctionsHttpError) {
    let code: string | undefined;
    try {
      code = ((await error.context.json()) as { error?: string; code?: string })?.error;
    } catch {
      /* non-JSON body */
    }
    if (error.context.status === 401) throw errorFor('Not authenticated', 'Your session has expired. Please sign in again.');
    throw errorFor(code, 'Something went wrong. Please try again.');
  }
  throw new CheckoutError('unknown', 'Something went wrong. Please try again.');
}

export async function startGatewayOrder(paymentId: string): Promise<GatewayOrder> {
  const data = await invoke<{ key_id?: string; order_id?: string; amount?: number; currency?: string }>(
    'razorpay-create-order',
    { payment_id: paymentId }
  );
  if (!data?.key_id || !data.order_id || typeof data.amount !== 'number') {
    throw new CheckoutError('unknown', "We couldn't start the payment just now. Please try again in a moment.");
  }
  return { keyId: data.key_id, razorpayOrderId: data.order_id, amountPaise: data.amount, currency: data.currency ?? 'INR' };
}

export type VerificationResult = { status: 'success' | 'failed' | 'pending' };

/** Server-side verification. Its answer is reported, but the order status read afterwards is what the UI trusts. */
export async function verifyPayment(input: {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<VerificationResult> {
  const data = await invoke<{ status?: string }>('razorpay-verify-payment', {
    payment_id: input.paymentId,
    razorpay_order_id: input.razorpayOrderId,
    razorpay_payment_id: input.razorpayPaymentId,
    razorpay_signature: input.razorpaySignature,
  });
  const status = data?.status === 'success' || data?.status === 'failed' ? data.status : 'pending';
  return { status };
}
