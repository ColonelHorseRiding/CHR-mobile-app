import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ActivityRowsSkeleton } from '@/components/ui/screen-skeletons';
import { usePullRefresh } from '@/components/ui/pull-refresh';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { Radii, Shadows, Spacing } from '@/theme';

import { categoryOf, destinationFor, whenIST } from './notification-routes';
import type { AppNotification } from './notifications-api';
import { useNotifications } from './use-notifications';

/**
 * The member's notification centre: the same records the website's bell
 * shows. Opening one marks it read on the server; "Mark all as read" does the
 * same for every unread one. Read state is shown only once the server confirms.
 */
export default function NotificationsScreen() {
  const n = useNotifications();
  const refreshControl = usePullRefresh(n.refresh);
  const [markError, setMarkError] = useState<string | null>(null);
  const unread = n.items?.filter((x) => !x.readAt).length ?? 0;


  async function open(item: AppNotification) {
    setMarkError(null);
    const destination = destinationFor(item);
    if (!item.readAt) {
      // Not awaited before navigating: the read state updates only when the server confirms.
      void n.markAsRead([item.id]).then((r) => {
        if (!r.ok) setMarkError("We couldn't mark that notification as read. It's still shown as unread.");
      });
    }
    if (destination) router.push(destination.href);
  }

  async function markAll() {
    setMarkError(null);
    const r = await n.markAsRead(null);
    if (!r.ok) setMarkError("We couldn't mark your notifications as read. Please try again.");
  }

  return (
    <ScreenContainer
      refreshControl={refreshControl}>
      <SectionHeading
        eyebrow="Notifications"
        title="Club updates"
        description="Bookings, payments, orders and membership updates from the club."
      />

      {unread > 0 ? (
        <View style={styles.toolbar}>
          <ThemedText themeColor="textSecondary" style={styles.flex}>
            {`${unread} unread`}
          </ThemedText>
          <Button variant="ghost" title="Mark all as read" loading={n.marking === 'all'} onPress={() => void markAll()} />
        </View>
      ) : null}

      {markError ? <FormMessage tone="error">{markError}</FormMessage> : null}

      {n.error && n.items ? (
        <FormMessage
          tone="error"
          title="Couldn't refresh"
          action={<SecondaryButton title="Try again" loading={n.loading} onPress={() => void n.refresh()} />}>
          {`${n.error.message} The list below may be out of date.`}
        </FormMessage>
      ) : null}

      {!n.items && n.loading ? <ActivityRowsSkeleton label="Loading notifications" /> : null}

      {!n.items && !n.loading && n.error ? (
        <EmptyState
          title="We couldn't load your notifications"
          message={n.error.kind === 'session' ? n.error.message : `${n.error.message} Check your connection and try again.`}
          action={<PrimaryButton title="Try again" onPress={() => void n.refresh()} />}
        />
      ) : null}

      {n.items && n.items.length === 0 ? (
        <EmptyState title="No notifications yet" message="Updates about your bookings, payments and orders will appear here." />
      ) : null}

      {n.items && n.items.length > 0 ? (
        <View style={styles.list}>
          {n.items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              marking={n.marking === 'all' || (n.marking instanceof Set && n.marking.has(item.id))}
              onPress={() => void open(item)}
            />
          ))}
        </View>
      ) : null}

      {n.items && n.hasMore ? (
        <SecondaryButton title="Show more" fullWidth loading={n.loading} onPress={() => void n.loadMore()} />
      ) : null}
    </ScreenContainer>
  );
}

function NotificationRow({ item, marking, onPress }: { item: AppNotification; marking: boolean; onPress: () => void }) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const unread = !item.readAt;
  const destination = destinationFor(item);
  const category = categoryOf(item.type);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${category}. ${item.title}. ${item.body ?? ''} ${whenIST(item.createdAt)}`}
      accessibilityHint={destination ? `${destination.label}` : unread ? 'Marks it as read' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.surfaceMuted : theme.surface,
          borderColor: unread ? theme.secondary : theme.border,
          boxShadow: scheme === 'light' ? Shadows.sm : Shadows.none,
        },
      ]}>
      <View style={[styles.dot, { backgroundColor: unread ? theme.secondary : 'transparent' }]} />
      <View style={styles.body}>
        <View style={styles.meta}>
          <ThemedText variant="eyebrow" themeColor="accentText">
            {category}
          </ThemedText>
          <ThemedText variant="caption" themeColor="textSecondary">
            {whenIST(item.createdAt)}
          </ThemedText>
        </View>
        <ThemedText variant={unread ? 'bodyStrong' : 'body'}>{item.title}</ThemedText>
        {item.body ? (
          <ThemedText variant="caption" themeColor="textSecondary">
            {item.body}
          </ThemedText>
        ) : null}
        {destination || marking ? (
          <ThemedText variant="caption" themeColor="primary">
            {marking ? 'Marking as read…' : `${destination?.label} ›`}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  flex: {
    flex: 1,
  },
  list: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: Spacing.sm,
  },
  body: {
    flex: 1,
    gap: Spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
