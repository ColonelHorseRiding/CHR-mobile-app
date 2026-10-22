import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { OrderCardsSkeleton } from '@/components/ui/screen-skeletons';
import { usePullRefresh } from '@/components/ui/pull-refresh';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { CategoryTabs } from '@/features/store/components/category-tabs';
import { formatINR, spokenINR } from '@/features/store/format';
import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { Radii, Shadows, Spacing } from '@/theme';

import { collectionLabel, itemsLine, paymentLabel, type LabelTone } from './order-labels';
import type { OrderFilter, OrderSummary } from './orders-api';
import { useOrders } from './use-orders';

const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'closed', label: 'Closed' },
];

const EMPTY: Record<OrderFilter, string> = {
  all: 'When you buy a membership or shop items, your orders appear here.',
  unpaid: 'You have no orders waiting for payment.',
  paid: 'You have no paid orders yet.',
  closed: 'You have no cancelled or failed orders.',
};

const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateIST(iso: string) {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * The customer's orders: memberships and shop orders, with payment and (for
 * in-store items) collection shown separately, exactly as the server records
 * them. Each order opens its live status screen.
 */
export default function OrdersScreen() {
  const [filter, setFilter] = useState<OrderFilter>('all');
  const orders = useOrders(filter);
  const refreshControl = usePullRefresh(orders.refresh);


  return (
    <ScreenContainer
      refreshControl={refreshControl}>
      <SectionHeading
        eyebrow="My orders"
        title="Your orders"
        description="Tack and café items are collected in store; the club records when they're ready and collected."
      />

      <CategoryTabs tabs={FILTERS} value={filter} onChange={setFilter} />

      {orders.error && orders.items ? (
        <FormMessage
          tone="error"
          title="Couldn't refresh"
          action={<SecondaryButton title="Try again" loading={orders.loading} onPress={() => void orders.refresh()} />}>
          {`${orders.error.message} The list below may be out of date.`}
        </FormMessage>
      ) : null}

      {!orders.items && orders.loading ? <OrderCardsSkeleton /> : null}

      {!orders.items && !orders.loading && orders.error ? (
        <EmptyState
          title="We couldn't load your orders"
          message={`${orders.error.message} Check your connection and try again.`}
          action={<PrimaryButton title="Try again" onPress={() => void orders.refresh()} />}
        />
      ) : null}

      {orders.items && orders.items.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? "You haven't placed any orders yet." : 'No orders here'}
          message={EMPTY[filter]}
          action={filter === 'all' ? <PrimaryButton title="Visit the Store" onPress={() => router.dismissTo('/store')} /> : undefined}
        />
      ) : null}

      {orders.items && orders.items.length > 0 ? (
        <View style={styles.list}>
          {orders.items.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </View>
      ) : null}

      {orders.items && orders.hasMore ? (
        <SecondaryButton title="Show more" fullWidth loading={orders.loading} onPress={() => void orders.loadMore()} />
      ) : null}
    </ScreenContainer>
  );
}

function Pill({ label, tone }: { label: string; tone: LabelTone }) {
  const theme = useTheme();
  const color = { good: theme.success, neutral: theme.text, attention: theme.danger, muted: theme.textSecondary }[tone];
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText variant="caption" style={{ color }} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

function OrderRow({ order: o }: { order: OrderSummary }) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const pay = paymentLabel(o);
  const collect = collectionLabel(o);
  const items = itemsLine(o);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${o.reference}, ${dateIST(o.createdAt)}, ${items}, ${spokenINR(o.total)}, payment ${pay.label}${
        collect ? `, ${collect.label}` : ''
      }`}
      accessibilityHint="Opens the order's details and status"
      onPress={() => router.push({ pathname: '/store/order/[orderId]', params: { orderId: o.id, from: 'orders' } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.surfaceMuted : theme.surface,
          borderColor: theme.border,
          boxShadow: scheme === 'light' ? Shadows.sm : Shadows.none,
        },
      ]}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <ThemedText variant="bodyStrong">{o.reference}</ThemedText>
          <ThemedText variant="caption" themeColor="textSecondary">
            {`Placed ${dateIST(o.createdAt)}`}
          </ThemedText>
        </View>
        <ThemedText variant="heading">{formatINR(o.total)}</ThemedText>
      </View>
      <ThemedText numberOfLines={2}>{items}</ThemedText>
      <View style={styles.pills}>
        <Pill label={pay.label} tone={pay.tone} />
        {collect ? <Pill label={collect.label} tone={collect.tone} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.md,
  },
  row: {
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  flex: {
    flex: 1,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
