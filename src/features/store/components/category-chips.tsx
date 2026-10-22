import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

/** Scrollable category filter for the Tack Shop: "All" first, then the categories the club has enabled. */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: { slug: string; name: string }[];
  value: string | null;
  onChange: (slug: string | null) => void;
}) {
  const theme = useTheme();
  const all = [{ slug: null as string | null, name: 'All products' }, ...categories];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
      {all.map((c) => {
        const active = c.slug === value;
        return (
          <Pressable
            key={c.slug ?? 'all'}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={c.slug === null ? 'All products' : c.name}
            onPress={() => onChange(c.slug)}
            style={[
              styles.chip,
              { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.surface },
            ]}>
            <ThemedText variant="label" style={{ color: active ? theme.onPrimary : theme.text }}>
              {c.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  chip: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
