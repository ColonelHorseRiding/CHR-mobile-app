import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

export type LoadingIndicatorProps = {
  label?: string;
  /** Fill the available space and centre the spinner. */
  fill?: boolean;
};

export function LoadingIndicator({ label = 'Loading', fill = false }: LoadingIndicatorProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.container, fill && styles.fill]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}>
      <ActivityIndicator size="large" color={theme.primary} />
      {label ? (
        <ThemedText variant="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  fill: {
    flex: 1,
  },
});
