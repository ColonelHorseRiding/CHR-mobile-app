import { router } from 'expo-router';
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
import { priceChanges, resolveCart, unavailableMessage, type CartLine } from '@/features/store/cart';
import { useCart } from '@/features/store/cart-provider';
import { useStoreCatalog } from '@/features/store/catalog-provider';
import { ProductImage } from '@/features/store/components/product-image';
import { QuantityStepper } from '@/features/store/components/quantity-stepper';
import { formatINR, spokenINR } from '@/features/store/format';
import { photoUrl } from '@/features/store/image-hosts';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

import { orderReference } from './order-status';
import { payExistingOrder } from './pay-order';
import { CheckoutError, prepareCartOrder, type PreparedOrder } from './payments-api';
import { savePendingCheckout } from './pending-checkout';
import { isRazorpayAvailable } from './razorpay';

type Phase =
  | { kind: 'review' }
  | { kind: 'working'; label: string }
  /** The server priced the order differently from the total shown: confirm its amount before paying. */
  | { kind: 'confirm-amount'; order: PreparedOrder; shownTotal: number }
  | { kind: 'notice'; tone: 'info' | 'error'; title: string; message: string };

/**
 * Tack Shop / Café checkout. The cart holds product ids and quantities only;
 * the catalog is re-read before ordering, create_order() prices every line on
 * the server, and the customer pays exactly the server's amount through the
 * existing Razorpay flow. Items are collected in store — nothing is delivered.
 */
