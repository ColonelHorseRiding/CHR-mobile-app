import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { useAuth } from '@/features/auth/auth-provider';
import { useStoreCatalog } from '@/features/store/catalog-provider';
import { CatalogLoading } from '@/features/store/components/catalog-status';
import { ProductFacts } from '@/features/store/components/product-facts';
import { formatINR, spokenINR } from '@/features/store/format';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

import { fetchOrderStatus, orderReference } from './order-status';
import { CheckoutError, prepareOrder, startGatewayOrder, verifyPayment } from './payments-api';
import { readPendingCheckout, savePendingCheckout } from './pending-checkout';
import { isRazorpayAvailable, openRazorpayCheckout } from './razorpay';

type Phase =
  | { kind: 'review' }
  | { kind: 'preparing' }
  | { kind: 'paying' }
  | { kind: 'verifying' }
  | { kind: 'notice'; tone: 'info' | 'error'; title: string; message: string; retry: boolean };

/** How recent an unpaid order for another product must be to block a new payment. */
const BLOCKING_PENDING_MINUTES = 15;

/**
 * Checkout: review the selection, then pay through Razorpay. The app only ever
 * sends identifiers; the server prices the order, verifies the payment and
 * fulfils it. After the payment window closes, the customer is taken to the
 * order's status screen, which shows what the server reports.
 */
