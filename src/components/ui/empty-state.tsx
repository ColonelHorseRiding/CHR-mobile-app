import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

export type EmptyStateProps = {
  title: string;
  message?: string;
  /** Optional icon or illustration rendered above the title. */
  icon?: ReactNode;
  /** Optional call to action, typically a Button. */
  action?: ReactNode;
};

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      {icon ? <View style={[styles.icon, { backgroundColor: theme.surfaceMuted }]}>{icon}</View> : null}
      <ThemedText variant="heading" style={styles.center} accessibilityRole="header">
        {title}
      </ThemedText>
      {message ? (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {message}
        </ThemedText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  center: {
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
});
