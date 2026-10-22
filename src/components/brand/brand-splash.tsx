import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { SplashColors } from '@/theme';

import { ArcText } from './arc-text';
import { layoutArc } from './arc-text-layout';

export const SPLASH_NAME = 'COLONEL HORSE RIDING CLUB';
const SPAN_DEG = 150;
const ARC = { letterSpacingEm: 0.14, gapEm: 0.3 };
const FADE_IN_MS = 500;
const FADE_OUT_MS = 240;

/**
 * Sizes the emblem for the screen: as large as comfortably fits while keeping
 * the curved name clear of the status bar and the screen edges.
 */
export function fitEmblem(width: number, height: number, top: number, bottom: number) {
  const usable = height - top - bottom;
  // Centred on the screen, like the native launch screen, so the handoff does not jump.
  const centerY = top + usable / 2;
  let logo = Math.min(Math.max(Math.min(width * 0.54, height * 0.3), 120), 280);
  for (let i = 0; i < 12; i++) {
    const { fontSize, radius } = layoutArc(SPLASH_NAME, { innerRadius: logo / 2, spanDeg: SPAN_DEG, ...ARC });
    const topEdge = centerY - radius - fontSize;
    const sideEdge = (width - 2 * radius * Math.sin((SPAN_DEG / 2) * (Math.PI / 180))) / 2 - fontSize;
    if (topEdge >= top + 16 && sideEdge >= 16) break;
    logo *= 0.94;
  }
  return { logo, centerY };
}

/**
 * The in-app launch screen: deep forest green, the club's landscape low and
 * quiet, the official emblem in the middle and the club's name curving over
 * it in champagne gold. It only draws; the caller decides when it is shown.
 * `onShown` fires once it is on screen (the native splash can go then).
 */
export function BrandSplash({ visible, onShown }: { visible: boolean; onShown: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(true);
  const [fade] = useState(() => new Animated.Value(1));
  const [enter] = useState(() => new Animated.Value(0));
  const shown = useRef(false);

  const { logo, centerY } = fitEmblem(width, height, insets.top, insets.bottom);
  const { fontSize, radius } = layoutArc(SPLASH_NAME, { innerRadius: logo / 2, spanDeg: SPAN_DEG, ...ARC });
  const box = Math.ceil((radius + fontSize) * 2);

  function handleLayout() {
    if (shown.current) return;
    shown.current = true;
    onShown();
    if (reduced) enter.setValue(1);
    else Animated.timing(enter, { toValue: 1, duration: FADE_IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }

  useEffect(() => {
    if (visible || reduced) return;
    Animated.timing(fade, { toValue: 0, duration: FADE_OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setMounted(false));
  }, [visible, reduced, fade]);

  // With reduced motion there is no fade: it simply goes.
  if (!mounted || (!visible && reduced)) return null;

  const emblemStyle = {
    opacity: enter,
    transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  };

  return (
    <Animated.View
      onLayout={handleLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <Animated.View style={[styles.emblem, { top: centerY - box / 2, width: box, height: box, left: (width - box) / 2 }, emblemStyle]}>
        <ArcText text={SPLASH_NAME} innerRadius={logo / 2} color={SplashColors.gold} spanDeg={SPAN_DEG} />
        <View style={[styles.logo, { width: logo, height: logo, left: (box - logo) / 2, top: (box - logo) / 2 }]}>
          <Image source={require('@/assets/images/brand/chr-logo.png')} style={{ width: logo, height: logo }} contentFit="contain" />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: SplashColors.background, zIndex: 2000 },
  emblem: { position: 'absolute' },
  logo: { position: 'absolute' },
});
