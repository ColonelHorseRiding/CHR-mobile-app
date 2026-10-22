// Tack Shop catalog, images, categories, sizes, cart and checkout-payload tests (no network).
// Run from the app root: node scripts/test-tack-shop.js
const ts = require(process.cwd() + '/node_modules/typescript');
const fs = require('fs');
const compile = (file, stubs = {}) => {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp = {};
  new Function('require', 'exports', 'module', js)((id) => (id in stubs ? stubs[id] : require(id)), exp, { exports: exp });
  return exp;
};
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); };
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };

const S = 'src/features/store/';
const T = compile(S + 'tack-details.ts');
const C = compile(S + 'cart.ts', { './tack-details': T });

// ── fixtures modelled on the live catalog (19–21 Oct 2026): 4 original products + 9 breeches styles ──
const HOSTS = { siteUrl: 'https://colonelhorseriding.com', supabaseUrl: 'https://proj.supabase.co' };
const BREECHES = [
  ['TACK_BREECHES_WOMEN_NAVY', 'women-navy', 6, 8000], ['TACK_BREECHES_WOMEN_RED_BLACK', 'women-red-black', 6, 4500],
  ['TACK_BREECHES_MEN_CHARCOAL', 'men-charcoal', 6, 6000], ['TACK_BREECHES_KIDS_NAVY_PINK', 'kids-navy-pink-details', 4, 3600],
  ['TACK_BREECHES_KIDS_MAGENTA_FLORAL', 'kids-magenta-floral-cuffs', 4, 3600], ['TACK_BREECHES_KIDS_PINK', 'kids-pink', 5, 3600],
  ['TACK_BREECHES_KIDS_PURPLE', 'kids-purple', 5, 3600], ['TACK_BREECHES_KIDS_BLACK_STARS', 'kids-black-pink-stars', 3, 3600],
  ['TACK_BREECHES_KIDS_BLACK_CAMO', 'kids-black-pink-camo', 5, 3600],
];
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photos = (slug, n) => Array.from({ length: n }, (_, i) => ({ url: `/assests/tack/breeches/${slug}/${String(i).padStart(2, '0')}.jpg`, alt: `${slug} ${i + 1}` }));
const products = [
  { id: uid(1), sku: 'TACK_HELMET', name: 'Helmet', price: 2500, slug: 'helmets', images: [{ url: '/assests/tack/helmet.jpeg', alt: 'Riding helmet' }] },
  { id: uid(2), sku: 'TACK_CHAPS', name: 'Chaps', price: 2500, slug: 'chaps', images: [{ url: '/assests/tack/chaps.webp', alt: 'Chaps' }] },
  { id: uid(3), sku: 'TACK_HALF_BOOTS', name: 'Half Boots', price: 3500, slug: 'half-boots', images: [{ url: '/assests/tack/half-boots.jpg', alt: 'Half boots' }] },
  { id: uid(4), sku: 'TACK_FULL_BOOTS', name: 'Full Boots', price: 7000, slug: 'full-boots', images: [{ url: '/assests/tack/full-boots-web.jpg', alt: 'Full boots' }] },
  ...BREECHES.map(([sku, slug, n, price], i) => ({ id: uid(10 + i), sku, name: sku.replace('TACK_BREECHES_', 'Breeches '), price, slug: 'breeches', images: photos(slug, n) })),
];
const catalogRows = (list) => list.map((p, i) => ({ id: p.id, sku: p.sku, category: 'tack', name: p.name, description: null, price: p.price, currency: 'INR', fulfillment: 'IN_STORE_ONLY', is_purchasable: p.price !== null, sort_order: i }));
const detailRows = (list, extra = {}) => list.map((p, i) => ({ id: p.id, sku: p.sku, category_slug: p.slug, short_description: `${p.name} short`, description: `${p.name} long`, audience: null, brand: null, compare_at_price: null, specs: {}, images: p.images, variants: [], sort_order: i, ...(extra[p.sku] ?? {}) }));
const categories = [
  { id: 'c1', slug: 'helmets', name: 'Helmets', description: null }, { id: 'c2', slug: 'breeches', name: 'Breeches', description: null },
  { id: 'c3', slug: 'chaps', name: 'Chaps', description: null }, { id: 'c4', slug: 'half-boots', name: 'Half Boots', description: null },
  { id: 'c5', slug: 'full-boots', name: 'Full Boots', description: null }, { id: 'c6', slug: 'accessories', name: 'Riding Accessories', description: null },
];

