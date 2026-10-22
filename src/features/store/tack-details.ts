/**
 * Tack Shop display details. Pure functions (no network, no React) so they can be tested on their own.
 *
 * Source of truth: the `store_tack_details()` RPC (migration 0039), which returns only PUBLISHED tack products with
 * their category, photos, specifications and active sizes. Prices and "can it be bought" still come from
 * `store_catalog()`; nothing here decides a price, and create_order() re-prices everything on the server.
 */

export type TackImage = { url: string; alt: string };

export type TackVariant = {
  id: string;
  size: string | null;
  colour: string | null;
  /** The variant's own price; null means "use the product price". */
  price: number | null;
  inStock: boolean;
};

export type TackCategory = { slug: string; name: string; description: string | null };

export type TackSpecs = {
  colour: string | null;
  material: string | null;
  fit: string | null;
  care: string | null;
  sizesNote: string | null;
  features: string[];
  extra: { label: string; value: string }[];
};

export type TackDetails = {
  id: string;
  categorySlug: string | null;
  shortDescription: string | null;
  description: string | null;
  audience: string | null;
  brand: string | null;
  compareAtPrice: number | null;
  specs: TackSpecs;
  images: TackImage[];
  variants: TackVariant[];
  sortOrder: number;
};

export type TackDetailsSnapshot = { categories: TackCategory[]; products: TackDetails[] };

export const EMPTY_TACK_DETAILS: TackDetailsSnapshot = { categories: [], products: [] };

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const positive = (v: unknown) => {
  const n = v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function listText(v: unknown): string | null {
  if (Array.isArray(v)) {
    const joined = v.map((x) => text(x)).filter((x): x is string => x !== null).join(', ');
    return joined || null;
  }
  return text(v);
}

export function parseSpecs(raw: unknown): TackSpecs {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    colour: listText(s.colour),
    material: listText(s.material),
    fit: listText(s.fit),
    care: listText(s.care),
    sizesNote: listText(s.sizes),
    features: Array.isArray(s.features) ? s.features.map((f) => text(f)).filter((f): f is string => f !== null) : [],
    extra: Array.isArray(s.extra)
      ? s.extra
          .map((e) => (e && typeof e === 'object' ? { label: text((e as Record<string, unknown>).label), value: text((e as Record<string, unknown>).value) } : null))
          .filter((e): e is { label: string; value: string } => !!e && e.label !== null && e.value !== null)
      : [],
  };
}

export function parseVariant(raw: unknown): TackVariant | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const size = text(v.size);
  const colour = text(v.colour);
  if (typeof v.id !== 'string' || (size === null && colour === null)) return null;
  return { id: v.id, size, colour, price: positive(v.price), inStock: v.in_stock !== false };
}

export function parseImages(raw: unknown): TackImage[] {
  if (!Array.isArray(raw)) return [];
  const out: TackImage[] = [];
  for (const i of raw) {
    const url = i && typeof i === 'object' ? text((i as Record<string, unknown>).url) : null;
    if (url) out.push({ url, alt: text((i as Record<string, unknown>).alt) ?? '' });
  }
  return out;
}

/** True only for the shape store_tack_details() returns. Anything else is a failed load, not "nothing is published". */
export function isTackDetailsShape(raw: unknown): boolean {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  return !!root && Array.isArray(root.products) && Array.isArray(root.categories);
}

/** Defensive: anything malformed is dropped, never guessed. */
export function parseTackDetails(raw: unknown): TackDetailsSnapshot {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const categories: TackCategory[] = [];
  for (const c of Array.isArray(root.categories) ? root.categories : []) {
    const o = c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
    const slug = text(o.slug);
    const name = text(o.name);
    if (!slug || !name || seen.has(slug)) continue; // no duplicates; server order is kept
    seen.add(slug);
    categories.push({ slug, name, description: text(o.description) });
  }
  const products: TackDetails[] = [];
  for (const p of Array.isArray(root.products) ? root.products : []) {
    const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
    if (typeof o.id !== 'string') continue;
    products.push({
      id: o.id,
      categorySlug: text(o.category_slug),
      shortDescription: text(o.short_description),
      description: text(o.description),
      audience: text(o.audience),
      brand: text(o.brand),
      compareAtPrice: positive(o.compare_at_price),
      specs: parseSpecs(o.specs),
      images: parseImages(o.images),
      variants: (Array.isArray(o.variants) ? o.variants : []).map(parseVariant).filter((v): v is TackVariant => v !== null),
      sortOrder: Number.isFinite(Number(o.sort_order)) ? Number(o.sort_order) : 0,
    });
  }
  return { categories, products };
}

