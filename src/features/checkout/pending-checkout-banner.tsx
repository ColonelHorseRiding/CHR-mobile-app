import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { useAuth } from '@/features/auth/auth-provider';
import { Spacing } from '@/theme';

import { fetchOrderStatus, isUnresolved, type OrderState } from './order-status';
import { clearPendingCheckout, readPendingCheckout, type PendingCheckout } from './pending-checkout';

type Shown = { checkout: PendingCheckout; state: OrderState | 'unknown' };

/**
 * Recovery entry point for a checkout interrupted on this device (app closed,
 * callback lost, connection dropped). While the server still has it unsettled
 * it links to the status screen; once settled, it reports the outcome once —
 * so a payment confirmed while the app was closed is never silently dropped.
 */
export function PendingCheckoutBanner({ from = 'store' }: { from?: 'store' | 'home' } = {}) {
  const { user } = useAuth();
  const [shown, setShown] = useState<Shown | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const saved = readPendingCheckout(user.id);
      if (!saved) {
        setShown(null);
        return;
      }
      let live = true;
      fetchOrderStatus(saved.orderId)
        .then((status) => {
          if (!live) return;
          if (!status) {
            clearPendingCheckout(user.id, saved.orderId);
            setShown(null);
          } else {
            setShown({ checkout: saved, state: status.state });
          }
        })
        // Offline: keep offering the status screen rather than hiding an unsettled payment.
        .catch(() => live && setShown({ checkout: saved, state: 'unknown' }));
      return () => {
        live = false;
      };
    }, [user])
  );

  if (!shown || !user) return null;
  const { checkout, state } = shown;

  const viewStatus = () => {
    // The status screen clears the record once it has shown a settled order.
    // Opened in the current tab's stack so Back returns here.
    if (from === 'home') router.push({ pathname: '/order/[orderId]', params: { orderId: checkout.orderId, from: 'orders' } });
    else router.push({ pathname: '/store/order/[orderId]', params: { orderId: checkout.orderId } });
  };
  const dismiss = () => {
    clearPendingCheckout(user.id, checkout.orderId);
    setShown(null);
  };

  const unresolved = state === 'unknown' || isUnresolved(state);
  const copy = unresolved
    ? {
        tone: 'info' as const,
        title: 'You have an unfinished checkout',
        body: `Your order for ${checkout.productName} hasn't been settled yet.`,
      }
    : state === 'fulfilled'
      ? {
          tone: 'success' as const,
          title: 'Payment confirmed',
          body:
            checkout.kind === 'shop'
              ? `Your payment for ${checkout.productName} was confirmed. The club will tell you when it's ready to collect.`
              : `Your payment for ${checkout.productName} was confirmed and your plan is active.`,
        }
      : {
          tone: 'info' as const,
          title: 'Your earlier checkout has an update',
          body: `There's news about your order for ${checkout.productName}.`,
        };

  return (
    <FormMessage
      tone={copy.tone}
      title={copy.title}
      action={
        <View style={styles.actions}>
          <Button variant="ghost" title={unresolved ? 'View order status' : 'View details'} onPress={viewStatus} />
          {!unresolved ? <Button variant="ghost" title="Dismiss" onPress={dismiss} /> : null}
        </View>
      }>
      {copy.body}
    </FormMessage>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
