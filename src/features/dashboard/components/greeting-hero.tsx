import { Image } from 'expo-image';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Layout, Spacing } from '@/theme';
import { withAlpha } from '@/theme/color-utils';

/**
 * Greeting over a warm golden-hour horse photograph (the club's own Gold
 * Membership photo, bundled locally). The photo bleeds off the right edge and
 * dissolves into the page background with gradient fades, so it has no hard
 * rectangle; the text sits on the plain side.
 */
export function GreetingHero({ greeting, name }: { greeting: string; name: string }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 380;
  const height = narrow ? 210 : 240;
  const bg = theme.background;

  return (
    <View style={[styles.hero, { height }]}>
      <Image
        source={require('@/assets/images/store/gold.jpg')}
        style={[styles.photo, { width: '72%', height, right: -Layout.gutter }]}
        contentFit="cover"
        contentPosition={{ left: '52%', top: '40%' }}
        accessible={false}
        accessibilityIgnoresInvertColors
      />
      {/* Fade the photo into the background: left edge, bottom edge and a touch at the top. */}
      <View
        pointerEvents="none"
        style={[
          styles.fade,
          { right: -Layout.gutter, width: '72%', experimental_backgroundImage: `linear-gradient(to right, ${withAlpha(bg, 1)} 0%, ${withAlpha(bg, 0.85)} 22%, ${withAlpha(bg, 0)} 62%)` },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.fade,
          { right: -Layout.gutter, width: '72%', experimental_backgroundImage: `linear-gradient(to bottom, ${withAlpha(bg, 1)} 0%, ${withAlpha(bg, 0)} 26%, ${withAlpha(bg, 0)} 62%, ${withAlpha(bg, 1)} 100%)` },
        ]}
      />

      <View style={[styles.text, { maxWidth: narrow ? '62%' : '58%' }]}>
        <ThemedText themeColor="textSecondary" style={styles.greeting}>
          {`${greeting},`}
        </ThemedText>
        <ThemedText variant="display" accessibilityRole="header" numberOfLines={3} style={[styles.name, narrow && styles.nameNarrow]}>
          {name}
        </ThemedText>
        <View style={[styles.rule, { backgroundColor: theme.secondary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    justifyContent: 'center',
  },
  photo: {
    position: 'absolute',
    top: 0,
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  text: {
    gap: Spacing.xs,
  },
  greeting: {
    fontSize: 18,
    lineHeight: 24,
  },
  name: {
    fontSize: 38,
    lineHeight: 44,
  },
  nameNarrow: {
    fontSize: 32,
    lineHeight: 38,
  },
  rule: {
    width: 44,
    height: 3,
    borderRadius: 2,
    marginTop: Spacing.md,
  },
});
