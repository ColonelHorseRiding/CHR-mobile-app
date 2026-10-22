import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { Radii, Shadows, Spacing } from '@/theme';

/** The club's gold call-to-action: calendar, label, chevron. It only navigates; it never changes any record. */
export function GoldButton({
  title,
  onPress,
  hint,
  icon = { ios: 'calendar', android: 'event', web: 'event' },
}: {
  title: string;
  onPress: () => void;
  hint?: string;
  icon?: { ios: 'calendar' | 'bag'; android: string; web: string };
}) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: theme.ctaBackground, opacity: pressed ? 0.88 : 1, boxShadow: scheme === 'light' ? Shadows.md : Shadows.none }]}>
      <View style={styles.row}>
        <SymbolView name={icon as never} size={24} tintColor={theme.ctaText} resizeMode="scaleAspectFit" style={styles.icon} />
        <ThemedText variant="heading" style={[styles.label, { color: theme.ctaText }]}>
          {title}
        </ThemedText>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={24}
          tintColor={theme.ctaText}
          resizeMode="scaleAspectFit"
          style={styles.icon}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 64,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  icon: {
    width: 24,
    height: 24,
  },
  label: {
    flex: 1,
    fontSize: 19,
    lineHeight: 24,
  },
});
