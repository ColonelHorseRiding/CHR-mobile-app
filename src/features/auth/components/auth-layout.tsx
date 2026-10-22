import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChrLogo } from '@/components/brand/chr-logo';
import { ThemedText } from '@/components/themed-text';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { Layout, Spacing } from '@/theme';

export type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  /**
   * `brand`: full-bleed forest-green panel with the club emblem (used where there is
   * no navigation header). `plain`: heading only, below the native Stack header.
   */
  hero?: 'brand' | 'plain';
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ title, subtitle, hero = 'plain', children, footer }: AuthLayoutProps) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const insets = useSafeAreaInsets();
  const isBrand = hero === 'brand';

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      {/* Each auth screen sets its own style: the topmost mounted one wins in a stack. */}
      <StatusBar style={isBrand || scheme === 'dark' ? 'light' : 'dark'} />
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xxl }]}
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior={isBrand ? 'never' : 'automatic'}>
        {isBrand ? (
          <View style={[styles.brandPanel, { backgroundColor: theme.brand, paddingTop: insets.top + Spacing.xxl }]}>
            <ChrLogo size={112} />
            <ThemedText variant="eyebrow" themeColor="brandAccent" style={styles.center}>
              Colonel Horse Riding Club
            </ThemedText>
            <View style={[styles.rule, { backgroundColor: theme.brandAccent }]} />
          </View>
        ) : null}

        <View
          style={[
            styles.body,
            { paddingLeft: Layout.gutter + insets.left, paddingRight: Layout.gutter + insets.right },
          ]}>
          <View style={styles.content}>
            <View style={styles.heading}>
              <ThemedText variant="display" accessibilityRole="header">
                {title}
              </ThemedText>
              {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
            </View>
            {children}
          </View>
          {footer ? <View style={[styles.content, styles.footer]}>{footer}</View> : null}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  brandPanel: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
    paddingHorizontal: Layout.gutter,
  },
  rule: {
    width: 40,
    height: 1,
    opacity: 0.8,
  },
  body: {
    flexGrow: 1,
    paddingTop: Spacing.xxl,
    justifyContent: 'space-between',
    gap: Spacing.xxl,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: Spacing.xl,
  },
  heading: {
    gap: Spacing.sm,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
});