// ── a fake Supabase for fetchCatalog ──
let rpcReply = {};
const rpcCalls = [];
const fakeSupabase = { rpc: (fn, args) => { rpcCalls.push([fn, args]); const r = typeof rpcReply[fn] === 'function' ? rpcReply[fn](args) : rpcReply[fn] ?? { data: null, error: null }; return { abortSignal: () => Promise.resolve(r) }; } };
const CAT = compile(S + 'catalog.ts', { '@/services/supabase/client': { supabase: fakeSupabase }, './tack-details': T });
const load = async (rows, details, extra) => { rpcReply = { store_catalog: { data: rows, error: null }, store_tack_details: details === 'fail' ? { data: null, error: { message: 'function does not exist' } } : { data: { categories, products: detailRows(details ?? products, extra) }, error: null } }; return CAT.fetchCatalog(); };

(async () => {
  // ── catalog: every product, dynamic images, descriptions ──
  const snap = await load(catalogRows(products));
  eq('catalog: all 13 tack products load (helmet, chaps, half boots, full boots, 9 breeches)', snap.shop.length, 13);
  eq('catalog: all nine breeches styles present', snap.shop.filter((p) => p.sku.startsWith('TACK_BREECHES_')).length, 9);
  ok('catalog: every product carries its OWN primary image from the data', snap.shop.every((p) => p.details.images[0].url === products.find((x) => x.id === p.id).images[0].url));
  ok('catalog: no two breeches share a primary image', new Set(snap.shop.filter((p) => p.sku.startsWith('TACK_BREECHES_')).map((p) => p.details.images[0].url)).size === 9);
  eq('catalog: gallery photos kept in order (women-navy has 6)', snap.shop.find((p) => p.sku === 'TACK_BREECHES_WOMEN_NAVY').details.images.map((i) => i.url.slice(-6)), ['00.jpg', '01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg']);
  eq('catalog: descriptions come from the data', [snap.shop[0].details.shortDescription, snap.shop[0].details.description], ['Helmet short', 'Helmet long']);
  eq('catalog: categories in server order', snap.tackCategories.map((c) => c.slug), ['helmets', 'breeches', 'chaps', 'half-boots', 'full-boots', 'accessories']);
  eq('catalog: both RPCs called, read-only (no order/payment function)', rpcCalls.slice(-2).map((c) => c[0]).sort(), ['store_catalog', 'store_tack_details']);

  // ── visibility: archived/unpublished never shown ──
  const withoutArchived = await load(catalogRows(products), products.filter((p) => p.sku !== 'TACK_CHAPS'));
  ok('visibility: a product the details omit (unpublished / category off) is hidden when details loaded', !withoutArchived.shop.some((p) => p.sku === 'TACK_CHAPS') && withoutArchived.shop.length === 12);
  const archivedGeneric = await load(catalogRows(products)); // store_catalog() itself omits inactive rows; TACK_BREECHES is archived so absent
  ok('visibility: the archived generic TACK_BREECHES is not in the data and not invented', !archivedGeneric.shop.some((p) => p.sku === 'TACK_BREECHES'));
  const noDetails = await load(catalogRows(products), 'fail');
  ok('details unavailable: shop still opens, products listed without photos/sizes (not hidden, not crashing)', noDetails.shop.length === 13 && noDetails.shop.every((p) => p.details === null) && noDetails.tackCategories.length === 0);
  const noImage = await load(catalogRows(products), products, { TACK_CHAPS: { images: [] } });
  eq('missing image: product kept, no images (placeholder, never another product\'s photo)', noImage.shop.find((p) => p.sku === 'TACK_CHAPS').details.images, []);
  const unpriced = await load([...catalogRows(products), { ...catalogRows([{ id: uid(99), sku: 'TACK_NEW', name: 'New', price: null }])[0] }], [...products, { id: uid(99), sku: 'TACK_NEW', name: 'New', price: null, slug: 'accessories', images: [] }]);
  const np = unpriced.shop.find((p) => p.sku === 'TACK_NEW');
  ok('unpriced product: listed but not purchasable, price null', np && np.price === null && np.isPurchasable === false);
  const cafe = await load([...catalogRows(products), { id: uid(50), sku: 'CAFE_X', category: 'cafe', name: 'Tea', price: 25, is_purchasable: true, sort_order: 99 }]);
  ok('cafe item unaffected: no tack details attached', cafe.shop.find((p) => p.sku === 'CAFE_X').details === null);

  const garbled = await load(catalogRows(products), 'fail');
  rpcReply.store_tack_details = { data: { unexpected: true }, error: null };
  const malformed = await CAT.fetchCatalog();
  ok('malformed details reply = failed load (products NOT hidden as if nothing were published)', malformed.shop.length === 13 && malformed.shop.every((p) => p.details === null));
  rpcReply.store_tack_details = { data: { categories: [], products: [] }, error: null };
  eq('a well-formed EMPTY details reply (nothing published) hides all tack products', (await CAT.fetchCatalog()).shop.length, 0);
  eq('legacy cart item without variantId behaves as no size', C.resolveCart([{ productId: uid(1), quantity: 1 }], (await load(catalogRows(products))).shop).lines.length, 1);

  // ── disabled category (backend 0041: store_catalog() omits the product; store_tack_details() omits it and its category) ──
  const helmetOnly = products.filter((p) => p.sku !== 'TACK_HELMET');
  const catsOff = categories.filter((c) => c.slug !== 'helmets');
  rpcReply = { store_catalog: { data: catalogRows(helmetOnly), error: null }, store_tack_details: { data: { categories: catsOff, products: detailRows(helmetOnly) }, error: null } };
  const off = await CAT.fetchCatalog();
  ok('disabled category: its product is not shown and its button is gone', !off.shop.some((p) => p.sku === 'TACK_HELMET') && !T.usableCategories(off.tackCategories, off.shop.map((p) => ({ categorySlug: p.details.categorySlug }))).some((c) => c.slug === 'helmets'));
  eq('disabled category: a helmet already in the cart is held back (gone), not totalled', [C.resolveCart([{ productId: uid(1), variantId: null, quantity: 1 }], off.shop).unavailable.map((u) => u.reason), C.resolveCart([{ productId: uid(1), variantId: null, quantity: 1 }], off.shop).total], [['gone'], 0]);
  // old backend (0041 not applied): store_catalog still lists the helmet but the details omit it → the app still hides it
  rpcReply = { store_catalog: { data: catalogRows(products), error: null }, store_tack_details: { data: { categories: catsOff, products: detailRows(helmetOnly) }, error: null } };
  ok('disabled category, backend not yet updated: the app still hides it', !(await CAT.fetchCatalog()).shop.some((p) => p.sku === 'TACK_HELMET'));
  const reon = await load(catalogRows(products));
  const h2 = reon.shop.find((p) => p.sku === 'TACK_HELMET');
  ok('re-enabled: same id, same price, purchasable again, with its photo', h2 && h2.id === uid(1) && h2.price === 2500 && h2.isPurchasable && h2.details.images.length === 1);

  // ── a brand-new product added through Admin appears with no code change ──
  const newId = uid(77);
  const added = await load([...catalogRows(products), ...catalogRows([{ id: newId, sku: 'TACK_BRAND_NEW', name: 'Brand New Gloves', price: 999 }])],
    [...products, { id: newId, sku: 'TACK_BRAND_NEW', name: 'x', price: 999, slug: 'accessories', images: [{ url: 'https://proj.supabase.co/storage/v1/object/public/tack-images/new/gloves.webp', alt: 'Gloves' }] }]);
  const g = added.shop.find((p) => p.sku === 'TACK_BRAND_NEW');
  ok('new admin product: shows its uploaded storage photo with no code change', g && T.resolveImages(g.details.images, HOSTS)[0].uri === 'https://proj.supabase.co/storage/v1/object/public/tack-images/new/gloves.webp');

  // ── image URL resolution ──
  eq('image: site path → website URL', T.resolveImageUrl('/assests/tack/helmet.jpeg', HOSTS), 'https://colonelhorseriding.com/assests/tack/helmet.jpeg');
  eq('image: nested breeches path', T.resolveImageUrl('/assests/tack/breeches/men-charcoal/00.jpg', HOSTS), 'https://colonelhorseriding.com/assests/tack/breeches/men-charcoal/00.jpg');
  eq('image: own storage bucket accepted', T.resolveImageUrl('https://proj.supabase.co/storage/v1/object/public/tack-images/a/b.jpg', HOSTS), 'https://proj.supabase.co/storage/v1/object/public/tack-images/a/b.jpg');
  eq('image: site URL trailing slash tolerated', T.resolveImageUrl('/assests/tack/a.jpg', { ...HOSTS, siteUrl: 'https://colonelhorseriding.com/' }), 'https://colonelhorseriding.com/assests/tack/a.jpg');
  eq('image: refused — other host, http, data:, traversal, other bucket, non-image, javascript:', [
    'https://evil.example/storage/v1/object/public/tack-images/a.jpg', 'http://proj.supabase.co/storage/v1/object/public/tack-images/a.jpg', 'data:image/png;base64,AAAA',
    '/assests/../secret.jpg', '/assests/tack/x.svg', 'https://proj.supabase.co/storage/v1/object/public/other-bucket/a.jpg', 'https://proj.supabase.co/storage/v1/object/public/tack-images/../x.jpg', 'javascript:alert(1)', '', '//evil.example/a.jpg',
  ].map((u) => T.resolveImageUrl(u, HOSTS)), Array(10).fill(null));
  eq('image: duplicates and bad entries dropped', T.resolveImages([{ url: '/assests/tack/a.jpg', alt: 'A' }, { url: '/assests/tack/a.jpg', alt: 'A2' }, { url: 'data:x', alt: '' }], HOSTS).length, 1);
  eq('parseImages: malformed input is empty', [T.parseImages(null), T.parseImages('x'), T.parseImages([{ alt: 'no url' }, 5])], [[], [], []]);

  // ── categories ──
  const items = snap.shop.map((p) => ({ categorySlug: p.details.categorySlug, name: p.name }));
  eq('categories: only those with products are offered (accessories is empty → hidden)', T.usableCategories(snap.tackCategories, items).map((c) => c.slug), ['helmets', 'breeches', 'chaps', 'half-boots', 'full-boots']);
  eq('categories: filter breeches → 9', T.filterByCategory(items, 'breeches').length, 9);
  eq('categories: null returns to all products', T.filterByCategory(items, null).length, 13);
  eq('categories: a category with no products yields an empty list', T.filterByCategory(items, 'accessories').length, 0);
  eq('categories: admin renames/reorders/disables → list follows the data', T.usableCategories([{ slug: 'full-boots', name: 'Tall Boots', description: null }, { slug: 'helmets', name: 'Helmets', description: null }], items).map((c) => c.name), ['Tall Boots', 'Helmets']);
  eq('categories: duplicates in the data are removed', T.parseTackDetails({ categories: [{ slug: 'a', name: 'A' }, { slug: 'a', name: 'A again' }, { slug: '', name: 'x' }], products: [] }).categories.length, 1);

  // ── specs ──
  const sp = T.parseSpecs({ colour: 'Navy', sizes: ['S', 'M'], material: ' ', fit: 'Slim', care: 'Machine wash', features: ['Grip seat', '', 'Pockets'], extra: [{ label: 'Brand', value: 'X' }, { label: 'Empty', value: '' }] });
  eq('specs: values shown, empties dropped, arrays joined', [sp.colour, sp.sizesNote, sp.material, sp.fit, sp.care, sp.features, sp.extra], ['Navy', 'S, M', null, 'Slim', 'Machine wash', ['Grip seat', 'Pockets'], [{ label: 'Brand', value: 'X' }]]);
  eq('specs: nothing invented for a product without specs', T.parseSpecs(undefined), { colour: null, material: null, fit: null, care: null, sizesNote: null, features: [], extra: [] });

  // ── sizes / variants ──
  const V = (id, size, price, inStock = true) => ({ id, size, colour: null, price, inStock });
  const sizedDetails = { TACK_CHAPS: { variants: [{ id: 'v-s', size: 'S', colour: null, price: null, in_stock: true }, { id: 'v-m', size: 'M', colour: null, price: 2800, in_stock: true }, { id: 'v-l', size: 'L', colour: null, price: null, in_stock: false }, { id: 'v-bad', size: null, colour: null, price: 1, in_stock: true }], compare_at_price: 3000 },
    TACK_HELMET: { variants: [] } };
  const sized = await load(catalogRows(products), products, sizedDetails);
  const chaps = sized.shop.find((p) => p.sku === 'TACK_CHAPS');
  eq('variants: parsed with own price and stock; a variant with no label is dropped', chaps.details.variants.map((v) => [v.id, v.size, v.price, v.inStock]), [['v-s', 'S', null, true], ['v-m', 'M', 2800, true], ['v-l', 'L', null, false]]);
  eq('variant price: own price when set, else the product price', [T.variantPrice(2500, chaps.details.variants[0]), T.variantPrice(2500, chaps.details.variants[1]), T.variantPrice(2500, null)], [2500, 2800, 2500]);
  eq('list price: "From" the lowest in-stock price when sizes differ', T.displayPrice(2500, chaps.details.variants), { amount: 2500, from: true });
  eq('list price: single price when all the same / no sizes', [T.displayPrice(2500, []), T.displayPrice(2500, [V('a', 'S', null), V('b', 'M', 2500)])], [{ amount: 2500, from: false }, { amount: 2500, from: false }]);
  eq('compare-at: shown only when genuinely higher than the price', [T.compareAtFor(3000, 2500), T.compareAtFor(2500, 2500), T.compareAtFor(2000, 2500), T.compareAtFor(null, 2500), T.compareAtFor(3000, null)], [3000, null, null, null, null]);
  eq('compare-at: a non-positive/invalid value is ignored', T.parseTackDetails({ products: [{ id: 'x', compare_at_price: 0 }, { id: 'y', compare_at_price: 'abc' }] }).products.map((p) => p.compareAtPrice), [null, null]);
  ok('needsSize / anyInStock', T.needsSize(chaps.details.variants) && !T.needsSize([]) && T.anyInStock(chaps.details.variants) && !T.anyInStock([V('a', 'S', null, false)]));
  eq('variantLabel', [T.variantLabel({ size: 'M', colour: 'Navy' }), T.variantLabel({ size: 'M', colour: null }), T.variantLabel({ size: null, colour: 'Red' })], ['M / Navy', 'M', 'Red']);

  // ── cart: lines, sizes, merging ──
  const helmet = sized.shop.find((p) => p.sku === 'TACK_HELMET');
  const shop = sized.shop;
  let cart = [];
  cart = C.addItem(cart, helmet.id);
  eq('cart: product without sizes works as before', C.resolveCart(cart, shop).lines.map((l) => [l.name, l.unitPrice, l.quantity, l.variantId]), [['Helmet', 2500, 1, null]]);
  cart = C.addItem(cart, chaps.id, 1, 'v-s');
  cart = C.addItem(cart, chaps.id, 1, 'v-m');
  eq('cart: two sizes of the same product stay separate lines', cart.filter((i) => i.productId === chaps.id).length, 2);
  cart = C.addItem(cart, chaps.id, 1, 'v-s');
  eq('cart: the same size adds to its own line', cart.find((i) => i.variantId === 'v-s').quantity, 2);
  const rc = C.resolveCart(cart, shop);
  eq('cart: selected size and its price are kept per line', rc.lines.filter((l) => l.productId === chaps.id).map((l) => [l.variantLabel, l.unitPrice, l.quantity, l.lineTotal]), [['S', 2500, 2, 5000], ['M', 2800, 1, 2800]]);
  eq('cart: total/count use variant prices', [rc.total, rc.count], [2500 + 5000 + 2800, 4]);
  eq('cart: line image reference is the product\'s own first photo', rc.lines.find((l) => l.productId === helmet.id).image, '/assests/tack/helmet.jpeg');
  eq('cart: setQuantity targets one line; 0 removes it', [C.setQuantity(cart, C.lineKey({ productId: chaps.id, variantId: 'v-m' }), 0).length, C.setQuantity(cart, chaps.id + ':v-s', 5).find((i) => i.variantId === 'v-s').quantity], [2, 5]);
  eq('cart: quantity capped at 20 (server limit)', C.addItem([{ productId: 'p', variantId: null, quantity: 19 }], 'p', 5)[0].quantity, 20);

  // ── cart: unavailable states, never swapped ──
  const reasons = (items, list = shop) => C.resolveCart(items, list).unavailable.map((u) => u.reason);
  eq('cart: sized product with no size chosen is held back (size-required), not defaulted', reasons([{ productId: chaps.id, variantId: null, quantity: 1 }]), ['size-required']);
  eq('cart: out-of-stock size is held back, not swapped for another', reasons([{ productId: chaps.id, variantId: 'v-l', quantity: 1 }]), ['out-of-stock']);
  eq('cart: a size the club removed is held back (size-gone)', reasons([{ productId: chaps.id, variantId: 'v-deleted', quantity: 1 }]), ['size-gone']);
  eq('cart: a product no longer published/listed is held back (gone) and not totalled', [reasons([{ productId: 'missing', variantId: null, quantity: 1 }]), C.resolveCart([{ productId: 'missing', variantId: null, quantity: 1 }], shop).total], [['gone'], 0]);
  eq('cart: an unpriced product is held back', reasons([{ productId: np.id, variantId: null, quantity: 1 }], unpriced.shop), ['unpriced']);
  ok('cart: messages name the product and size', C.unavailableMessage({ name: 'Chaps', label: 'L', reason: 'out-of-stock' }) === 'Chaps (L) is out of stock.' && /needs a size/.test(C.unavailableMessage({ name: 'Chaps', label: null, reason: 'size-required' })));

  // ── price refresh ──
  const lines0 = C.resolveCart([{ productId: chaps.id, variantId: 'v-m', quantity: 1 }, { productId: helmet.id, variantId: null, quantity: 1 }], shop).lines;
  const repriced = await load(catalogRows(products).map((r) => (r.sku === 'TACK_HELMET' ? { ...r, price: 2600 } : r)), products, { TACK_CHAPS: { variants: [{ id: 'v-m', size: 'M', price: 2900, in_stock: true }] } });
  eq('stale price detected per product and per size', C.priceChanges(lines0, repriced.shop), [{ name: 'Chaps (M)', was: 2800, now: 2900 }, { name: 'Helmet', was: 2500, now: 2600 }]);
  eq('no change → no warning', C.priceChanges(lines0, shop), []);

  // ── order payload: ids and quantities only, never prices ──
  const payload = C.toOrderPayload(lines0);
  eq('payload: product_id/variant_id/quantity only', payload, [{ product_id: chaps.id, variant_id: 'v-m', quantity: 1 }, { product_id: helmet.id, quantity: 1 }]);
  ok('payload: contains no price or amount key (client cannot override the server price)', !JSON.stringify(payload).match(/price|amount|total/i));
  const tamper = C.toOrderPayload([{ productId: helmet.id, variantId: null, quantity: 1, unitPrice: 1, price: 1, lineTotal: 1 }]);
  ok('payload: even a tampered line object cannot smuggle a price', JSON.stringify(tamper) === JSON.stringify([{ product_id: helmet.id, quantity: 1 }]));
  ok('sameItems distinguishes sizes and ignores order', !C.sameItems([{ productId: 'p', variantId: 'a', quantity: 1 }], [{ productId: 'p', variantId: 'b', quantity: 1 }]) && C.sameItems([{ productId: 'p', variantId: 'a', quantity: 1 }, { productId: 'q', quantity: 2 }], [{ productId: 'q', variantId: null, quantity: 2 }, { productId: 'p', variantId: 'a', quantity: 1 }]));

  // ── checkout API: create_order call + server rejections ──
  let orderReply = { data: [{ order_id: 'o1', payment_id: 'p1', total_amount: 2800, amount_due: 2800, currency: 'INR' }], error: null };
  const orderCalls = [];
  const db = { rpc: (fn, args) => { orderCalls.push([fn, args]); return { abortSignal: () => Promise.resolve(orderReply) }; }, from: () => { throw new Error('unexpected'); } };
  const P = compile(S + '../checkout/payments-api.ts', { '@supabase/supabase-js': { FunctionsFetchError: class {}, FunctionsHttpError: class {}, FunctionsRelayError: class {} }, '@/services/supabase/client': { supabase: db }, '@/features/store/cart': C });
  const o = await P.createCartOrder([{ productId: chaps.id, variantId: 'v-m', quantity: 1 }]);
  eq('checkout: create_order receives the selected variant id', orderCalls[0], ['create_order', { p_items: [{ product_id: chaps.id, variant_id: 'v-m', quantity: 1 }] }]);
  eq('checkout: the amount comes from the server row, not from the client', o.amountDue, 2800);
  const reject = async (message, details) => { orderReply = { data: null, error: { message, details } }; try { await P.createCartOrder([{ productId: chaps.id, variantId: 'v-m', quantity: 1 }]); return null; } catch (e) { return { kind: e.kind, message: e.message, code: e.code }; } };
  let r = await reject('VARIANT_REQUIRED', 'Choose a size or colour for Chaps.');
  ok('rejection: size required → server\'s own explanation, not "Something went wrong"', r.kind === 'unavailable' && r.message === 'Choose a size or colour for Chaps.' && r.code === 'VARIANT_REQUIRED');
  r = await reject('OUT_OF_STOCK', 'Chaps (L) is out of stock.');
  ok('rejection: out of stock names the size', r.message === 'Chaps (L) is out of stock.' && r.kind === 'unavailable');
  r = await reject('VARIANT_UNAVAILABLE', null);
  ok('rejection: invalid size → clear instruction, no generic text', /update your selection/.test(r.message) && !/Something went wrong/.test(r.message));
  r = await reject('PRODUCT_UNAVAILABLE', null);
  ok('rejection: archived/unpublished product', r.kind === 'unavailable' && /no longer on sale/.test(r.message));
  r = await reject('PRICE_NOT_SET', 'New is not available to buy yet.');
  ok('rejection: unpriced product', r.message === 'New is not available to buy yet.' && r.kind === 'unavailable');
  r = await reject('Failed to fetch', null);
  ok('rejection: network failure is distinguished', r.kind === 'network');
  ok('cart screen refreshes the catalog after an "unavailable" rejection', /known\.kind === 'unavailable'\) void catalog\.refreshShop/.test(fs.readFileSync('src/features/checkout/cart-screen.tsx', 'utf8')));

  // ── no hard-coded product photographs remain ──
  const pres = fs.readFileSync(S + 'shop-presentation.ts', 'utf8');
  ok('no hardcoded SKU → photo mapping remains in the app', !/require\(/.test(pres) && !/TACK_/.test(pres));
  const card = fs.readFileSync(S + 'components/shop-card.tsx', 'utf8');
  ok('shop card reads images from product data', /details/.test(card) && !/shopPhotoFor/.test(card));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
