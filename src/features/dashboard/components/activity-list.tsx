import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import { describeActivity, formatActivityTime } from '../activity-presentation';
import type { ActivityItem } from '../dashboard-data';

/**
 * Recent account activity as a quiet timeline: one row per server record,
 * newest first. A row with an existing destination (a class or an order) opens
 * it; others are plain text.
 */
export function ActivityList({ items }: { items: ActivityItem[] }) {
  const theme = useTheme();

  if (items.length === 0) {
    return (
      <Card style={styles.empty}>
        <ThemedText variant="bodyStrong">Your activity will appear here.</ThemedText>
        <ThemedText variant="caption" themeColor="textSecondary">
          Bookings, membership updates and credits show up as they happen.
        </ThemedText>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      {items.map((item, index) => {
        const view = describeActivity(item);
        const when = formatActivityTime(item.at);
        const change = view.credits;
        const credits = change === null ? null : `${change > 0 ? '+' : '−'}${Math.abs(change)}`;
        const spokenCredits = change === null ? null : `${change > 0 ? 'plus' : 'minus'} ${Math.abs(change)}`;
        const label = [view.title, view.detail, spokenCredits, when].filter(Boolean).join(', ');
        const href = view.href;

        return (
          <Pressable
            key={item.id}
            disabled={!href}
            onPress={href ? () => router.push(href) : undefined}
            accessible
            accessibilityRole={href ? 'button' : 'text'}
            accessibilityLabel={label}
            accessibilityHint={href ? 'Opens the details' : undefined}
            style={({ pressed }) => [
              styles.row,
              index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
              pressed && href ? { backgroundColor: theme.surfaceMuted } : null,
            ]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.surfaceMuted }]}>
              <SymbolView name={view.icon} size={20} tintColor={theme.primary} resizeMode="scaleAspectFit" style={styles.icon} />
            </View>

            <View style={styles.text}>
              <ThemedText variant="bodyStrong" numberOfLines={1}>
                {view.title}
              </ThemedText>
              {view.detail ? (
                <ThemedText variant="caption" themeColor="textSecondary" numberOfLines={2}>
                  {view.detail}
                </ThemedText>
              ) : null}
              <ThemedText variant="caption" themeColor="textSecondary" style={styles.time}>
                {when}
              </ThemedText>
            </View>

            {credits || href ? (
              <View style={styles.trailing}>
                {credits && change !== null ? (
                  // A deduction for a booking is normal, so it stays neutral rather than looking like an error.
                  <ThemedText variant="caption" style={[styles.credits, { color: change > 0 ? theme.success : theme.textSecondary }]}>
                    {credits}
                  </ThemedText>
                ) : null}
                {href ? (
                  <SymbolView
                    name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                    size={20}
                    tintColor={theme.textSecondary}
                    resizeMode="scaleAspectFit"
                    style={styles.chevron}
                  />
                ) : (
                  // Keeps credit figures aligned with rows that have a chevron.
                  <View style={styles.chevron} />
                )}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 0,
    paddingVertical: Spacing.xs,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  empty: {
    gap: Spacing.xs,
    paddingVertical: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 64,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 20,
    height: 20,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  time: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.85,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  credits: {
    fontWeight: '600',
  },
  chevron: {
    width: 20,
    height: 20,
  },
});
