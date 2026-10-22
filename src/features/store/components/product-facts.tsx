import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import type { StoreProduct } from '../catalog';
import { productFacts } from '../presentation';

/** Classes · validity · reschedules as three compact columns, read out as one sentence. */
export function ProductFacts({ product }: { product: StoreProduct }) {
  const theme = useTheme();
  const facts = productFacts(product);

  return (
    <View
      accessible
      accessibilityLabel={facts.map((fact) => fact.sentence).join(', ')}
      style={[styles.row, { backgroundColor: theme.surfaceMuted }]}>
      {facts.map((fact, index) => (
        <View
          key={fact.key}
          style={[styles.cell, index > 0 && { borderLeftColor: theme.border, borderLeftWidth: StyleSheet.hairlineWidth }]}>
          <ThemedText variant="heading" style={styles.center}>
            {fact.value}
          </ThemedText>
          <ThemedText variant="caption" themeColor="textSecondary" style={styles.center} numberOfLines={2}>
            {fact.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    gap: Spacing.xxs,
  },
  center: {
    textAlign: 'center',
  },
});
