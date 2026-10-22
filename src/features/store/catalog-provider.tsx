import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { CatalogError, fetchCatalog, type CatalogSnapshot, type ShopProduct, type StoreProduct } from './catalog';
import type { TackCategory } from './tack-details';

type CatalogState =
  | { status: 'loading'; products: StoreProduct[]; shopProducts: ShopProduct[]; tackCategories: TackCategory[]; error: null }
  | { status: 'ready'; products: StoreProduct[]; shopProducts: ShopProduct[]; tackCategories: TackCategory[]; error: null }
  | { status: 'error'; products: StoreProduct[]; shopProducts: ShopProduct[]; tackCategories: TackCategory[]; error: CatalogError };

type CatalogContextValue = CatalogState & {
  /** Re-fetches the catalog; concurrent calls share one request. Resolves with the fresh membership products. */
  refresh: () => Promise<StoreProduct[] | null>;
  /** Same shared request; resolves with the fresh Tack Shop / Café products. */
  refreshShop: () => Promise<ShopProduct[] | null>;
  /** Re-fetches only when the last successful fetch is older than maxAgeMs — for screens that come into view. */
  refreshIfStale: (maxAgeMs?: number) => void;
  refreshing: boolean;
  findBySku: (sku: string) => StoreProduct | undefined;
  findShopBySku: (sku: string) => ShopProduct | undefined;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

/**
 * Shares one catalog fetch between the store list, product pages, the cart and
 * the checkout boundary. Mounted inside the signed-in area, so it is discarded
 * on sign-out and per-customer availability is never shown to another account.
 */
export function StoreCatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CatalogState>({ status: 'loading', products: [], shopProducts: [], tackCategories: [], error: null });
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Promise<CatalogSnapshot | null> | null>(null);
  const fetchedAt = useRef(0);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const request = fetchCatalog()
      .then((snapshot) => {
        fetchedAt.current = Date.now();
        setState({
          status: 'ready',
          products: snapshot.memberships,
          shopProducts: snapshot.shop,
          tackCategories: snapshot.tackCategories,
          error: null,
        });
        return snapshot;
      })
      .catch((error: unknown) => {
        const catalogError =
          error instanceof CatalogError ? error : new CatalogError('unavailable', "The store couldn't be loaded.");
        // Keep showing the last good catalog, if any, alongside the error.
        setState((previous) => ({
          status: 'error',
          products: previous.products,
          shopProducts: previous.shopProducts,
          tackCategories: previous.tackCategories,
          error: catalogError,
        }));
        return null;
      })
      .finally(() => {
        inFlight.current = null;
        setRefreshing(false);
      });
    inFlight.current = request;
    return request;
  }, []);

  const refresh = useCallback(() => load().then((snapshot) => snapshot?.memberships ?? null), [load]);
  const refreshShop = useCallback(() => load().then((snapshot) => snapshot?.shop ?? null), [load]);
  const refreshIfStale = useCallback(
    (maxAgeMs = 60_000) => {
      if (!inFlight.current && Date.now() - fetchedAt.current > maxAgeMs) void load();
    },
    [load]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const findBySku = useCallback((sku: string) => state.products.find((p) => p.sku === sku), [state.products]);

  const findShopBySku = useCallback((sku: string) => state.shopProducts.find((p) => p.sku === sku), [state.shopProducts]);

  const value = useMemo(
    () => ({ ...state, refresh, refreshShop, refreshIfStale, refreshing, findBySku, findShopBySku }),
    [state, refresh, refreshShop, refreshIfStale, refreshing, findBySku, findShopBySku]
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useStoreCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useStoreCatalog must be used inside <StoreCatalogProvider>.');
  return context;
}
