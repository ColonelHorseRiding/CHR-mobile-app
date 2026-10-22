import type { Href } from 'expo-router';

import type { StoreProduct } from '@/features/store/catalog';

/**
 * The Phase 3 → Phase 4 boundary.
 *
 * Only the product identifier crosses into checkout (Phase 4: checkout-screen.tsx). Checkout must re-read the
 * product (price, availability) from the backend rather than trusting values
 * carried in navigation params. The identifier is `store_products.id`, the
 * value the shared backend's order RPC expects as `product_id` in its items.
 */
export type CheckoutHandoff = {
  productId: string;
  quantity: 1;
};

export function checkoutHref(product: Pick<StoreProduct, 'id'>): Href {
  return { pathname: '/store/checkout', params: { productId: product.id } };
}

