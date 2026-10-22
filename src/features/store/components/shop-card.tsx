import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import type { ShopProduct } from '../catalog';
import { formatINR, spokenINR } from '../format';
import { photoUrl } from '../image-hosts';
import { anyInStock, compareAtFor, displayPrice } from '../tack-details';
import { ProductImage } from './product-image';
import { QuantityStepper } from './quantity-stepper';

/**
 * A Tack Shop / Café item. Tack products show the photograph from the product data and open their detail page, where a
 * size is chosen when the product has sizes. Café items keep the simple add / quantity control.
 */
export function ShopCard({
  product,
  quantity,
  onOpen,
  onAdd,
  onChange,
}: {
  product: ShopProduct;
  quantity: number;
  onOpen?: () => void;
  onAdd: () => void;
  onChange: (next: number) => void;
}) {
  const theme = useTheme();
  const details = product.details;
  const variants = details?.variants ?? [];
  const firstPhoto = details?.images.map((i) => ({ uri: photoUrl(i.url), alt: i.alt })).find((i) => i.uri) ?? null;
  const price = displayPrice(product.price, variants);
  const compareAt = compareAtFor(details?.compareAtPrice ?? null, price.from ? null : price.amount);
  const soldOut = variants.length > 0 && !anyInStock(variants);
  const showImage = product.category === 'tack';

  const body = (
    <>
      {showImage ? (
        <ProductImage
          uri={firstPhoto?.uri ?? null}
          alt={firstPhoto?.alt || product.name}
          style={styles.photo}
        />
      ) : null}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText variant="heading" style={styles.flex} accessibilityRole="header">
            {product.name}
          </ThemedText>
        </View>
        {details?.shortDescription || product.description ? (
          <ThemedText themeColor="textSecondary" numberOfLines={2}>
            {details?.shortDescription ?? product.description}
          </ThemedText>
        ) : null}
        {price.amount !== null ? (
          <View style={styles.priceRow} accessible accessibilityLabel={`${price.from ? 'From ' : ''}${spokenINR(price.amount)}`}>
            {price.from ? (
              <ThemedText variant="caption" themeColor="textSecondary">
                From
              </ThemedText>
            ) : null}
            <ThemedText variant="heading">{formatINR(price.amount)}</ThemedText>
            {compareAt !== null ? (
              <ThemedText variant="caption" themeColor="textSecondary" style={styles.strike}>
                {formatINR(compareAt)}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.chip, { backgroundColor: theme.surfaceMuted }]}>
          <ThemedText variant="caption" themeColor="textSecondary">
            Collect in store at the club · no delivery
          </ThemedText>
        </View>

        {!product.isPurchasable ? (
          <ThemedText variant="caption" themeColor="textSecondary">
            {product.price === null ? 'Not priced yet — not available to buy.' : 'Not available to buy right now.'}
          </ThemedText>
        ) : soldOut ? (
          <ThemedText variant="caption" themeColor="textSecondary">
            Currently out of stock.
          </ThemedText>
        ) : onOpen ? (
          <View style={styles.inCart}>
            {quantity > 0 ? (
              <ThemedText variant="caption" themeColor="success">
                {`${quantity} in your order`}
              </ThemedText>
            ) : (
              <ThemedText variant="caption" themeColor="textSecondary">
                {variants.length > 0 ? 'Choose a size' : 'View details'}
              </ThemedText>
            )}
          </View>
        ) : quantity > 0 ? (
          <View style={styles.inCart}>
            <ThemedText variant="caption" themeColor="success">
              In your order
            </ThemedText>
            <QuantityStepper name={product.name} quantity={quantity} onChange={onChange} />
          </View>
        ) : (
          <SecondaryButton title="Add to order" accessibilityLabel={`Add ${product.name} to your order`} fullWidth onPress={onAdd} />
        )}
      </View>
    </>
  );

  return (
    <Card style={styles.card}>
      {onOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${product.name}${price.amount !== null ? `, ${price.from ? 'from ' : ''}${spokenINR(price.amount)}` : ''}`}
          accessibilityHint="Opens the product"
          onPress={onOpen}>
          {body}
        </Pressable>
      ) : (
        body
      )}
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
    aspectRatio: 1,
  },
  body: {
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  flex: {
    flex: 1,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  inCart: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
});
