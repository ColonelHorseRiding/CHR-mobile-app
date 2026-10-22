import { type ReactElement, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { Layout, Spacing } from '@/theme';

export type ScreenContainerProps = {
  children: ReactNode;
  /** Set to false for screens that manage their own scrolling (e.g. lists). */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Optional pull-to-refresh control for scrolling screens. */
  refreshControl?: ReactElement<RefreshControlProps>;
};

/**
 * Standard screen wrapper for routes rendered inside a tab's Stack.
 * - The Stack header handles the top inset; native tabs handle the bottom inset.
 * - Left/right insets are applied here (landscape / display cutouts).
 * - Content is centred and capped at a readable width on tablets.
 * - The ScrollView is the screen's first child so native tab scroll-to-top keeps working.
 */
export function ScreenContainer({ children, scroll = true, contentStyle, refreshControl }: ScreenContainerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingLeft: Layout.gutter + insets.left,
    paddingRight: Layout.gutter + insets.right,
  };

  if (!scroll) {
    return (
      <View style={[styles.flex, padding, { backgroundColor: theme.background }]}>
        <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.scrollContent, padding]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={refreshControl}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxContentWidth,
    alignSelf: 'center',
    gap: Spacing.xl,
  },
});
