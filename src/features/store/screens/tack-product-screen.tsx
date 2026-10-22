import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

import { unavailableMessage, unavailableReason } from '../cart';
import { useCart } from '../cart-provider';
import { useStoreCatalog } from '../catalog-provider';
import { CatalogErrorState, CatalogLoading } from '../components/catalog-status';
import { ProductGallery } from '../components/product-gallery';
import { SizePicker } from '../components/size-picker';
import { formatINR, spokenINR } from '../format';
import { photosOf } from '../image-hosts';
import { anyInStock, compareAtFor, needsSize, variantLabel, variantPrice } from '../tack-details';
import { backToStore } from './product-screen';

/**
 * A Tack Shop product page, built entirely from the catalog the club maintains in Admin → Tack Shop: photographs,
 * descriptions, specifications, sizes and prices. Nothing about a product is written in the app. The price shown
 * here is for the customer's information; the server prices the order when it is placed.
 */
export default function TackProductScreen() {
  const theme = useTheme();
  const { sku } = useLocalSearchParams<{ sku: string }>();
  const catalog = useStoreCatalog();
  const cart = useCart();
  const product = typeof sku === 'string' ? catalog.findShopBySku(sku) : undefined;
  const [variantId, setVariantId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  // Pick up any change the club made in Admin since the list was loaded.
  const { refreshIfStale } = catalog;
  useFocusEffect(
    useCallback(() => {
      refreshIfStale(30_000);
    }, [refreshIfStale])
  );

  if (!product || product.category !== 'tack') {
    if (catalog.status === 'loading') return <Centered><CatalogLoading /></Centered>;
    if (catalog.status === 'error' && catalog.shopProducts.length === 0) {
      return (
        <Centered>
          <CatalogErrorState error={catalog.error} onRetry={() => void catalog.refresh()} retrying={catalog.refreshing} />
        </Centered>
      );
    }
    return (
      <Centered>
        <Stack.Screen options={{ title: 'Not found' }} />
        <EmptyState
          title="We couldn't find that product"
          message="It may have been removed or is no longer on sale."
          action={<PrimaryButton title="Back to store" onPress={backToStore} />}
        />
      </Centered>
    );
  }

  const details = product.details;
  const variants = details?.variants ?? [];
  const sized = needsSize(variants);
  // A selection that is no longer offered (after a refresh) is treated as no selection, never swapped for another size.
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const price = variantPrice(product.price, variant);
  const compareAt = compareAtFor(details?.compareAtPrice ?? null, price);
  const photos = photosOf(details?.images ?? []);
  const soldOut = sized && !anyInStock(variants);
  const detailsMissing = details === null;
  const inCart = cart.items.filter((i) => i.productId === product.id);
  const selectedInCart = inCart.find((i) => (i.variantId ?? null) === (variant?.id ?? null));
  const canAdd = product.isPurchasable && price !== null && !soldOut && !detailsMissing && (!sized || (variant !== null && variant.inStock));
  const specs = details?.specs;
  const specRows = [
    ['Colour', specs?.colour],
    ['Material', specs?.material],
    ['Fit', specs?.fit],
    ['Care', specs?.care],
    ['Sizes', sized ? null : specs?.sizesNote],
    ...(specs?.extra.map((e) => [e.label, e.value] as const) ?? []),
  ].filter((row): row is [string, string] => typeof row[1] === 'string' && row[1] !== '');
  const eyebrow = [catalog.tackCategories.find((c) => c.slug === details?.categorySlug)?.name, details?.audience, details?.brand]
    .filter(Boolean)
    .join(' · ');

  async function addToOrder() {
    if (!product || checking) return;
    setChecking(true);
    setProblem(null);
    setAdded(null);
    // Availability and price can change after the page opened: re-check before adding.
    const fresh = await catalog.refreshShop();
    setChecking(false);
    if (!fresh) {
      setProblem("We couldn't confirm this is still available. Check your connection and try again.");
      return;
    }
    const current = fresh.find((p) => p.id === product.id);
    const chosen = variant?.id ?? null;
    const reason = unavailableReason(current, chosen);
    if (reason) {
      setProblem(
        unavailableMessage({
          name: product.name,
          label: variant ? variantLabel(variant) : null,
          reason,
        }) + (reason === 'size-required' || reason === 'size-gone' || reason === 'out-of-stock' ? ' Please choose a size.' : '')
      );
      if (reason !== 'gone') setVariantId(null);
      return;
    }
    cart.add(product.id, chosen);
    setAdded(variant ? `${product.name} (${variantLabel(variant)}) added to your order.` : `${product.name} added to your order.`);
  }

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title: product.name }} />

      <ProductGallery images={photos} name={product.name} />

      <View style={styles.heading}>
        {eyebrow ? (
          <ThemedText variant="eyebrow" themeColor="accentText">
            {eyebrow}
          </ThemedText>
        ) : null}
        <ThemedText variant="display" accessibilityRole="header">
          {product.name}
        </ThemedText>
        {price !== null ? (
          <View
            style={styles.priceRow}
            accessible
            accessibilityLabel={`${compareAt !== null ? `Was ${spokenINR(compareAt)}, now ` : 'Price '}${spokenINR(price)}`}>
            <ThemedText variant="display">{formatINR(price)}</ThemedText>
            {compareAt !== null ? (
              <ThemedText themeColor="textSecondary" style={styles.strike}>
                {formatINR(compareAt)}
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <ThemedText themeColor="textSecondary">Not priced yet — not available to buy.</ThemedText>
        )}
        {details?.shortDescription ? <ThemedText themeColor="textSecondary">{details.shortDescription}</ThemedText> : null}
      </View>

      {detailsMissing ? (
        <FormMessage tone="info" title="Product details didn't load">
          Pull down on the store to refresh. Sizes and photographs are needed before this can be added to your order.
        </FormMessage>
      ) : null}

      {sized ? (
        <View style={styles.section}>
          <SectionHeading title="Size" description={variant ? undefined : 'Choose a size to continue.'} />
          <SizePicker
            variants={variants}
            value={variant?.id ?? null}
            onChange={(id) => {
              setVariantId(id);
              setProblem(null);
              setAdded(null);
            }}
          />
          {soldOut ? <ThemedText themeColor="textSecondary">All sizes are currently out of stock.</ThemedText> : null}
        </View>
      ) : null}

      {problem ? <FormMessage tone="error">{problem}</FormMessage> : null}
      {added ? <FormMessage tone="success">{added}</FormMessage> : null}

      <View style={styles.actions}>
        <PrimaryButton
          title={
            !product.isPurchasable || price === null
              ? 'Not available to buy'
              : soldOut
                ? 'Out of stock'
                : sized && !variant
                  ? 'Choose a size'
                  : selectedInCart
                    ? 'Add another'
                    : 'Add to order'
          }
          accessibilityHint="Adds this to your order. Nothing is charged until you place the order."
          fullWidth
          loading={checking}
          loadingLabel="Checking availability"
          disabled={!canAdd}
          onPress={() => void addToOrder()}
        />
        {inCart.length > 0 ? (
          <Button
            variant="outline"
            title={`Review order · ${inCart.reduce((n, i) => n + i.quantity, 0)} of this in your order`}
            fullWidth
            onPress={() => router.push('/store/cart')}
          />
        ) : null}
      </View>

      {details?.description ? (
        <View style={styles.section}>
          <SectionHeading title="About this product" />
          <ThemedText>{details.description}</ThemedText>
        </View>
      ) : null}

      {specRows.length > 0 ? (
        <View style={styles.section}>
          <SectionHeading title="Specifications" />
          <Card style={styles.list}>
            {specRows.map(([label, value]) => (
              <View key={label} style={styles.specRow}>
                <ThemedText themeColor="textSecondary" style={styles.specLabel}>
                  {label}
                </ThemedText>
                <ThemedText style={styles.flex}>{value}</ThemedText>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {specs && specs.features.length > 0 ? (
        <View style={styles.section}>
          <SectionHeading title="Features" />
          <Card style={styles.list}>
            {specs.features.map((feature) => (
              <View key={feature} style={styles.specRow}>
                <View style={[styles.bullet, { backgroundColor: theme.secondary }]} />
                <ThemedText style={styles.flex}>{feature}</ThemedText>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <FormMessage tone="info" title="Collected in store">
        Tack Shop items are for collection at the club only. There is no home delivery.
      </FormMessage>
    </ScreenContainer>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <ScreenContainer scroll={false} contentStyle={styles.centered}>{children}</ScreenContainer>;
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.md },
  strike: { textDecorationLine: 'line-through' },
  section: { gap: Spacing.md },
  actions: { gap: Spacing.sm },
  list: { gap: Spacing.md },
  specRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  specLabel: { width: 84 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center' },
});