// ─── Images ──────────────────────────────────────────────────────────────────────────────────────────────────

export type ImageHosts = { siteUrl: string; supabaseUrl: string | null };

const IMAGE_PATH = /^\/assests\/[A-Za-z0-9/_.-]+\.(jpe?g|png|webp)$/i;
const STORAGE_PATH = /^\/storage\/v1\/object\/public\/tack-images\/[A-Za-z0-9/_.-]+\.(jpe?g|png|webp)$/i;

function hostOf(url: string | null): string | null {
  const m = url ? /^https:\/\/([^/:?#]+)/i.exec(url) : null;
  return m ? m[1].toLowerCase() : null;
}

/**
 * Turns a stored image reference into a loadable https URL, or null when it is not one the club's backend can
 * produce. Two shapes exist (migration 0039): a path on the website ("/assests/tack/helmet.jpeg") and a public file
 * in this project's `tack-images` storage bucket (an absolute https URL). Anything else — other hosts, http,
 * data: URIs, path tricks — is refused rather than loaded.
 */
export function resolveImageUrl(stored: string, hosts: ImageHosts): string | null {
  const value = stored.trim();
  if (value.startsWith('/')) {
    if (!IMAGE_PATH.test(value) || value.includes('..')) return null;
    return `${hosts.siteUrl.replace(/\/+$/, '')}${value}`;
  }
  const m = /^https:\/\/([^/?#]+)(\/[^?#]*)$/i.exec(value);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const allowed = [hostOf(hosts.supabaseUrl)].filter((h): h is string => h !== null);
  if (!allowed.includes(host) || !STORAGE_PATH.test(m[2]) || m[2].includes('..')) return null;
  return value;
}

export type ResolvedImage = { uri: string; alt: string };

export function resolveImages(images: TackImage[], hosts: ImageHosts): ResolvedImage[] {
  const out: ResolvedImage[] = [];
  const seen = new Set<string>();
  for (const i of images) {
    const uri = resolveImageUrl(i.url, hosts);
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      out.push({ uri, alt: i.alt });
    }
  }
  return out;
}

// ─── Variants and prices (display only; the server decides the real price) ─────────────────────────────────────

export const variantLabel = (v: Pick<TackVariant, 'size' | 'colour'>) => [v.size, v.colour].filter(Boolean).join(' / ');

/** Price shown for a variant: its own price if it has one, else the product price. */
export function variantPrice(basePrice: number | null, v: TackVariant | null): number | null {
  return v?.price ?? basePrice;
}

/** For a list card: the single price, or the lowest ("From …") when sizes are priced differently. */
export function displayPrice(basePrice: number | null, variants: TackVariant[]): { amount: number | null; from: boolean } {
  const buyable = variants.filter((v) => v.inStock);
  const prices = (buyable.length ? buyable : variants).map((v) => variantPrice(basePrice, v)).filter((p): p is number => p !== null);
  if (prices.length === 0) return { amount: basePrice, from: false };
  const lowest = Math.min(...prices);
  return { amount: lowest, from: prices.some((p) => p !== lowest) };
}

/** A compare-at price is shown only when it is genuinely higher than the selling price. */
export function compareAtFor(compareAt: number | null, selling: number | null): number | null {
  return compareAt !== null && selling !== null && compareAt > selling ? compareAt : null;
}

export const needsSize = (variants: TackVariant[]) => variants.length > 0;
export const anyInStock = (variants: TackVariant[]) => variants.some((v) => v.inStock);

// ─── Categories ──────────────────────────────────────────────────────────────────────────────────────────────

/** Categories to offer as filters: the server's order, only those that have at least one product, no duplicates. */
export function usableCategories(categories: TackCategory[], products: { categorySlug: string | null }[]): TackCategory[] {
  const used = new Set(products.map((p) => p.categorySlug).filter((s): s is string => s !== null));
  return categories.filter((c) => used.has(c.slug));
}

export function filterByCategory<T extends { categorySlug: string | null }>(products: T[], slug: string | null): T[] {
  return slug ? products.filter((p) => p.categorySlug === slug) : products;
}
