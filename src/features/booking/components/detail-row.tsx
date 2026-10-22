import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme';

/** Label on the left, value (and optional note) on the right, read as one line by screen readers. */
export function DetailRow({ label, value, note, children }: { label: string; value?: string; note?: string; children?: ReactNode }) {
  return (
    <View
      style={styles.row}
      accessible={!children}
      accessibilityLabel={children ? undefined : `${label}: ${value ?? ''}${note ? `, ${note}` : ''}`}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <View style={styles.value}>
        {value !== undefined ? (
          <ThemedText variant="bodyStrong" style={styles.right}>
            {value}
          </ThemedText>
        ) : null}
        {children}
        {note ? (
          <ThemedText variant="caption" themeColor="textSecondary" style={styles.right}>
            {note}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.lg,
  },
  value: {
    flexShrink: 1,
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  right: {
    textAlign: 'right',
  },
});
