import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { checkoutHref } from '@/features/checkout/handoff';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import { useStoreCatalog } from '../catalog-provider';
import { AvailabilityNote } from '../components/availability-note';
import { CatalogErrorState, CatalogLoading } from '../components/catalog-status';
import { ProductFacts } from '../components/product-facts';
import { formatINR, plural, spokenINR } from '../format';
import { presentationFor, productFacts } from '../presentation';

export function backToStore() {
  if (router.canGoBack()) router.back();
  else router.replace('/store');
}

export default function ProductScreen() {
  const theme = useTheme();
  const { sku } = useLocalSearchParams<{ sku: string }>();
  const catalog = useStoreCatalog();
  const product = typeof sku === 'string' ? catalog.findBySku(sku) : undefined;
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!product) {
    if (catalog.status === 'loading') return <Centered><CatalogLoading /></Centered>;
    if (catalog.status === 'error' && catalog.products.length === 0) {
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
          title="We couldn't find that option"
          message="It may have been removed or is no longer on sale."
          action={<PrimaryButton title="Back to store" onPress={backToStore} />}
        />
      </Centered>
    );
  }

  const look = presentationFor(product);
  const facts = productFacts(product);

  async function handleContinue() {
    if (!product || checking) return;
    setChecking(true);
    setProblem(null);
    // Availability can change after the list loaded (plan bought elsewhere, product withdrawn).
    const fresh = await catalog.refresh();
    setChecking(false);
    if (!fresh) {
      setProblem("We couldn't confirm this option is still available. Check your connection and try again.");
      return;
    }
    const current = fresh.find((p) => p.id === product.id);
    if (!current || !current.isPurchasable) {
      setProblem(current ? 'This option is no longer available to purchase.' : 'This option is no longer on sale.');
      return;
    }
    router.push(checkoutHref(current));
  }

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title: product.name }} />

      {look.photo ? (
        <Image source={look.photo} style={styles.photo} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : null}

      <View style={styles.heading}>
        {look.badge ? (
          <ThemedText variant="eyebrow" themeColor="accentText">
            {look.badge}
          </ThemedText>
        ) : null}
        <ThemedText variant="display" accessibilityRole="header">
          {product.name}
        </ThemedText>
        {look.tagline ? <ThemedText themeColor="textSecondary">{look.tagline}</ThemedText> : null}
        <View
          style={styles.priceRow}
          accessible
          accessibilityLabel={`Price ${spokenINR(product.price)}, valid for ${plural(product.validityDays, 'day', 'days')}`}>
          <ThemedText variant="display">{formatINR(product.price)}</ThemedText>
          <ThemedText variant="caption" themeColor="textSecondary">
            {`for ${plural(product.validityDays, 'day', 'days')}`}
          </ThemedText>
        </View>
      </View>

      <ProductFacts product={product} />

      <View style={styles.section}>
        <SectionHeading title="What's included" />
        <Card style={styles.list}>
          {facts.map((fact) => (
            <View key={fact.key} style={styles.listRow}>
              <View style={[styles.bullet, { backgroundColor: theme.secondary }]} />
              <ThemedText style={styles.flex}>{fact.sentence}</ThemedText>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeading title="Good to know" />
        <Card style={styles.list}>
          <View style={styles.listRow}>
            <View style={[styles.bullet, { backgroundColor: theme.secondary }]} />
            <ThemedText style={styles.flex}>
              Choosing this doesn&apos;t book a class. Classes are booked separately.
            </ThemedText>
          </View>
          <View style={styles.listRow}>
            <View style={[styles.bullet, { backgroundColor: theme.secondary }]} />
            <ThemedText style={styles.flex}>While you hold this plan, it can&apos;t be bought again.</ThemedText>
          </View>
        </Card>
      </View>

      <AvailabilityNote product={product} />
      {problem ? <FormMessage tone="error">{problem}</FormMessage> : null}

      <View style={styles.actions}>
        <PrimaryButton
          title="Continue to checkout"
          accessibilityHint="Opens checkout for this option. Nothing is charged here."
          fullWidth
          loading={checking}
          loadingLabel="Checking this option"
          disabled={!product.isPurchasable}
          onPress={handleContinue}
        />
        <Button variant="ghost" title="Back to store" onPress={backToStore} />
      </View>
    </ScreenContainer>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <ScreenContainer scroll={false} contentStyle={styles.centered}>
      {children}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radii.lg,
  },
  heading: {
    gap: Spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  section: {
    gap: Spacing.md,
  },
  list: {
    gap: Spacing.md,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 9,
  },
  flex: {
    flex: 1,
  },
  actions: {
    gap: Spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
});
