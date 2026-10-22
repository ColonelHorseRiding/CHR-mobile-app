import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ClassCardsSkeleton } from '@/components/ui/screen-skeletons';
import { usePullRefresh } from '@/components/ui/pull-refresh';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { Radii, Shadows, Spacing } from '@/theme';

import { describeClass } from './class-status';
import { StatusBadge } from './components/status-badge';
import type { ClassRecord } from './my-classes-api';
import { dayChip, formatDayShort, formatTimeRange } from './schedule-format';
import { useMyClasses, type ListKey } from './use-my-classes';

const TABS: { key: ListKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

const EMPTY: Record<ListKey, { title: string; message: string }> = {
  upcoming: { title: 'No upcoming classes yet.', message: 'Classes you book will appear here.' },
  past: { title: 'No past classes yet', message: 'Classes appear here after they take place, with the attendance the club records.' },
  cancelled: { title: 'No cancelled classes', message: 'Any class you cancel will appear here.' },
};

/**
 * The member's own classes: what's booked, what has happened (with the
 * attendance staff recorded), and what was cancelled. Read-only list; each
 * class opens its own detail, where it can be moved or cancelled.
 */
export default function MyClassesScreen() {
  const theme = useTheme();
  const { lists, refresh, retry, loadMore } = useMyClasses();
  const [tab, setTab] = useState<ListKey>('upcoming');
  const refreshControl = usePullRefresh(refresh);
  const list = lists[tab];


  return (
    <ScreenContainer
      refreshControl={refreshControl}>
      <SectionHeading
        eyebrow="My classes"
        title="Your classes"
        description="Attendance is recorded by the club after each class."
      />

      <View style={[styles.tabs, { backgroundColor: theme.surfaceMuted }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = t.key === tab;
          const count = t.key === 'upcoming' ? lists.upcoming.items?.length : undefined;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText variant="label" style={{ color: active ? theme.primary : theme.textSecondary }} numberOfLines={1}>
                {count ? `${t.label} (${count})` : t.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {list.error && list.items ? (
        <FormMessage
          tone="error"
          title="Couldn't refresh"
          action={<SecondaryButton title="Try again" loading={list.loading} onPress={() => void retry(tab)} />}>
          {`${list.error.message} The list below may be out of date.`}
        </FormMessage>
      ) : null}

      {!list.items && list.loading ? <ClassCardsSkeleton /> : null}

      {!list.items && !list.loading && list.error ? (
        <EmptyState
          title="We couldn't load your classes"
          message={`${list.error.message} Check your connection and try again.`}
          action={<PrimaryButton title="Try again" onPress={() => void retry(tab)} />}
        />
      ) : null}

      {list.items && list.items.length === 0 ? (
        <EmptyState
          title={EMPTY[tab].title}
          message={EMPTY[tab].message}
          action={tab === 'upcoming' ? <PrimaryButton title="Book a class" onPress={() => router.navigate('/book')} /> : undefined}
        />
      ) : null}

      {list.items && list.items.length > 0 ? (
        <View style={styles.list}>
          {list.items.map((r) => (
            <ClassRow key={r.id} record={r} />
          ))}
        </View>
      ) : null}

      {list.items && list.hasMore ? (
        <SecondaryButton title="Show more" fullWidth loading={list.loading} onPress={() => void loadMore(tab)} />
      ) : null}
    </ScreenContainer>
  );
}

function ClassRow({ record: r }: { record: ClassRecord }) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const chip = dayChip(r.date);
  const status = describeClass(r);
  const time = formatTimeRange(r.startTime, r.endTime);
  const movedFrom = r.movedFrom ? `Moved from ${formatDayShort(r.movedFrom.date)}, ${formatTimeRange(r.movedFrom.startTime, r.movedFrom.endTime)}` : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatDayShort(r.date)}, ${time}, ${status.label}${status.note ? `, ${status.note}` : ''}${movedFrom ? `, ${movedFrom}` : ''}`}
      accessibilityHint="Opens the class details"
      onPress={() => router.push({ pathname: '/book/classes/[bookingId]', params: { bookingId: r.id } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.surfaceMuted : theme.surface,
          borderColor: theme.border,
          boxShadow: scheme === 'light' ? Shadows.sm : Shadows.none,
        },
      ]}>
      <View style={[styles.tile, { backgroundColor: theme.surfaceMuted }]}>
        <ThemedText variant="heading" themeColor="primary">
          {chip.day}
        </ThemedText>
        <ThemedText variant="caption" themeColor="textSecondary" style={styles.tileMonth}>
          {chip.month}
        </ThemedText>
      </View>
      <View style={styles.body}>
        <ThemedText variant="bodyStrong">{`${chip.weekday} · ${time}`}</ThemedText>
        <StatusBadge label={status.label} tone={status.tone} />
        {status.note ? (
          <ThemedText variant="caption" themeColor="textSecondary">
            {status.note}
          </ThemedText>
        ) : null}
        {movedFrom ? (
          <ThemedText variant="caption" themeColor="textSecondary">
            {movedFrom}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText variant="heading" themeColor="textSecondary" importantForAccessibility="no">
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    borderRadius: Radii.pill,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.xs,
  },
  list: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
  },
  tile: {
    width: 56,
    height: 64,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMonth: {
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    flex: 1,
    gap: Spacing.xs,
  },
});
