import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Layout, Radii, Spacing } from '@/theme';

import { MAX_QUANTITY } from '../cart';

/** − n + control. Decreasing from 1 removes the item (the caller decides what 0 means). */
export function QuantityStepper({
  name,
  quantity,
  onChange,
  disabled = false,
}: {
  name: string;
  quantity: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const atMax = quantity >= MAX_QUANTITY;

  const button = (label: string, a11y: string, next: number, off: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={() => onChange(next)}
      hitSlop={4}
      style={({ pressed }) => [
        styles.step,
        { borderColor: theme.borderStrong, backgroundColor: pressed ? theme.surfaceMuted : theme.surface, opacity: off ? 0.4 : 1 },
      ]}>
      <ThemedText variant="heading" themeColor="primary">
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <View style={styles.row} accessible={false}>
      {button('−', quantity === 1 ? `Remove ${name}` : `One fewer ${name}`, quantity - 1, disabled)}
      <ThemedText
        variant="bodyStrong"
        style={styles.value}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${quantity} ${name} in your order`}>
        {String(quantity)}
      </ThemedText>
      {button('+', `One more ${name}`, quantity + 1, disabled || atMax)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  step: {
    width: Layout.minTouchTarget,
    height: Layout.minTouchTarget,
    borderRadius: Radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 28,
    textAlign: 'center',
  },
});
