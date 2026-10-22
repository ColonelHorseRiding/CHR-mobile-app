import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { ScreenContainer } from '@/components/ui/screen-container';
import { useAuth } from '@/features/auth/auth-provider';
import { useStoreCatalog } from '@/features/store/catalog-provider';
import { formatDate, formatINR, plural, spokenINR } from '@/features/store/format';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

import { fetchOrderStatus, isUnresolved, planIsActive, shouldGoToBooking, type OrderStatus } from './order-status';
import { payExistingOrder } from './pay-order';
import { CheckoutError } from './payments-api';
import { clearPendingCheckout, savePendingCheckout } from './pending-checkout';
import { isRazorpayAvailable } from './razorpay';
import { ReceiptCard } from './receipt-card';

/** What the payment window reported on this device. A hint for wording only — never proof. */
type Outcome = 'completed' | 'cancelled' | 'failed' | 'unknown';

/** Bounded polling while the server can still change the order (webhook, fulfilment). */
const POLL_DELAYS_MS = [2_000, 3_000, 5_000, 8_000, 13_000, 20_000];

/**
 * The route can be reused with a different order (e.g. a second deep link while
 * open); keying by order id gives every order a fresh status state.
 */
export default function OrderStatusScreen() {
  const params = useLocalSearchParams<{ orderId: string; outcome?: Outcome; from?: string }>();
  return (
    <OrderStatusView key={params.orderId} orderId={params.orderId} outcome={params.outcome} fromOrders={params.from === 'orders'} />
  );
}

