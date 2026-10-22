import { supabase } from '@/services/supabase/client';

import { EMPTY_TACK_DETAILS, isTackDetailsShape, parseTackDetails, type TackCategory, type TackDetails, type TackDetailsSnapshot } from './tack-details';

/**
 * A membership-category product from the shared CHR Supabase project.
 *
 * Source: the `store_catalog()` RPC used by the CHR website store. It resolves
 * prices server-side from `membership_plans` (the single source of truth),
 * reports whether the signed-in customer may buy each product, and applies the
 * "a held plan cannot be bought again until it ends" rule (`active_until`).
 * Everything in this type is backend data; presentation copy lives in
 * `presentation.ts`.
 */
export type StoreProduct = {
  /** store_products.id — the identifier the order RPC expects at checkout. */
  id: string;
  /** Stable, human-readable product key, e.g. MEM_GOLD. Used in store URLs. */
  sku: string;
  /** Stable plan key from membership_plans, e.g. GOLD, PLATINUM, ONE_TIME_RIDE. */
  planCode: string | null;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  classCredits: number;
  validityDays: number;
  reschedulesAllowed: number;
  isPurchasable: boolean;
  /** Set when the customer already holds this plan: it can be bought again after this date. */
  activeUntil: string | null;
  sortOrder: number;
};

export type CatalogErrorKind = 'network' | 'unavailable';

export class CatalogError extends Error {
  constructor(
    readonly kind: CatalogErrorKind,
    message: string
  ) {
    super(message);
  }
}

type CatalogRow = Record<string, unknown>;

/**
 * A Tack Shop or Café item from the same `store_catalog()` RPC. Both are
 * `IN_STORE_ONLY` on the server: bought online, collected at the club — never
 * delivered. A null price means the club hasn't priced it, so it can't be
 * bought (create_order() refuses it with PRICE_NOT_SET). Tack products also carry
 * the display details administrators maintain in Admin → Tack Shop (`details`:
 * category, photos, specifications, sizes). The server keeps no stock counts, only
 * an in-stock flag per size.
 */
export type ShopCategory = 'tack' | 'cafe';

export type ShopProduct = {
  id: string;
  sku: string;
  category: ShopCategory;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  fulfillment: string;
  isPurchasable: boolean;
  sortOrder: number;
  /** Display details from store_tack_details(); null for café items and when the details could not be loaded. */
  details: TackDetails | null;
};

export type CatalogSnapshot = {
  memberships: StoreProduct[];
  shop: ShopProduct[];
  /** Enabled Tack Shop categories, in the order set in Admin. */
  tackCategories: TackCategory[];
};

const STORE_CATEGORY = 'membership';
const SHOP_CATEGORIES: readonly string[] = ['tack', 'cafe'];
const CATALOG_TIMEOUT_MS = 15_000;

/**
 * Tack display details. Failure is not fatal — prices and purchasability come from store_catalog() — so the shop
 * still opens (without photos and sizes, and sized products then cannot be added) if only this call fails.
 */
async function fetchTackDetails(signal: AbortSignal): Promise<TackDetailsSnapshot | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('store_tack_details').abortSignal(signal);
    return error || !isTackDetailsShape(data) ? null : parseTackDetails(data);
  } catch {
    return null;
  }
}

/** Read-only: memberships only (the Phase 3 contract, kept for its callers). */
export async function fetchMembershipCatalog(): Promise<StoreProduct[]> {
  return (await fetchCatalog()).memberships;
}

