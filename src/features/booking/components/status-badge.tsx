import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import type { Tone } from '../class-status';

/** A small outlined pill for a class's recorded status. */
export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  const theme = useTheme();
  const color = {
    good: theme.success,
    neutral: theme.text,
    attention: theme.danger,
    muted: theme.textSecondary,
  }[tone];

  return (
    <View style={[styles.badge, { borderColor: color }]} accessible accessibilityLabel={`Status: ${label}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText variant="caption" style={{ color }} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
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
