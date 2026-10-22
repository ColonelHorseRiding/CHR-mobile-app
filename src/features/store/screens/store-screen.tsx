import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ChrLogo } from '@/components/brand/chr-logo';
import { ThemedText } from '@/components/themed-text';
import { Button, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { PendingCheckoutBanner } from '@/features/checkout/pending-checkout-banner';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import { resolveCart } from '../cart';
import { useCart } from '../cart-provider';
import type { ShopCategory } from '../catalog';
import { useStoreCatalog } from '../catalog-provider';
import { CatalogEmpty, CatalogErrorState, CatalogLoading } from '../components/catalog-status';
import { CategoryChips } from '../components/category-chips';
import { CategoryTabs } from '../components/category-tabs';
import { ProductCard } from '../components/product-card';
import { ShopCard } from '../components/shop-card';
import { formatINR, spokenINR } from '../format';
import { groupProducts, STORE_HERO } from '../presentation';
import { CATEGORY_LABEL } from '../shop-presentation';
import { filterByCategory, usableCategories } from '../tack-details';

type Tab = 'membership' | ShopCategory;

const TABS: { key: Tab; label: string }[] = [
  { key: 'membership', label: CATEGORY_LABEL.membership },
  { key: 'tack', label: CATEGORY_LABEL.tack },
  { key: 'cafe', label: CATEGORY_LABEL.cafe },
];

export default function StoreScreen() {
  const theme = useTheme();
  const catalog = useStoreCatalog();
  const cart = useCart();
  const [tab, setTab] = useState<Tab>('membership');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  // Catalog changes made in Admin → Tack Shop appear without an app update: re-read when the store comes into view.
  const { refreshIfStale } = catalog;
  useFocusEffect(
    useCallback(() => {
      refreshIfStale(60_000);
    }, [refreshIfStale])
  );
  // Café is hidden while the club lists nothing in it; it reappears on its own once items are listed.
  const tabs = TABS.filter((t) => t.key !== 'cafe' || catalog.shopProducts.some((p) => p.category === 'cafe'));
  const { memberships, singles } = groupProducts(catalog.products);
  const hasProducts = catalog.products.length > 0 || catalog.shopProducts.length > 0;
  const tabItems = tab === 'membership' ? [] : catalog.shopProducts.filter((p) => p.category === tab);
  // Category filters come from the club's own categories; only ones with products are offered. A category that is no
  // longer offered (renamed, disabled, emptied) quietly falls back to all products.
  const tackCategories =
    tab === 'tack'
      ? usableCategories(
          catalog.tackCategories,
          tabItems.map((p) => ({ categorySlug: p.details?.categorySlug ?? null }))
        )
      : [];
  const activeSlug = tackCategories.some((c) => c.slug === categorySlug) ? categorySlug : null;
  const shopItems =
    tab === 'tack'
      ? filterByCategory(
          tabItems.map((p) => ({ product: p, categorySlug: p.details?.categorySlug ?? null })),
          activeSlug
        ).map((x) => x.product)
      : tabItems;
  const order = resolveCart(cart.items, catalog.shopProducts);

  const openProduct = (sku: string) => router.push({ pathname: '/store/[sku]', params: { sku } });
  const retry = () => void catalog.refresh();

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={catalog.refreshing && catalog.status !== 'loading'}
          onRefresh={retry}
          tintColor={theme.primary}
          colors={[theme.primary]}
          progressBackgroundColor={theme.surface}
        />
      }>
      <View style={styles.hero}>
        <Image source={STORE_HERO} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" accessible={false} />
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        <View style={styles.heroContent}>
          <ChrLogo size={56} />
          <ThemedText variant="eyebrow" themeColor="brandAccent">
            Colonel Horse Riding Club
          </ThemedText>
          <ThemedText variant="display" themeColor="onBrand" accessibilityRole="header">
            The Club Store
          </ThemedText>
          <ThemedText themeColor="onBrand">Memberships, single rides and tack for collection at the club.</ThemedText>
        </View>
      </View>

      <PendingCheckoutBanner />

      <SecondaryButton
        title="My orders"
        fullWidth
        accessibilityHint="Your memberships and shop orders, with payment and collection status"
        onPress={() => router.push('/store/orders')}
      />

      <CategoryTabs tabs={tabs} value={tab} onChange={setTab} />

      {catalog.status === 'error' && hasProducts ? (
        <FormMessage tone="error" title="Couldn't refresh the store">
          {`${catalog.error.message} Showing details from the last update; availability is checked again before checkout.`}
        </FormMessage>
      ) : null}
      {catalog.status === 'loading' && !hasProducts ? <CatalogLoading /> : null}
      {catalog.status === 'error' && !hasProducts ? (
        <CatalogErrorState error={catalog.error} onRetry={retry} retrying={catalog.refreshing} />
      ) : null}
      {catalog.status === 'ready' && !hasProducts ? <CatalogEmpty onRetry={retry} retrying={catalog.refreshing} /> : null}

      {tab !== 'membership' && order.count > 0 ? (
        <Card tone="brand" style={styles.orderBar}>
          <View style={styles.orderRow}>
            <View style={styles.flex}>
              <ThemedText variant="eyebrow" themeColor="brandAccent">
                Your order
              </ThemedText>
              <ThemedText variant="heading" themeColor="onBrand" accessibilityLabel={`${order.count} items, ${spokenINR(order.total)}`}>
                {`${order.count} ${order.count === 1 ? 'item' : 'items'} · ${formatINR(order.total)}`}
              </ThemedText>
            </View>
          </View>
          <Button variant="outline" title="Review order" fullWidth onPress={() => router.push('/store/cart')} />
        </Card>
      ) : null}

      {tab === 'membership' ? (
        <>
          {memberships.length > 0 ? (
            <View style={styles.section}>
              <SectionHeading
                eyebrow="Memberships"
                title="Ride regularly"
                description="Monthly plans with a set number of classes."
              />
              {memberships.map((product) => (
                <ProductCard key={product.id} product={product} onSelect={() => openProduct(product.sku)} />
              ))}
            </View>
          ) : null}

          {singles.length > 0 ? (
            <View style={styles.section}>
              <SectionHeading eyebrow="Single rides" title="Ride once" description="One riding session, no membership needed." />
              {singles.map((product) => (
                <ProductCard key={product.id} product={product} onSelect={() => openProduct(product.sku)} />
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.section}>
          <SectionHeading
            eyebrow={CATEGORY_LABEL[tab]}
            title={tab === 'tack' ? 'Riding essentials' : 'From the café'}
            description={shopItems.length > 0 ? 'Order and pay here, then collect in store at the club. Nothing is delivered.' : undefined}
          />
          {tab === 'tack' && tackCategories.length > 0 ? (
            <CategoryChips categories={tackCategories} value={activeSlug} onChange={setCategorySlug} />
          ) : null}
          {shopItems.length === 0 && hasProducts ? (
            <EmptyState
              title={tab === 'cafe' ? 'The café isn’t taking app orders' : activeSlug ? 'Nothing in this category right now' : 'Nothing in the Tack Shop right now'}
              message={
                tab === 'cafe'
                  ? 'The club hasn’t listed its café menu for ordering in the app at the moment.'
                  : 'The club hasn’t listed any tack for sale at the moment.'
              }
            />
          ) : null}
          {shopItems.map((product) => (
            <ShopCard
              key={product.id}
              product={product}
              quantity={cart.quantityOf(product.id)}
              onOpen={product.category === 'tack' ? () => router.push({ pathname: '/store/tack/[sku]', params: { sku: product.sku } }) : undefined}
              onAdd={() => cart.add(product.id)}
              onChange={(next) => cart.setQty(product.id, next)}
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 280,
    borderRadius: Radii.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: 'rgba(15, 26, 21, 0.55)',
  },
  heroContent: {
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  section: {
    gap: Spacing.xl,
  },
  orderBar: {
    gap: Spacing.md,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  flex: {
    flex: 1,
  },
});