/** Read-only: fetches the whole catalog once. Never creates orders, payments or memberships. */
export async function fetchCatalog(): Promise<CatalogSnapshot> {
  if (!supabase) throw new CatalogError('unavailable', 'The store is not configured.');

  // A request can stall rather than fail when offline (e.g. supabase-js retrying a
  // token refresh first), so it is bounded: the store shows an error with Retry
  // instead of loading forever.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CatalogError('network', "We couldn't reach the club's servers."));
    }, CATALOG_TIMEOUT_MS);
  });

  let result: Awaited<ReturnType<typeof supabase.rpc>>;
  let tackDetails: TackDetailsSnapshot | null = null;
  try {
    const [catalogResult, details] = await Promise.race([
      Promise.all([supabase.rpc('store_catalog').abortSignal(controller.signal), fetchTackDetails(controller.signal)]),
      timeout,
    ]);
    result = catalogResult;
    tackDetails = details;
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw new CatalogError('network', "We couldn't reach the club's servers.");
  } finally {
    clearTimeout(timer);
  }
  const { data, error } = result;
  if (error) {
    const networkFailure = /network|fetch|timed? ?out/i.test(`${error.message} ${error.details ?? ''}`);
    throw new CatalogError(
      networkFailure ? 'network' : 'unavailable',
      networkFailure ? "We couldn't reach the club's servers." : "The store couldn't be loaded."
    );
  }

  const rows = Array.isArray(data) ? (data as CatalogRow[]) : [];
  const detailsById = new Map((tackDetails ?? EMPTY_TACK_DETAILS).products.map((d) => [d.id, d]));
  return {
    tackCategories: (tackDetails ?? EMPTY_TACK_DETAILS).categories,
    memberships: rows
      .filter((row) => row.category === STORE_CATEGORY)
      .map(toProduct)
      .filter((product): product is StoreProduct => product !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    shop: rows
      .filter((row) => typeof row.category === 'string' && SHOP_CATEGORIES.includes(row.category))
      .map((row) => toShopProduct(row, detailsById))
      .filter((product): product is ShopProduct => product !== null)
      // When the details loaded, a tack product they omit is not published (or its category is switched off): hide it.
      // When they could not be loaded at all, nothing is hidden on that basis (the server still refuses what is off sale).
      .filter((product) => product.category !== 'tack' || tackDetails === null || product.details !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** Maps a tack/café row; a missing or invalid price makes the item unbuyable, never guessed. */
function toShopProduct(row: CatalogRow, detailsById: Map<string, TackDetails>): ShopProduct | null {
  if (typeof row.id !== 'string' || typeof row.sku !== 'string' || typeof row.name !== 'string') return null;
  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  const validPrice = price !== null && Number.isFinite(price) && price > 0 ? price : null;
  return {
    id: row.id,
    sku: row.sku,
    category: row.category === 'cafe' ? 'cafe' : 'tack',
    name: row.name,
    description: typeof row.description === 'string' && row.description.trim() ? row.description : null,
    price: validPrice,
    currency: typeof row.currency === 'string' ? row.currency : 'INR',
    fulfillment: typeof row.fulfillment === 'string' ? row.fulfillment : 'IN_STORE_ONLY',
    isPurchasable: row.is_purchasable === true && validPrice !== null,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    details: row.category === 'tack' ? (detailsById.get(row.id) ?? null) : null,
  };
}

/** Maps a row defensively: anything without a valid price or terms is left out, never guessed. */
function toProduct(row: CatalogRow): StoreProduct | null {
  const price = Number(row.price);
  const classCredits = Number(row.class_credits);
  const validityDays = Number(row.validity_days);
  const reschedules = Number(row.reschedules_allowed);
  if (
    typeof row.id !== 'string' ||
    typeof row.sku !== 'string' ||
    typeof row.name !== 'string' ||
    row.price === null ||
    !Number.isFinite(price) ||
    !Number.isInteger(classCredits) ||
    classCredits <= 0 ||
    !Number.isInteger(validityDays) ||
    validityDays <= 0 ||
    !Number.isInteger(reschedules) ||
    reschedules < 0
  ) {
    return null;
  }
  return {
    id: row.id,
    sku: row.sku,
    planCode: typeof row.plan_code === 'string' ? row.plan_code : null,
    name: row.name,
    description: typeof row.description === 'string' ? row.description : null,
    price,
    currency: typeof row.currency === 'string' ? row.currency : 'INR',
    classCredits,
    validityDays,
    reschedulesAllowed: reschedules,
    isPurchasable: row.is_purchasable === true,
    activeUntil: typeof row.active_until === 'string' ? row.active_until : null,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
  };
}