export default function CheckoutScreen() {
  const theme = useTheme();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { user } = useAuth();
  const catalog = useStoreCatalog();
  const product = catalog.products.find((p) => p.id === productId);
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const [reference, setReference] = useState<string | null>(null);
  const [blockingOrder, setBlockingOrder] = useState<{ orderId: string; productName: string } | null>(null);
  const inFlight = useRef(false);

  // A recent unresolved payment for something else must be settled first, so a
  // late-arriving payment for it can never end up alongside a second purchase.
  useEffect(() => {
    if (!user || !productId) return;
    const pending = readPendingCheckout(user.id);
    if (!pending || pending.productId === productId) return;
    const ageMinutes = (Date.now() - new Date(pending.startedAt).getTime()) / 60_000;
    let live = true;
    fetchOrderStatus(pending.orderId)
      .then((status) => {
        if (!live || !status) return;
        if (status.state === 'fulfilment-pending' || (status.state === 'awaiting-payment' && ageMinutes < BLOCKING_PENDING_MINUTES)) {
          setBlockingOrder({ orderId: pending.orderId, productName: pending.productName });
        }
      })
      .catch(() => {
        if (live && ageMinutes < BLOCKING_PENDING_MINUTES) {
          setBlockingOrder({ orderId: pending.orderId, productName: pending.productName });
        }
      });
    return () => {
      live = false;
    };
  }, [user, productId]);

  if (!product) {
    if (catalog.status === 'loading') {
      return (
        <ScreenContainer scroll={false} contentStyle={styles.centered}>
          <CatalogLoading />
        </ScreenContainer>
      );
    }
    return (
      <ScreenContainer scroll={false} contentStyle={styles.centered}>
        <EmptyState
          title="Nothing selected"
          message="We couldn't find the option you chose. Please pick it again from the store."
          action={<PrimaryButton title="Back to store" onPress={() => router.dismissTo('/store')} />}
        />
      </ScreenContainer>
    );
  }

  const busy = phase.kind === 'preparing' || phase.kind === 'paying' || phase.kind === 'verifying';
  const razorpayReady = isRazorpayAvailable();

  async function handlePay() {
    if (inFlight.current || !product || !user) return;
    inFlight.current = true;
    setPhase({ kind: 'preparing' });
    try {
      // Re-check the product with the server: it may have been withdrawn or bought elsewhere.
      const fresh = await catalog.refresh();
      if (!fresh) throw new CheckoutError('network', "We couldn't reach the club's servers.");
      const current = fresh.find((p) => p.id === product.id);
      if (!current || !current.isPurchasable) {
        setPhase({
          kind: 'notice',
          tone: 'error',
          title: 'Not available',
          message: current?.activeUntil
            ? 'You already hold this plan, so it cannot be bought again yet.'
            : 'This option is no longer available to purchase.',
          retry: false,
        });
        return;
      }

      const order = await prepareOrder(current.id, current.price);
      savePendingCheckout(user.id, {
        orderId: order.orderId,
        paymentId: order.paymentId,
        productId: current.id,
        productName: current.name,
        startedAt: order.createdAt,
      });
      setReference(orderReference(order.orderId));

      const gateway = await startGatewayOrder(order.paymentId);
      // Defence in depth: the gateway order must charge exactly what the server recorded.
      if (gateway.amountPaise !== Math.round(order.amountDue * 100) || gateway.currency !== order.currency) {
        router.replace({ pathname: '/store/order/[orderId]', params: { orderId: order.orderId, outcome: 'unknown' } });
        return;
      }

      setPhase({ kind: 'paying' });
      const outcome = await openRazorpayCheckout({
        keyId: gateway.keyId,
        razorpayOrderId: gateway.razorpayOrderId,
        amountPaise: gateway.amountPaise,
        currency: gateway.currency,
        description: current.name,
        prefill: { name: user.user_metadata?.full_name, email: user.email },
        themeColor: theme.brand,
      });

      switch (outcome.kind) {
        case 'completed': {
          setPhase({ kind: 'verifying' });
          // The server checks the signature and capture; its answer is not trusted
          // on its own either — the status screen re-reads the order.
          await verifyPayment({
            paymentId: order.paymentId,
            razorpayOrderId: outcome.razorpayOrderId,
            razorpayPaymentId: outcome.razorpayPaymentId,
            razorpaySignature: outcome.razorpaySignature,
          }).catch(() => null);
          router.replace({ pathname: '/store/order/[orderId]', params: { orderId: order.orderId, outcome: 'completed' } });
          return;
        }
        case 'cancelled': {
          // A payment can still have gone through just before the window closed.
          const status = await fetchOrderStatus(order.orderId).catch(() => null);
          if (status && !(status.state === 'awaiting-payment')) {
            router.replace({ pathname: '/store/order/[orderId]', params: { orderId: order.orderId, outcome: 'cancelled' } });
            return;
          }
          setPhase({
            kind: 'notice',
            tone: 'info',
            title: 'Payment cancelled',
            message: "You closed the payment window, so you haven't been charged. Your order is kept, and you can pay for it whenever you're ready.",
            retry: true,
          });
          return;
        }
        case 'unavailable':
          setPhase({
            kind: 'notice',
            tone: 'error',
            title: 'Payment unavailable on this device',
            message: 'Payments need the CHR app installed from a build that includes Razorpay. Please update the app.',
            retry: false,
          });
          return;
        default:
          // Failed or interrupted: never assume — let the server say what happened.
          router.replace({
            pathname: '/store/order/[orderId]',
            params: { orderId: order.orderId, outcome: outcome.kind === 'failed' ? 'failed' : 'unknown' },
          });
      }
    } catch (error) {
      const known = error instanceof CheckoutError ? error : new CheckoutError('unknown', 'Something went wrong. Please try again.');
      setPhase({
        kind: 'notice',
        tone: known.kind === 'already-owned' || known.kind === 'unavailable' ? 'info' : 'error',
        title:
          known.kind === 'network'
            ? "Couldn't reach the club"
            : known.kind === 'session'
              ? 'Session expired'
              : known.kind === 'already-owned'
                ? 'Already active'
                : "Couldn't start payment",
        message: known.message,
        retry: known.kind === 'network' || known.kind === 'unknown',
      });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <ScreenContainer>
      <SectionHeading eyebrow="Checkout" title="Review your order" />

      <Card style={styles.summary}>
        <ThemedText variant="heading">{product.name}</ThemedText>
        <ProductFacts product={product} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.row} accessible accessibilityLabel={`Amount to pay ${spokenINR(product.price)}`}>
          <ThemedText themeColor="textSecondary">Amount to pay</ThemedText>
          <ThemedText variant="title">{formatINR(product.price)}</ThemedText>
        </View>
        {reference ? (
          <View style={styles.row}>
            <ThemedText themeColor="textSecondary">Order reference</ThemedText>
            <ThemedText variant="bodyStrong" selectable>
              {reference}
            </ThemedText>
          </View>
        ) : null}
        <ThemedText variant="caption" themeColor="textSecondary">
          The amount is set by the club&apos;s system and charged in Indian rupees through Razorpay.
        </ThemedText>
      </Card>

      {blockingOrder ? (
        <FormMessage
          tone="info"
          title="You have a payment in progress"
          action={
            <Button
              variant="ghost"
              title="View its status"
              onPress={() => router.push({ pathname: '/store/order/[orderId]', params: { orderId: blockingOrder.orderId } })}
            />
          }>
          {`Your payment for ${blockingOrder.productName} hasn't been settled yet. Check it before starting another.`}
        </FormMessage>
      ) : null}

      {!razorpayReady ? (
        <FormMessage tone="info" title="Payment isn't available here">
          This copy of the app doesn&apos;t include the payment module. Please use the CHR app build for Android.
        </FormMessage>
      ) : null}

      {phase.kind === 'notice' ? (
        <FormMessage tone={phase.tone} title={phase.title}>
          {phase.message}
        </FormMessage>
      ) : null}

      {busy ? (
        <LoadingIndicator
          label={
            phase.kind === 'preparing'
              ? 'Preparing your order'
              : phase.kind === 'paying'
                ? 'Waiting for the payment window'
                : 'Checking your payment with the club'
          }
        />
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          title={phase.kind === 'notice' && phase.retry ? `Pay ${formatINR(product.price)}` : `Continue to payment`}
          accessibilityLabel={`Pay ${spokenINR(product.price)} with Razorpay`}
          accessibilityHint="Opens the secure Razorpay payment window"
          fullWidth
          loading={busy}
          loadingLabel={phase.kind === 'preparing' ? 'Preparing payment' : phase.kind === 'paying' ? 'Payment open' : 'Confirming payment'}
          disabled={!razorpayReady || !!blockingOrder || (phase.kind === 'notice' && !phase.retry)}
          onPress={handlePay}
        />
        <Button variant="ghost" title="Back to store" disabled={busy} onPress={() => router.dismissTo('/store')} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: Spacing.lg,
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
  actions: {
    gap: Spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
});

