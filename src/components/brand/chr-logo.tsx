import { Image } from 'expo-image';
import { View } from 'react-native';

import { palette } from '@/theme';

export type ChrLogoProps = {
  size?: number;
  /**
   * The emblem is ivory line art on a transparent background, made for the
   * forest-green brand surfaces. On light surfaces, set this to place it on a
   * forest-green disc so it stays visible.
   */
  onLight?: boolean;
};

/**
 * CHR emblem. Master artwork: `assets/images/brand/chr-icon.png` (transparent background).
 * `chr-logo.png` is a 512px copy for in-app and splash use; the app icon, adaptive icon,
 * monochrome icon and favicon in `assets/images/brand/` are all derived from the master.
 */
export function ChrLogo({ size = 96, onLight = false }: ChrLogoProps) {
  const image = (
    <Image
      source={require('@/assets/images/brand/chr-logo.png')}
      style={{ width: onLight ? size * 0.86 : size, height: onLight ? size * 0.86 : size }}
      contentFit="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Colonel Horse Riding Club"
    />
  );
  if (!onLight) return image;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette.forest600,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {image}
    </View>
  );
}
