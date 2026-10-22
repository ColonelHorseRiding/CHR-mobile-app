import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import type { StoreProduct } from '../catalog';
import { formatINR, plural, spokenINR } from '../format';
import { presentationFor } from '../presentation';
import { AvailabilityNote } from './availability-note';
import { ProductFacts } from './product-facts';

export function ProductCard({ product, onSelect }: { product: StoreProduct; onSelect: () => void }) {
  const theme = useTheme();
  const look = presentationFor(product);

  return (
    <Card style={styles.card}>
      {look.photo ? (
        <View>
          <Image source={look.photo} style={styles.photo} contentFit="cover" accessibilityIgnoresInvertColors />
          {look.badge ? (
            <View style={[styles.badge, { backgroundColor: theme.brand }]}>
              <ThemedText variant="eyebrow" themeColor="brandAccent">
                {look.badge}
              </ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.titleBlock}>
          {!look.photo && look.badge ? (
            <ThemedText variant="eyebrow" themeColor="accentText">
              {look.badge}
            </ThemedText>
          ) : null}
          <ThemedText variant="title" accessibilityRole="header">
            {product.name}
          </ThemedText>
          {look.tagline ? <ThemedText themeColor="textSecondary">{look.tagline}</ThemedText> : null}
        </View>

        <View
          style={styles.priceRow}
          accessible
          accessibilityLabel={`${spokenINR(product.price)}, valid for ${plural(product.validityDays, 'day', 'days')}`}>
          <ThemedText variant="display" style={styles.price}>
            {formatINR(product.price)}
          </ThemedText>
          <ThemedText variant="caption" themeColor="textSecondary">
            {`for ${plural(product.validityDays, 'day', 'days')}`}
          </ThemedText>
        </View>

        <ProductFacts product={product} />
        <AvailabilityNote product={product} />

        <Button
          variant={look.badge === 'Recommended' ? 'primary' : 'secondary'}
          title={look.actionLabel}
          accessibilityLabel={`${look.actionLabel}: ${product.name}, ${spokenINR(product.price)}`}
          accessibilityHint="Opens the plan details"
          fullWidth
          onPress={onSelect}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  badge: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
  },
  body: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  titleBlock: {
    gap: Spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  price: {
    fontSize: 30,
    lineHeight: 36,
  },
});
