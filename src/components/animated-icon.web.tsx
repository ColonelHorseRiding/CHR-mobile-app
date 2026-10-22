import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe, Easing } from 'react-native-reanimated';

import { ChrLogo } from '@/components/brand/chr-logo';

const DURATION = 300;
const ICON_SIZE = 160;

export function AnimatedSplashOverlay() {
  return null;
}

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={logoKeyframe.duration(DURATION)}>
        <ChrLogo size={ICON_SIZE} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
});
