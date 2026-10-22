import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import type { ResolvedImage } from '../tack-details';
import { ProductImage } from './product-image';

/** Swipeable main photograph with thumbnails. With no usable photograph it shows the placeholder. */
export function ProductGallery({ images, name }: { images: ResolvedImage[]; name: string }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(width - Spacing.xl * 2, 560);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<ResolvedImage>>(null);

  if (images.length === 0) {
    return <ProductImage uri={null} alt={name} style={{ width: size, height: size, borderRadius: Radii.lg }} />;
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={list}
        data={images}
        keyExtractor={(i) => i.uri}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width: size, flexGrow: 0, borderRadius: Radii.lg }}
        initialNumToRender={1}
        windowSize={3}
        getItemLayout={(_, i) => ({ length: size, offset: size * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / size))}
        renderItem={({ item, index: i }) => (
          <ProductImage
            uri={item.uri}
            alt={item.alt || `${name}, photo ${i + 1} of ${images.length}`}
            style={{ width: size, height: size }}
            priority={i === 0 ? 'high' : 'normal'}
          />
        )}
      />
      {images.length > 1 ? (
        <View style={styles.thumbs} accessibilityRole="tablist">
          {images.map((img, i) => (
            <Pressable
              key={img.uri}
              accessibilityRole="tab"
              accessibilityLabel={`Photo ${i + 1} of ${images.length}`}
              accessibilityState={{ selected: i === index }}
              onPress={() => {
                setIndex(i);
                list.current?.scrollToIndex({ index: i, animated: true });
              }}
              hitSlop={4}
              style={[styles.thumb, { borderColor: i === index ? theme.primary : theme.border }]}>
              <ProductImage uri={img.uri} alt="" style={styles.thumbImage} priority="low" />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md, alignItems: 'center' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
  thumb: { width: 56, height: 56, borderRadius: Radii.md, borderWidth: 2, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
});
