import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/features/auth/auth-provider';

import { addItem, quantityOfProduct, setQuantity, type CartItem } from './cart';

type CartContextValue = {
  items: CartItem[];
  /** Quantity of a product across all its sizes. */
  quantityOf: (productId: string) => number;
  /** Adds one of a product, or of one size of it (variantId). */
  add: (productId: string, variantId?: string | null) => void;
  /** `key` is a cart line key (see lineKey). */
  setQty: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/**
 * The customer's Tack Shop / Café cart, in memory only. It belongs to the
 * signed-in user: a different account always starts with an empty cart, and
 * the provider is discarded on sign-out with the rest of the signed-in area.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [cart, setCart] = useState<{ userId: string | null; items: CartItem[] }>({ userId, items: [] });
  const items = useMemo(() => (cart.userId === userId ? cart.items : []), [cart, userId]);

  const update = useCallback(
    (next: (items: CartItem[]) => CartItem[]) =>
      setCart((c) => ({ userId, items: next(c.userId === userId ? c.items : []) })),
    [userId]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      quantityOf: (productId) => quantityOfProduct(items, productId),
      add: (productId, variantId = null) => update((current) => addItem(current, productId, 1, variantId)),
      setQty: (key, quantity) => update((current) => setQuantity(current, key, quantity)),
      remove: (key) => update((current) => setQuantity(current, key, 0)),
      clear: () => update(() => []),
    }),
    [items, update]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>.');
  return context;
}
