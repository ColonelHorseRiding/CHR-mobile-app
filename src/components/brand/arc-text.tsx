import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/theme/tokens';

import { layoutArc } from './arc-text-layout';

export type ArcTextProps = {
  text: string;
  /** Radius of the circle the text curves around the outside of (the logo's ring). */
  innerRadius: number;
  color: string;
  /** Degrees covered by the text. */
  spanDeg?: number;
};

/**
 * Curved text above a circle, centred on its top. Each letter is its own
 * rotated element, so it stays sharp at any size and needs no extra library.
 * The component is as wide as the circle the text wraps, centred on it, and
 * hidden from screen readers (the emblem carries the accessible name).
 */
export function ArcText({ text, innerRadius, color, spanDeg = 150 }: ArcTextProps) {
  const { fontSize, radius, letters } = layoutArc(text, { innerRadius, spanDeg, letterSpacingEm: 0.14, gapEm: 0.3 });
  const box = Math.ceil((radius + fontSize) * 2);
  const half = fontSize * 0.6;
  const lineHeight = Math.ceil(fontSize * 1.25);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: box, height: box }}>
      {letters.map((l, i) =>
        l.char === ' ' ? null : (
          <View
            key={i}
            style={[
              styles.slot,
              {
                width: Math.ceil(l.width + fontSize * 0.2),
                height: lineHeight,
                left: box / 2 - (l.width + fontSize * 0.2) / 2,
                top: box / 2 - lineHeight / 2,
                transform: [{ rotate: `${l.angle}deg` }, { translateY: -radius }],
              },
            ]}>
            <Text allowFontScaling={false} style={[styles.letter, { color, fontSize, lineHeight, fontFamily: Fonts.serif }]}>
              {l.char}
            </Text>
          </View>
        )
      )}
      {/* A small diamond at each end of the text, as in the club's emblem. */}
      {[-1, 1].map((side) => (
        <View
          key={side}
          style={[
            styles.diamond,
            {
              width: half,
              height: half,
              left: box / 2 - half / 2,
              top: box / 2 - half / 2,
              backgroundColor: color,
              transform: [
                { rotate: `${side * (spanDeg / 2 + (fontSize * 1.6) / radius * (180 / Math.PI))}deg` },
                { translateY: -radius },
                { rotate: '45deg' },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  letter: { fontWeight: '600', textAlign: 'center', includeFontPadding: false },
  diamond: { position: 'absolute' },
});
