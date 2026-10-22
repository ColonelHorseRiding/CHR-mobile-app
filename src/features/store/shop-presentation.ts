import type { ShopCategory } from './catalog';

/**
 * Presentation only. Product photographs are not listed here: they come from the product data the club maintains in
 * Admin → Tack Shop (see tack-details.ts and image-hosts.ts), so a new or changed photograph needs no app update.
 */
export const CATEGORY_LABEL: Record<'membership' | ShopCategory, string> = {
  membership: 'Memberships',
  tack: 'Tack Shop',
  cafe: 'Café',
};
