import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import { variantLabel, type TackVariant } from '../tack-details';

/** The sizes (and colours) the club sells a product in. Out-of-stock ones are shown but cannot be chosen. */
export function SizePicker({
  variants,
  value,
  onChange,
  disabled = false,
}: {
  variants: TackVariant[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Size">
      {variants.map((v) => {
        const selected = v.id === value;
        const off = !v.inStock || disabled;
        return (
          <Pressable
            key={v.id}
            accessibilityRole="radio"
            accessibilityLabel={`${variantLabel(v)}${v.inStock ? '' : ', out of stock'}`}
            accessibilityState={{ selected, disabled: off }}
            disabled={off}
            onPress={() => onChange(v.id)}
            style={[
              styles.chip,
              { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : theme.surface },
              !v.inStock && styles.out,
            ]}>
            <ThemedText
              variant="label"
              style={{ color: selected ? theme.onPrimary : theme.text, textDecorationLine: v.inStock ? 'none' : 'line-through' }}>
              {variantLabel(v)}
            </ThemedText>
            {!v.inStock ? (
              <ThemedText variant="caption" themeColor="textSecondary">
                Out of stock
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    minWidth: 56,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  out: { opacity: 0.55 },
});
