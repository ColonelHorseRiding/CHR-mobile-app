import type { ImageSourcePropType } from 'react-native';

import type { StoreProduct } from './catalog';
import { plural } from './format';

/**
 * Presentation only — never prices or terms. Keyed by the backend's stable
 * plan_code. Taglines and photos are the CHR website store's own copy and
 * images (src/store/MembershipCard.jsx, public/assests/membership/).
 * A plan_code not listed here still renders, with neutral defaults.
 */
type PlanPresentation = {
  group: 'membership' | 'single';
  badge?: string;
  actionLabel: string;
  tagline?: string;
  photo?: ImageSourcePropType;
  /** Display order within its group. */
  order: number;
};

const PLANS: Record<string, PlanPresentation> = {
  GOLD: {
    group: 'membership',
    badge: 'Recommended',
    actionLabel: 'Choose Gold',
    tagline: 'The perfect rhythm for regular riders.',
    photo: require('@/assets/images/store/gold.jpg'),
    order: 1,
  },
  PLATINUM: {
    group: 'membership',
    badge: 'Premium',
    actionLabel: 'Choose Platinum',
    tagline: 'For riders who want more time in the saddle.',
    photo: require('@/assets/images/store/platinum.jpg'),
    order: 2,
  },
  ONE_TIME_RIDE: {
    group: 'single',
    actionLabel: 'Add Ride',
    tagline: 'A single session to experience the joy of riding.',
    photo: require('@/assets/images/store/one-time.jpg'),
    order: 1,
  },
};

export const STORE_HERO = require('@/assets/images/store/hero.jpg');

export function presentationFor(product: StoreProduct): PlanPresentation {
  return (
    (product.planCode ? PLANS[product.planCode] : undefined) ?? {
      group: product.classCredits > 1 ? 'membership' : 'single',
      actionLabel: 'Select',
      order: 100 + product.sortOrder,
    }
  );
}

/** Products split into the store's sections, each in display order. */
export function groupProducts(products: StoreProduct[]) {
  const byOrder = (a: StoreProduct, b: StoreProduct) => presentationFor(a).order - presentationFor(b).order;
  return {
    memberships: products.filter((p) => presentationFor(p).group === 'membership').sort(byOrder),
    singles: products.filter((p) => presentationFor(p).group === 'single').sort(byOrder),
  };
}

/** The product's terms as short facts, all derived from backend fields. */
export function productFacts(product: StoreProduct) {
  const single = presentationFor(product).group === 'single';
  return [
    {
      key: 'credits',
      value: String(product.classCredits),
      label: single ? (product.classCredits === 1 ? 'riding session' : 'riding sessions') : product.classCredits === 1 ? 'class' : 'classes',
      sentence: single ? plural(product.classCredits, 'riding session', 'riding sessions') : plural(product.classCredits, 'riding class', 'riding classes'),
    },
    {
      key: 'validity',
      value: String(product.validityDays),
      label: 'days validity',
      sentence: `Valid for ${plural(product.validityDays, 'day', 'days')}`,
    },
    {
      key: 'reschedules',
      value: String(product.reschedulesAllowed),
      label: product.reschedulesAllowed === 1 ? 'reschedule' : 'reschedules',
      sentence:
        product.reschedulesAllowed === 0
          ? 'No reschedules'
          : `${plural(product.reschedulesAllowed, 'reschedule', 'reschedules')} allowed`,
    },
  ];
}
