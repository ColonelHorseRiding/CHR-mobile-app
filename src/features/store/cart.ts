import type { ShopProduct } from './catalog';
import { variantLabel, variantPrice } from './tack-details';

/**
 * Pure cart logic for Tack Shop / Café items. The cart stores only
 * { productId, variantId, quantity }; names, prices, sizes and availability always come from the live catalog, and
 * create_order() validates and prices everything again on the server. A total shown here is an estimate for the
 * customer, never the amount charged.
 *
 * A cart line is a product, or a product AND a size/colour (variant): two sizes of the same product are two lines.
 * Memberships are not added to this cart: they keep their own one-plan checkout with its plan rules.
 */

/** create_order() accepts 1–20 of a product per order (INVALID_QUANTITY otherwise). */
export const MAX_QUANTITY = 20;

export type CartItem = { productId: string; variantId: string | null; quantity: number };

/** One cart line's identity: the product id, or "productId:variantId" for a sized line. */
export const lineKey = (item: { productId: string; variantId?: string | null }) =>
  item.variantId ? `${item.productId}:${item.variantId}` : item.productId;

export type CartLine = {
  key: string;
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  name: string;
  category: ShopProduct['category'];
  /** The first photograph's stored reference (resolved to a URL by the screen). */
  image: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type UnavailableReason = 'gone' | 'unpriced' | 'size-required' | 'size-gone' | 'out-of-stock';

export type UnavailableLine = { key: string; productId: string; name: string | null; label: string | null; reason: UnavailableReason };

const clampQty = (n: number) => Math.min(Math.max(Math.floor(n), 1), MAX_QUANTITY);

export function addItem(items: CartItem[], productId: string, quantity = 1, variantId: string | null = null): CartItem[] {
  const key = lineKey({ productId, variantId });
  const existing = items.find((i) => lineKey(i) === key);
  if (existing) {
    return items.map((i) => (lineKey(i) === key ? { ...i, quantity: Math.min(i.quantity + quantity, MAX_QUANTITY) } : i));
  }
  return [...items, { productId, variantId, quantity: clampQty(quantity) }];
}

/** Sets a line's quantity, clamped to 1–20; 0 or less removes the line. `key` is a line key. */
export function setQuantity(items: CartItem[], key: string, quantity: number): CartItem[] {
  if (quantity <= 0) return items.filter((i) => lineKey(i) !== key);
  return items.map((i) => (lineKey(i) === key ? { ...i, quantity: clampQty(quantity) } : i));
}

/** Total quantity of a product across all its sizes. */
export function quantityOfProduct(items: CartItem[], productId: string) {
  return items.filter((i) => i.productId === productId).reduce((n, i) => n + i.quantity, 0);
}

/** Why a (product, variantId) pair cannot be bought now, or null when it can. */
export function unavailableReason(product: ShopProduct | undefined, variantIdInput: string | null | undefined): UnavailableReason | null {
  const variantId = variantIdInput ?? null;
  if (!product) return 'gone';
  if (!product.isPurchasable || product.price === null) return 'unpriced';
  const variants = product.details?.variants ?? [];
  if (variantId === null) return variants.length > 0 ? 'size-required' : null;
  const variant = variants.find((v) => v.id === variantId);
  if (!variant) return 'size-gone';
  return variant.inStock ? null : 'out-of-stock';
}

/**
 * Joins the cart with the live catalog. Lines whose product vanished, is unpriced, or whose size is missing or out of
 * stock are returned separately and left out of the total — never silently swapped for a different size.
 */
export function resolveCart(items: CartItem[], catalog: ShopProduct[]) {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const lines: CartLine[] = [];
  const unavailable: UnavailableLine[] = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    const variant = (item.variantId ? product?.details?.variants.find((v) => v.id === item.variantId) : null) ?? null;
    const reason = unavailableReason(product, item.variantId);
    if (reason || !product) {
      unavailable.push({
        key: lineKey(item),
        productId: item.productId,
        name: product?.name ?? null,
        label: variant ? variantLabel(variant) : null,
        reason: reason ?? 'gone',
      });
      continue;
    }
    const unitPrice = variantPrice(product.price, variant) as number;
    lines.push({
      key: lineKey(item),
      productId: product.id,
      variantId: variant?.id ?? null,
      variantLabel: variant ? variantLabel(variant) : null,
      name: product.name,
      category: product.category,
      image: product.details?.images[0]?.url ?? null,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
    });
  }
  return {
    lines,
    unavailable,
    total: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    count: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

export function unavailableMessage(line: Pick<UnavailableLine, 'name' | 'label' | 'reason'>) {
  const what = `${line.name ?? 'An item'}${line.label ? ` (${line.label})` : ''}`;
  switch (line.reason) {
    case 'out-of-stock':
      return `${what} is out of stock.`;
    case 'size-gone':
      return `${what} is no longer offered in that size.`;
    case 'size-required':
      return `${what} needs a size. Remove it and choose a size.`;
    case 'unpriced':
      return `${what} is not available to buy right now.`;
    default:
      return `${what} is no longer available`;
  }
}

/** Lines whose price differs between what the customer saw and the fresh catalog (same size, same product). */
export function priceChanges(shown: CartLine[], fresh: ShopProduct[]) {
  const byId = new Map(fresh.map((p) => [p.id, p]));
  return shown
    .map((line) => {
      const product = byId.get(line.productId);
      const variant = (line.variantId ? product?.details?.variants.find((v) => v.id === line.variantId) : null) ?? null;
      return { line, now: product ? variantPrice(product.price, variant) : null };
    })
    .filter(({ line, now }) => now !== null && now !== line.unitPrice)
    .map(({ line, now }) => ({ name: line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name, was: line.unitPrice, now: now as number }));
}

/** The payload create_order() accepts — ids and quantities only, never prices. */
export function toOrderPayload(lines: Pick<CartLine, 'productId' | 'variantId' | 'quantity'>[]) {
  return lines.map((l) =>
    l.variantId ? { product_id: l.productId, variant_id: l.variantId, quantity: l.quantity } : { product_id: l.productId, quantity: l.quantity }
  );
}

type KeyedItem = { productId: string; variantId?: string | null; quantity: number };

/** Same items, sizes and quantities, ignoring order — used to recognise an order already placed for this cart. */
export function sameItems(a: KeyedItem[], b: KeyedItem[]) {
  if (a.length !== b.length) return false;
  const key = (x: KeyedItem[]) =>
    x
      .map((i) => `${lineKey(i)}:${i.quantity}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}
