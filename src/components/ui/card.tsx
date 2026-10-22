import { StyleSheet, View, type ViewProps } from 'react-native';

import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { Radii, Shadows, Spacing } from '@/theme';

export type CardProps = ViewProps & {
  /** `brand` renders the forest-green panel used for hero content. */
  tone?: 'default' | 'brand';
};

export function Card({ tone = 'default', style, ...rest }: CardProps) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const isBrand = tone === 'brand';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isBrand ? theme.brand : theme.surface,
          borderColor: isBrand ? theme.brand : theme.border,
          // Shadows read poorly on dark backgrounds; rely on the border there.
          boxShadow: scheme === 'light' ? Shadows.sm : Shadows.none,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
});
