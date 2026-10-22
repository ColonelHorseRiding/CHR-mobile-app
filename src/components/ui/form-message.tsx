import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

export type FormMessageProps = {
  tone: 'error' | 'success' | 'info';
  title?: string;
  children: ReactNode;
  /** Optional follow-up control, e.g. a "resend" button. */
  action?: ReactNode;
};

/** Form-level status banner, announced to screen readers when it appears. */
export function FormMessage({ tone, title, children, action }: FormMessageProps) {
  const theme = useTheme();
  const palette = {
    error: { text: 'danger', surface: 'dangerSurface', border: 'danger' },
    success: { text: 'success', surface: 'successSurface', border: 'success' },
    info: { text: 'text', surface: 'surfaceMuted', border: 'borderStrong' },
  } as const;
  const colors = palette[tone];

  return (
    <View
      accessible={!action}
      accessibilityRole={tone === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={[
        styles.container,
        { backgroundColor: theme[colors.surface], borderLeftColor: theme[colors.border] },
      ]}>
      {title ? (
        <ThemedText variant="bodyStrong" themeColor={colors.text}>
          {title}
        </ThemedText>
      ) : null}
      <ThemedText variant="caption" themeColor={colors.text}>
        {children}
      </ThemedText>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.sm,
    borderLeftWidth: 3,
  },
  action: {
    marginTop: Spacing.xs,
    alignItems: 'flex-start',
  },
});
