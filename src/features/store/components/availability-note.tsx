import { FormMessage } from '@/components/ui/form-message';

import type { StoreProduct } from '../catalog';
import { formatDate } from '../format';

/**
 * Explains why a product cannot be selected, using the backend's own reasons:
 * the customer already holds the plan (active_until), or it is not on sale.
 */
export function AvailabilityNote({ product }: { product: StoreProduct }) {
  if (product.isPurchasable) return null;
  if (product.activeUntil) {
    return (
      <FormMessage tone="info" title="You already hold this plan">
        {`It can be purchased again after ${formatDate(product.activeUntil)}.`}
      </FormMessage>
    );
  }
  return <FormMessage tone="info">This option isn&apos;t available to purchase right now.</FormMessage>;
}
