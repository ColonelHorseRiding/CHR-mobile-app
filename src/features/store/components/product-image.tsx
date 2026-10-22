import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * A product photograph loaded from the backend's image URL. Cached on disk and in memory by expo-image, so the same
 * photograph is not downloaded again while scrolling or reopening a product. With no URL, or if the file cannot be
 * loaded, a consistent placeholder is shown — never another product's photo.
 */
export function ProductImage({
  uri,
  alt,
  style,
  contentFit = 'contain',
  priority = 'normal',
}: {
  uri: string | null;
  alt: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover';
  priority?: 'low' | 'normal' | 'high';
}) {
  const theme = useTheme();
  // State is keyed by the URL it describes, so a changed photograph starts fresh without an effect.
  const [state, setState] = useState<{ uri: string | null; status: 'loading' | 'ready' | 'failed' }>({ uri, status: 'loading' });
  const status = state.uri === uri ? state.status : 'loading';
  const showPlaceholder = !uri || status === 'failed';

  return (
    <View style={[styles.box, { backgroundColor: theme.surfaceMuted }, style]}>
      {showPlaceholder ? (
        <View style={styles.center} accessible accessibilityLabel={`${alt}: no photo available`}>
          <ThemedText variant="caption" themeColor="textSecondary">
            {uri ? 'Photo could not load' : 'Photo coming soon'}
          </ThemedText>
        </View>
      ) : (
        <>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            cachePolicy="memory-disk"
            recyclingKey={uri}
            priority={priority}
            transition={150}
            accessible
            accessibilityLabel={alt}
            accessibilityIgnoresInvertColors
            onLoad={() => setState({ uri, status: 'ready' })}
            onError={() => setState({ uri, status: 'failed' })}
          />
          {status === 'loading' ? (
            <View style={[styles.center, StyleSheet.absoluteFill]} pointerEvents="none">
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
