import AppTabs from '@/components/app-tabs';
import { usePush } from '@/features/push/use-push';
import { CartProvider } from '@/features/store/cart-provider';
import { StoreCatalogProvider } from '@/features/store/catalog-provider';

// Signed-in members open on Home (launch, reload and after sign-in).
export const unstable_settings = {
  initialRouteName: '(home)',
};

/**
 * Signed-in area: the tab navigator. The catalog and cart live here (not in
 * the Store tab) so screens shared across tabs — e.g. order status opened from
 * Home — have them, with one catalog fetch for the whole signed-in session.
 * Phone alerts (registration and tap handling) are set up here too.
 */
export default function AppLayout() {
  usePush();
  return (
    <StoreCatalogProvider>
      <CartProvider>
        <AppTabs />
      </CartProvider>
    </StoreCatalogProvider>
  );
}
