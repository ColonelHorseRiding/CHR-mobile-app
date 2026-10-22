import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

export type SectionHeadingProps = {
  title: string;
  eyebrow?: string;
  description?: string;
};

export function SectionHeading({ title, eyebrow, description }: SectionHeadingProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {eyebrow ? (
        <ThemedText variant="eyebrow" themeColor="accentText">
          {eyebrow}
        </ThemedText>
      ) : null}
      <ThemedText variant="heading" accessibilityRole="header">
        {title}
      </ThemedText>
      <View style={[styles.rule, { backgroundColor: theme.secondary }]} />
      {description ? (
        <ThemedText variant="caption" themeColor="textSecondary">
          {description}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  rule: {
    width: 32,
    height: 2,
    borderRadius: 1,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
});
