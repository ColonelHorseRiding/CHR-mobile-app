import { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

/**
 * Loading placeholders. They stand in for the *shape* of content that is being
 * fetched — never for fake values — and are hidden from screen readers; the
 * region that shows them announces "loading" once (see SkeletonRegion).
 */

/** One pulse shared by every skeleton on screen, so they breathe together and cost one animation. */
const pulse = new Animated.Value(0);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function startPulse() {
  if (users++ > 0) return;
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ])
  );
  loop.start();
}

function stopPulse() {
  if (--users > 0) return;
  loop?.stop();
  loop = null;
  pulse.setValue(0);
}

export type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height = 16, radius = Radii.sm, style }: SkeletonProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const color = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [theme.skeletonBase, theme.skeletonHighlight] }),
    [theme.skeletonBase, theme.skeletonHighlight]
  );

  useEffect(() => {
    if (reduced) return;
    startPulse();
    return stopPulse;
  }, [reduced]);

  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[{ width, height, borderRadius: radius, backgroundColor: reduced ? theme.skeletonBase : color }, style]}
    />
  );
}

/** Lines of text: the last one shorter, as real paragraphs end. */
export function SkeletonText({ lines = 1, lineHeight = 14, gap = Spacing.sm, lastWidth = '60%' }: { lines?: number; lineHeight?: number; gap?: number; lastWidth?: DimensionValue }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={lines > 1 && i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </View>
  );
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <Skeleton width={size} height={size} radius={size / 2} />;
}

/** A card-shaped block with the same border and padding as the real Card, holding any skeleton children. */
export function SkeletonCard({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>
      {children ?? (
        <>
          <Skeleton width="40%" height={12} />
          <SkeletonText lines={2} />
        </>
      )}
    </View>
  );
}

/**
 * Wraps one loading section: announced once as busy, and its shapes are
 * invisible to screen readers. `label` says what is loading.
 */
export function SkeletonRegion({ label, children, style }: { label: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={[styles.region, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: Spacing.lg, gap: Spacing.md },
  region: { gap: Spacing.md },
});