function OrderStatusView({ orderId, outcome: initialOutcome, fromOrders }: { orderId: string; outcome?: Outcome; fromOrders: boolean }) {
  const theme = useTheme();
  const { user } = useAuth();
  const { refresh: refreshCatalog } = useStoreCatalog();

  const [outcome, setOutcome] = useState<Outcome | undefined>(initialOutcome);
  const [paying, setPaying] = useState(false);
  const [payNotice, setPayNotice] = useState<string | null>(null);
  const payInFlight = useRef(false);
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [loadError, setLoadError] = useState<CheckoutError | null>(null);
  const [checking, setChecking] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pollsDone, setPollsDone] = useState(false);
  const [pollRound, setPollRound] = useState(0);
  const inFlight = useRef(false);
  /** True once this view saw the order still unsettled, i.e. the payment completed while the member watched. */
  const [sawUnresolved, setSawUnresolved] = useState(false);
  const redirected = useRef(false);

  const check = useCallback(async () => {
    if (!orderId || inFlight.current) return null;
    inFlight.current = true;
    setChecking(true);
    try {
      const next = await fetchOrderStatus(orderId, user?.id);
      setLoadError(null);
      if (!next) {
        setNotFound(true);
        return null;
      }
      if (isUnresolved(next.state)) setSawUnresolved(true);
      setStatus(next);
      if (!isUnresolved(next.state)) {
        if (user) clearPendingCheckout(user.id, next.orderId);
        // Availability changes once an order settles (plan lock, active membership).
        void refreshCatalog();
      }
      return next;
    } catch (error) {
      setLoadError(error instanceof CheckoutError ? error : new CheckoutError('unknown', "We couldn't check this order."));
      return null;
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [orderId, user, refreshCatalog]);

  // A check now, then a short, bounded series of re-checks while the server can
  // still change the order. "Check again" starts a new round.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const run = () => {
      void check().then((latest) => {
        if (cancelled) return;
        const keepPolling = latest ? isUnresolved(latest.state) : true;
        if (!keepPolling || attempt >= POLL_DELAYS_MS.length) {
          setPollsDone(true);
          return;
        }
        timer = setTimeout(run, POLL_DELAYS_MS[attempt]);
        attempt += 1;
      });
    };
    timer = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [check, pollRound]);

  // Coming back to the app (e.g. after approving a UPI payment elsewhere) re-checks once.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [check]);

  const refreshNow = () => {
    setPollsDone(false);
    setPollRound((round) => round + 1);
  };

  /** A plan the server has confirmed and activated, just paid for in this visit: the next step is booking. */
  const justActivated = shouldGoToBooking(status, outcome, sawUnresolved, fromOrders);

  const goBook = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    // Clear this order from the Store tab's stack so coming back to it shows the store, then open Book.
    router.dismissTo('/store');
    router.navigate('/book');
  }, []);

  useEffect(() => {
    if (!justActivated) return;
    const timer = setTimeout(goBook, 2500);
    return () => clearTimeout(timer);
  }, [justActivated, goBook]);

  const done = () => (fromOrders && router.canGoBack() ? router.back() : router.dismissTo('/store'));

  /** Pays an unpaid Tack Shop / Café order the server already priced (same Edge Functions as checkout). */
  async function payShopOrder(current: OrderStatus) {
    if (payInFlight.current || !user || !current.paymentId) return;
    payInFlight.current = true;
    setPaying(true);
    setPayNotice(null);
    try {
      savePendingCheckout(user.id, {
        orderId: current.orderId,
        paymentId: current.paymentId,
        productId: 'shop',
        productName: current.productName,
        startedAt: new Date().toISOString(),
        kind: 'shop',
      });
      const result = await payExistingOrder({
        orderId: current.orderId,
        paymentId: current.paymentId,
        amountDue: current.amount,
        currency: current.currency,
        description: `Order ${current.reference}`,
        prefill: { name: user.user_metadata?.full_name, email: user.email },
        themeColor: theme.brand,
      });
      if (result.kind === 'unavailable') {
        setPayNotice('Payments need the CHR app build that includes Razorpay.');
        return;
      }
      setOutcome(result.kind === 'cancelled' ? 'cancelled' : result.kind === 'failed' ? 'failed' : result.kind === 'completed' ? 'completed' : 'unknown');
      refreshNow();
    } catch (error) {
      setPayNotice(error instanceof CheckoutError ? error.message : "We couldn't start the payment. Please try again.");
    } finally {
      payInFlight.current = false;
      setPaying(false);
    }
  }

  if (notFound) {
    return (
      <ScreenContainer scroll={false} contentStyle={styles.centered}>
        <EmptyState
          title="Order not found"
          message="We couldn't find this order on your account."
          action={<PrimaryButton title="Back to store" onPress={done} />}
        />
      </ScreenContainer>
    );
  }

  if (!status) {
    return (
      <ScreenContainer scroll={false} contentStyle={styles.centered}>
        {loadError ? (
          <EmptyState
            title="Couldn't check your order"
            message={`${loadError.message} Your payment, if made, is safe — check again in a moment.`}
            action={<PrimaryButton title="Check again" loading={checking} onPress={refreshNow} />}
          />
        ) : (
          <LoadingIndicator label="Checking your order with the club" />
        )}
      </ScreenContainer>
    );
  }

  const view = describe(status, outcome, pollsDone, fromOrders);
  if (justActivated) {
    view.message = 'The club has confirmed your payment and activated your plan. Taking you to book your first class…';
  }
  const canBook = planIsActive(status);
  // Memberships go back through their own checkout (plan rules); shop orders are paid here.
  const canPayAgain =
    status.hasMembership && status.state === 'awaiting-payment' && (outcome === 'cancelled' || outcome === 'failed') && !!status.productId;
  const canPayShop =
    !status.hasMembership && status.state === 'awaiting-payment' && status.paymentStatus === 'created' && !!status.paymentId;
  const shownItems = status.items.length > 0 ? status.items : [{ name: status.productName, category: '', quantity: 1, unitPrice: status.orderTotal }];

  return (
    <ScreenContainer>
      <View style={styles.heading} accessibilityLiveRegion="polite">
        <ThemedText variant="eyebrow" themeColor={view.tone === 'success' ? 'success' : view.tone === 'error' ? 'danger' : 'accentText'}>
          {view.eyebrow}
        </ThemedText>
        <ThemedText variant="display" accessibilityRole="header">
          {view.title}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{view.message}</ThemedText>
      </View>

      <Card style={styles.summary}>
        {shownItems.length === 1 && shownItems[0].quantity === 1 ? (
          <Row label="Item" value={shownItems[0].name} />
        ) : (
          shownItems.map((item, index) => (
            <Row
              key={`${item.name}-${index}`}
              label={`${item.name} × ${item.quantity}`}
              value={formatINR(item.unitPrice * item.quantity)}
              spoken={`${item.quantity} ${item.name}, ${spokenINR(item.unitPrice * item.quantity)}`}
            />
          ))
        )}
        {status.orderTotal !== status.amount ? <Row label="Order total" value={formatINR(status.orderTotal)} /> : null}
        <Row
          label={status.paymentStatus === 'success' ? 'Amount paid' : 'Amount'}
          value={formatINR(status.amount)}
          spoken={spokenINR(status.amount)}
        />
        <Row label="Order reference" value={status.reference} selectable />
        {status.createdAt ? <Row label="Placed" value={formatDateTimeIST(status.createdAt)} /> : null}
        {status.paidAt ? <Row label="Paid" value={formatDateTimeIST(status.paidAt)} /> : null}
        {status.hasInStore ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Row label="Collection" value={collectionText(status)} />
            {status.collectedAt ? <Row label="Collected" value={formatDateTimeIST(status.collectedAt)} /> : null}
          </>
        ) : null}
        {status.membership ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Row label="Plan status" value={status.membership.status === 'active' ? 'Active' : status.membership.status} />
            {status.membership.totalCredits !== null ? (
              <Row label="Classes" value={plural(status.membership.totalCredits, 'class', 'classes')} />
            ) : null}
            {status.membership.endDate ? <Row label="Valid until" value={formatDate(status.membership.endDate)} /> : null}
          </>
        ) : null}
      </Card>

      {/* Only once the server has confirmed the payment; the receipt itself is read from the server. */}
      {status.paymentStatus === 'success' && status.paymentId ? (
        <ReceiptCard orderId={status.orderId} formatDateTime={formatDateTimeIST} />
      ) : null}

      {loadError ? (
        <FormMessage tone="error" title="Couldn't refresh">
          {`${loadError.message} Showing the last status we received.`}
        </FormMessage>
      ) : null}

      {isUnresolved(status.state) && !pollsDone ? <LoadingIndicator label="Checking for updates" /> : null}

      {payNotice ? (
        <FormMessage tone="error" title="Couldn't start the payment">
          {payNotice}
        </FormMessage>
      ) : null}

      <View style={styles.actions}>
        {canPayShop ? (
          <PrimaryButton
            title={`Pay ${formatINR(status.amount)}`}
            accessibilityLabel={`Pay ${spokenINR(status.amount)} with Razorpay`}
            accessibilityHint="Opens the secure Razorpay payment window for this order"
            fullWidth
            loading={paying}
            loadingLabel="Opening payment"
            disabled={!isRazorpayAvailable()}
            onPress={() => void payShopOrder(status)}
          />
        ) : null}
        {canPayAgain ? (
          <PrimaryButton
            title={`Pay ${formatINR(status.amount)}`}
            accessibilityHint="Opens checkout again for this same order"
            fullWidth
            onPress={() =>
              router.replace({ pathname: '/store/checkout', params: { productId: status.productId as string } })
            }
          />
        ) : null}
        {isUnresolved(status.state) ? (
          <SecondaryButton title="Check again" fullWidth loading={checking} onPress={refreshNow} />
        ) : null}
        {isUnresolved(status.state) ? (
          <Button variant="ghost" title={fromOrders ? 'Back to my orders' : 'Back to store'} onPress={done} />
        ) : canBook && !fromOrders ? (
          <>
            <PrimaryButton title="Book your first class" fullWidth onPress={goBook} />
            <Button variant="ghost" title="Back to store" onPress={done} />
          </>
        ) : (
          <PrimaryButton title="Done" fullWidth onPress={done} />
        )}
      </View>
    </ScreenContainer>
  );
}