export default function CartScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const cart = useCart();
  const catalog = useStoreCatalog();
  const { lines, unavailable, total, count } = resolveCart(cart.items, catalog.shopProducts);
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const inFlight = useRef(false);
  const busy = phase.kind === 'working';
  const razorpayReady = isRazorpayAvailable();

  // Prices and availability are re-read whenever the cart opens.
  const refreshShop = catalog.refreshShop;
  useEffect(() => {
    void refreshShop();
  }, [refreshShop]);

  const label = (l: CartLine) => (l.variantLabel ? `${l.name} (${l.variantLabel})` : l.name);
  const names = (ls: CartLine[]) => ls.map((l) => (l.quantity > 1 ? `${label(l)} × ${l.quantity}` : label(l))).join(', ');

  async function pay(order: PreparedOrder, shown: CartLine[]) {
    if (!user) return;
    savePendingCheckout(user.id, {
      orderId: order.orderId,
      paymentId: order.paymentId,
      productId: 'shop',
      productName: names(shown),
      startedAt: order.createdAt,
      kind: 'shop',
    });
    setPhase({ kind: 'working', label: 'Waiting for the payment window' });
    const result = await payExistingOrder({
      orderId: order.orderId,
      paymentId: order.paymentId,
      amountDue: order.amountDue,
      currency: order.currency,
      description: `Order ${orderReference(order.orderId)}`,
      prefill: { name: user.user_metadata?.full_name, email: user.email },
      themeColor: theme.brand,
    });
    if (result.kind === 'unavailable') {
      setPhase({
        kind: 'notice',
        tone: 'error',
        title: 'Payment unavailable on this device',
        message: 'Payments need the CHR app installed from a build that includes Razorpay. Please update the app.',
      });
      return;
    }
    // The order now exists on the server, so the cart is done with: its status screen is the receipt,
    // and an unpaid order is paid from there (or My orders) — never re-ordered from a stale cart.
    cart.clear();
    const outcome =
      result.kind === 'completed'
        ? 'completed'
        : result.kind === 'failed'
          ? 'failed'
          : result.kind === 'cancelled' || result.kind === 'settled'
            ? 'cancelled'
            : 'unknown';
    router.replace({ pathname: '/store/order/[orderId]', params: { orderId: order.orderId, outcome } });
  }

  async function placeOrder() {
    if (inFlight.current || !user || lines.length === 0) return;
    inFlight.current = true;
    const shown = lines;
    const shownTotal = total;
    try {
      setPhase({ kind: 'working', label: 'Checking prices with the club' });
      const fresh = await catalog.refreshShop();
      if (!fresh) throw new CheckoutError('network', "We couldn't reach the club's servers.");
      const freshCart = resolveCart(cart.items, fresh);
      if (freshCart.unavailable.length > 0) {
        setPhase({
          kind: 'notice',
          tone: 'error',
          title: 'Some items are unavailable',
          message: `${freshCart.unavailable.map(unavailableMessage).join(' ')} Remove them or choose a different size to continue.`,
        });
        return;
      }
      const changed = priceChanges(shown, fresh);
      if (changed.length > 0) {
        setPhase({
          kind: 'notice',
          tone: 'info',
          title: 'Prices have changed',
          message: `${changed.map((c) => `${c.name}: ${formatINR(c.was)} → ${formatINR(c.now)}`).join('; ')}. Please review the new total before ordering.`,
        });
        return;
      }

      setPhase({ kind: 'working', label: 'Placing your order' });
      const order = await prepareCartOrder(
        shown.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        shownTotal
      );
      if (order.amountDue !== shownTotal || order.currency !== 'INR') {
        // Never charge an amount the customer hasn't seen.
        setPhase({ kind: 'confirm-amount', order, shownTotal });
        return;
      }
      await pay(order, shown);
    } catch (error) {
      const known = error instanceof CheckoutError ? error : new CheckoutError('unknown', 'Something went wrong. Please try again.');
      setPhase({
        kind: 'notice',
        tone: 'error',
        title: known.kind === 'network' ? "Couldn't reach the club" : known.kind === 'session' ? 'Session expired' : "Couldn't place your order",
        message:
          known.kind === 'network'
            ? `${known.message} If your order was placed, it will be found and reused when you try again — you won't be charged twice.`
            : known.message,
      });
      if (known.kind === 'unavailable') void catalog.refreshShop();
    } finally {
      inFlight.current = false;
    }
  }

  async function confirmAmount(order: PreparedOrder) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await pay(order, lines);
    } catch (error) {
      const known = error instanceof CheckoutError ? error : new CheckoutError('unknown', 'Something went wrong. Please try again.');
      setPhase({ kind: 'notice', tone: 'error', title: "Couldn't start payment", message: known.message });
    } finally {
      inFlight.current = false;
    }
  }

  if (cart.items.length === 0) {
    return (
      <ScreenContainer scroll={false} contentStyle={styles.centered}>
        <EmptyState
          title="Your order is empty"
          message="Add items from the Tack Shop to order them for collection in store."
          action={<PrimaryButton title="Back to store" onPress={() => router.dismissTo('/store')} />}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <SectionHeading eyebrow="Tack Shop" title="Your order" description="Collect in store at the club. There is no home delivery." />

      {catalog.status === 'loading' && lines.length === 0 ? <LoadingIndicator label="Checking prices" /> : null}

      <Card style={styles.card}>
        {lines.map((line) => (
          <View key={line.key} style={styles.line}>
            <View style={styles.lineTop}>
              {line.image ? (
                <ProductImage uri={photoUrl(line.image)} alt={line.name} style={styles.thumb} />
              ) : null}
              <View style={styles.flex}>
                <ThemedText variant="bodyStrong">{line.name}</ThemedText>
                {line.variantLabel ? (
                  <ThemedText variant="caption" themeColor="textSecondary">{`Size: ${line.variantLabel}`}</ThemedText>
                ) : null}
              </View>
              <ThemedText variant="bodyStrong" accessibilityLabel={spokenINR(line.lineTotal)}>
                {formatINR(line.lineTotal)}
              </ThemedText>
            </View>
            <View style={styles.lineBottom}>
              <ThemedText variant="caption" themeColor="textSecondary">
                {`${formatINR(line.unitPrice)} each`}
              </ThemedText>
              <QuantityStepper
                name={label(line)}
                quantity={line.quantity}
                disabled={busy}
                onChange={(next) => {
                  setPhase({ kind: 'review' });
                  cart.setQty(line.key, next);
                }}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          </View>
        ))}

        {unavailable.map((item) => (
          <View key={item.key} style={styles.lineTop}>
            <ThemedText themeColor="textSecondary" style={styles.flex}>
              {unavailableMessage(item)}
            </ThemedText>
            <Button variant="ghost" title="Remove" onPress={() => cart.remove(item.key)} />
          </View>
        ))}

        <View style={styles.lineTop} accessible accessibilityLabel={`Total shown in the store ${spokenINR(total)}, ${count} items`}>
          <ThemedText themeColor="textSecondary" style={styles.flex}>
            {`Total · ${count} ${count === 1 ? 'item' : 'items'}`}
          </ThemedText>
          <ThemedText variant="title">{formatINR(total)}</ThemedText>
        </View>
        <ThemedText variant="caption" themeColor="textSecondary">
          The club&apos;s system confirms the final amount when you place the order, and you pay exactly that amount in Indian
          rupees through Razorpay. No delivery or other charges are added.
        </ThemedText>
      </Card>

      <FormMessage tone="info" title="Collected in store">
        Tack Shop items are for collection at the club only. After payment, the club tells you when your order is ready
        to collect; you&apos;ll see its status in My orders.
      </FormMessage>

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

      {phase.kind === 'confirm-amount' ? (
        <FormMessage tone="info" title="Confirm the club's total">
          {`The club's system priced this order at ${formatINR(phase.order.amountDue)} (the store showed ${formatINR(
            phase.shownTotal
          )}). Order ${orderReference(phase.order.orderId)} is waiting — pay the club's amount or go back.`}
        </FormMessage>
      ) : null}

      {busy ? <LoadingIndicator label={phase.label} /> : null}

      <View style={styles.actions}>
        {phase.kind === 'confirm-amount' ? (
          <PrimaryButton
            title={`Pay ${formatINR(phase.order.amountDue)}`}
            accessibilityLabel={`Pay ${spokenINR(phase.order.amountDue)} with Razorpay`}
            fullWidth
            disabled={!razorpayReady}
            onPress={() => void confirmAmount(phase.order)}
          />
        ) : (
          <PrimaryButton
            title={`Place order · ${formatINR(total)}`}
            accessibilityLabel={`Place order and pay ${spokenINR(total)} with Razorpay`}
            accessibilityHint="The club confirms the amount, then the secure Razorpay payment window opens"
            fullWidth
            loading={busy}
            loadingLabel={phase.kind === 'working' ? phase.label : undefined}
            disabled={!razorpayReady || lines.length === 0 || unavailable.length > 0}
            onPress={() => void placeOrder()}
          />
        )}
        <Button variant="ghost" title="Keep shopping" disabled={busy} onPress={() => router.back()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.lg,
  },
  line: {
    gap: Spacing.sm,
  },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  lineBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: Spacing.sm,
  },
  flex: {
    flex: 1,
  },
  actions: {
    gap: Spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
});