function Row({ label, value, spoken, selectable }: { label: string; value: string; spoken?: string; selectable?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${spoken ?? value}`}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <ThemedText variant="bodyStrong" style={styles.value} selectable={selectable}>
        {value}
      </ThemedText>
    </View>
  );
}

/** In-store collection, as recorded by the club (orders.status). Paid is never shown as collected. */
function collectionText(status: OrderStatus) {
  switch (status.orderStatus) {
    case 'pending':
      return 'In store, once paid';
    case 'paid':
      return 'In store · the club will tell you when it’s ready';
    case 'ready_for_collection':
      return 'Ready to collect in store';
    case 'collected':
      return 'Collected';
    default:
      return 'Not applicable';
  }
}

const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Oct 2026, 9:31 pm" in India time. */
function formatDateTimeIST(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + IST_OFFSET_MS);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

type StateCopy = { tone: 'success' | 'info' | 'error'; eyebrow: string; title: string; message: string };

/** Wording for each server-reported state. Only 'fulfilled' is presented as a completed purchase. */
function describe(status: OrderStatus, outcome: Outcome | undefined, pollsDone: boolean, fromOrders = false): StateCopy {
  const shop = !status.hasMembership;
  switch (status.state) {
    case 'fulfilled':
      if (shop) {
        // Paid is not collected: collection is recorded by staff (orders.status).
        if (status.orderStatus === 'collected') {
          return { tone: 'success', eyebrow: 'Collected', title: 'Order collected', message: 'You collected this order at the club.' };
        }
        if (status.orderStatus === 'ready_for_collection') {
          return {
            tone: 'success',
            eyebrow: 'Ready to collect',
            title: 'Your order is ready',
            message: 'The club has your order ready. Collect it in store at the club.',
          };
        }
        return {
          tone: 'success',
          eyebrow: 'Payment confirmed',
          title: 'Order confirmed',
          message: "The club has confirmed your payment. Your items are collected in store — the club will tell you when they're ready.",
        };
      }
      return {
        tone: 'success',
        eyebrow: 'Payment confirmed',
        title: status.membership ? 'Your plan is active' : 'Order complete',
        message: status.membership
          ? 'The club has confirmed your payment and activated your plan. You can book your first class in the Book tab.'
          : 'The club has confirmed your payment.',
      };
    case 'fulfilment-pending':
      return {
        tone: 'info',
        eyebrow: 'Payment received',
        title: shop ? 'Confirming your order' : 'Activating your plan',
        message: pollsDone
          ? shop
            ? "Your payment is confirmed, but the order hasn't updated yet. This usually takes a moment — check again shortly."
            : "Your payment is confirmed, but your plan isn't active yet. This usually takes a moment — check again shortly, or contact the club if it doesn't update."
          : shop
            ? 'Your payment is confirmed. We are waiting for the club to confirm your order.'
            : 'Your payment is confirmed. We are waiting for your plan to be activated.',
      };
    case 'under-review':
      return {
        tone: 'error',
        eyebrow: 'Under review',
        title: 'Payment needs checking',
        message:
          "We received a payment that didn't match this order, so it hasn't been applied. The club has been alerted and will contact you. Please don't pay again.",
      };
    case 'needs-refund':
      return {
        tone: 'info',
        eyebrow: 'Payment received',
        title: 'Refund on its way',
        message: 'This order had already been closed when your payment arrived. The club has been told and will refund you.',
      };
    case 'failed':
      return {
        tone: 'error',
        eyebrow: 'Payment failed',
        title: "Payment didn't go through",
        message: shop
          ? 'No money was taken for this order. You can place it again from the store.'
          : 'No money was taken for this order. You can choose your plan again from the store.',
      };
    case 'expired':
      return {
        tone: 'info',
        eyebrow: 'Order closed',
        title: 'This order expired',
        message: "It wasn't paid in time, so it was cancelled and you weren't charged. You can place a new order from the store.",
      };
    default:
      if (outcome === 'cancelled') {
        return {
          tone: 'info',
          eyebrow: 'Not paid',
          title: 'Payment cancelled',
          message: "The payment window was closed, so you haven't been charged. You can pay for this order when you're ready.",
        };
      }
      if (outcome === 'failed') {
        return {
          tone: 'error',
          eyebrow: 'Not paid',
          title: "Payment didn't complete",
          message: "Razorpay couldn't complete the payment, and the club hasn't received one for this order. You can try again.",
        };
      }
      if (fromOrders && !outcome && status.paymentStatus === 'created') {
        return {
          tone: 'info',
          eyebrow: 'Not paid',
          title: 'Not paid yet',
          message: "This order hasn't been paid. Unpaid orders are cancelled automatically after a while.",
        };
      }
      return {
        tone: 'info',
        eyebrow: 'Checking',
        title: 'Confirming your payment',
        message: pollsDone
          ? "We haven't received confirmation yet. If you paid, it will be confirmed automatically — you won't be charged twice. Check again in a few minutes."
          : "We're waiting for the payment provider to confirm. This can take a few moments.",
      };
  }
}

const styles = StyleSheet.create({
  heading: {
    gap: Spacing.sm,
  },
  summary: {
    gap: Spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.md,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
  actions: {
    gap: Spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
});
