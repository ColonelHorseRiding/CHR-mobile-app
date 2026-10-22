// Shop contract tests (originally Phase 8; updated for the Tack Shop catalog integration):  cart, catalog mapping, order labels and the cart order
// contract against a stubbed Supabase client (no network). Run from the app root.
const ts = require(process.cwd() + '/node_modules/typescript');
const fs = require('fs');
const compile = (file, stubs) => {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exp = {};
  new Function('require', 'exports', 'module', js)((id) => (id in stubs ? stubs[id] : require(id)), exp, { exports: exp });
  return exp;
};
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

// ─── cart ───────────────────────────────────────────────────────────────────
const TD = compile('src/features/store/tack-details.ts', {});
const C = compile('src/features/store/cart.ts', { './tack-details': TD });
const p = (id, price, o = {}) => ({ id, sku: id, category: 'tack', name: id.toUpperCase(), description: null, price, currency: 'INR', fulfillment: 'IN_STORE_ONLY', isPurchasable: price !== null, sortOrder: 0, ...o });
const cat = [p('helmet', 2500), p('chaps', 2500), p('boots', 7000), p('water', null)];
let items = C.addItem([], 'helmet');
items = C.addItem(items, 'helmet');
items = C.addItem(items, 'chaps');
eq('add twice merges quantity', items, [{ productId: 'helmet', variantId: null, quantity: 2 }, { productId: 'chaps', variantId: null, quantity: 1 }]); // intentional: cart lines now carry a size (variantId)
eq('quantity capped at 20', C.setQuantity(items, 'helmet', 50)[0].quantity, 20);
eq('add capped at 20', C.addItem([{ productId: 'helmet', quantity: 20 }], 'helmet')[0].quantity, 20);
eq('0 removes line', C.setQuantity(items, 'chaps', 0), [{ productId: 'helmet', variantId: null, quantity: 2 }]);
const r = C.resolveCart(items, cat);
eq('resolve totals from catalog prices', [r.total, r.count, r.lines.map((l) => l.lineTotal)], [7500, 3, [5000, 2500]]);
const r2 = C.resolveCart([{ productId: 'water', quantity: 1 }, { productId: 'gone', quantity: 1 }, { productId: 'boots', quantity: 1 }], cat);
eq('unpriced and vanished lines excluded, flagged', [r2.total, r2.unavailable.map((u) => u.productId)], [7000, ['water', 'gone']]);
eq('price change detected', C.priceChanges(r.lines, [p('helmet', 2600), p('chaps', 2500)]), [{ name: 'HELMET', was: 2500, now: 2600 }]);
eq('no change -> none', C.priceChanges(r.lines, cat).length, 0);
eq('payload has ids and quantities only', C.toOrderPayload(r.lines), [{ product_id: 'helmet', quantity: 2 }, { product_id: 'chaps', quantity: 1 }]);
eq('sameItems ignores order', C.sameItems([{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }], [{ productId: 'b', quantity: 2 }, { productId: 'a', quantity: 1 }]), true);
eq('sameItems detects qty diff', C.sameItems([{ productId: 'a', quantity: 1 }], [{ productId: 'a', quantity: 2 }]), false);

// ─── order labels ───────────────────────────────────────────────────────────
const L = compile('src/features/orders/order-labels.ts', {});
const o = (status, payment, hasInStore = true) => ({ status, payment, hasInStore, items: [] });
eq('paid only when payment success', L.paymentLabel(o('paid', { status: 'success' })).label, 'Paid');
eq('pending + created -> awaiting', L.paymentLabel(o('pending', { status: 'created' })).label, 'Awaiting payment');
eq('expired -> not paid', L.paymentLabel(o('cancelled', { status: 'expired' })).label, 'Not paid');
eq('failed', L.paymentLabel(o('failed', { status: 'failed' })).label, 'Payment failed');
eq('success on cancelled order -> refund due', L.paymentLabel(o('cancelled', { status: 'success' })).label, 'Paid · refund due');
eq('mismatch -> under review', L.paymentLabel(o('pending', { status: 'created', underReview: true })).label, 'Under review');
eq('paid is NOT collected', L.collectionLabel(o('paid', { status: 'success' })).label, 'Not ready to collect yet');
eq('ready', L.collectionLabel(o('ready_for_collection')).label, 'Ready to collect in store');
eq('collected', L.collectionLabel(o('collected')).label, 'Collected');
eq('membership order has no collection', L.collectionLabel(o('paid', null, false)), null);
eq('items line', L.itemsLine({ items: [{ name: 'Helmet', quantity: 2 }, { name: 'Chaps', quantity: 1 }] }), 'Helmet × 2, Chaps');

// ─── stubbed client ─────────────────────────────────────────────────────────
let next;
const queue = [];
const calls = [];
const builder = () => {
  const b = { then: (res, rej) => Promise.resolve(queue.length ? queue.shift() : next).then(res, rej) };
  for (const fn of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'range', 'abortSignal', 'maybeSingle', 'match']) {
    b[fn] = (...args) => { calls.push([fn, ...args.filter((a) => !(a && a.aborted !== undefined))]); return b; };
  }
  return b;
};
const supabase = {
  rpc: (n, a) => { calls.push(['rpc', n, a]); return builder(); },
  from: (t) => { calls.push(['from', t]); return builder(); },
  functions: { invoke: async () => ({ data: null, error: null }) },
};
const clientStub = { '@/services/supabase/client': { supabase } };

// catalog mapping
const Cat = compile('src/features/store/catalog.ts', { ...clientStub, './tack-details': TD });
(async () => {
  next = {
    data: [
      { id: 'm1', sku: 'MEM_GOLD', category: 'membership', name: 'Gold', price: 15000, currency: 'INR', class_credits: 8, validity_days: 30, reschedules_allowed: 2, is_purchasable: true, sort_order: 2, plan_code: 'GOLD' },
      { id: 't2', sku: 'TACK_HELMET', category: 'tack', name: 'Helmet', description: '', price: 2500, currency: 'INR', fulfillment: 'IN_STORE_ONLY', is_purchasable: true, sort_order: 2 },
      { id: 't1', sku: 'TACK_BREECHES', category: 'tack', name: 'Breeches', description: 'Stretch', price: '4000.00', currency: 'INR', fulfillment: 'IN_STORE_ONLY', is_purchasable: true, sort_order: 1 },
      { id: 'c1', sku: 'CAFE_WATER', category: 'cafe', name: 'Water', price: null, fulfillment: 'IN_STORE_ONLY', is_purchasable: true, sort_order: 7 },
    ],
    error: null,
  };
  const snap = await Cat.fetchCatalog();
  eq('memberships still mapped', snap.memberships.map((m) => m.sku), ['MEM_GOLD']);
  eq('tack sorted, price parsed, empty description -> null', snap.shop.filter((s) => s.category === 'tack').map((s) => [s.sku, s.price, s.description]), [['TACK_BREECHES', 4000, 'Stretch'], ['TACK_HELMET', 2500, null]]);
  eq('unpriced cafe item not purchasable (never guessed)', snap.shop.find((s) => s.sku === 'CAFE_WATER'), { id: 'c1', sku: 'CAFE_WATER', category: 'cafe', name: 'Water', description: null, price: null, currency: 'INR', fulfillment: 'IN_STORE_ONLY', isPurchasable: false, sortOrder: 7, details: null }); // intentional: shop products now carry display details (null for cafe)
  eq('fetchMembershipCatalog unchanged contract', (await Cat.fetchMembershipCatalog()).length, 1);

  // payments-api cart functions
  const P = compile('src/features/checkout/payments-api.ts', { ...clientStub, '@/features/store/cart': C, '@supabase/supabase-js': { FunctionsFetchError: class {}, FunctionsHttpError: class {}, FunctionsRelayError: class {} } });
  const items2 = [{ productId: 't2', quantity: 2 }, { productId: 't1', quantity: 1 }];
  calls.length = 0;
  next = { data: [{ order_id: 'o1', payment_id: 'p1', total_amount: 9000, currency: 'INR', wallet_applied: 0, amount_due: 9000 }], error: null };
  const created = await P.createCartOrder(items2);
  eq('create sends ids+quantities only', calls.find((c) => c[0] === 'rpc'), ['rpc', 'create_order', { p_items: [{ product_id: 't2', quantity: 2 }, { product_id: 't1', quantity: 1 }] }]);
  eq('amount comes from server', [created.orderId, created.paymentId, created.amountDue], ['o1', 'p1', 9000]);

  const errOf = async (pr) => { try { await pr; return null; } catch (e) { return { kind: e.kind, message: e.message }; } };
  for (const [code, kind] of [['PRODUCT_UNAVAILABLE', 'unavailable'], ['PRICE_NOT_SET', 'unavailable'], ['INVALID_QUANTITY', 'unavailable'], ['EMPTY_CART', 'unavailable'], ['TOO_MANY_PENDING_ORDERS', 'rate-limited'], ['Not authenticated', 'session']]) {
    next = { data: null, error: { message: code, details: null } };
    eq(`create ${code} -> ${kind}`, (await errOf(P.createCartOrder(items2))).kind, kind);
  }
  next = { data: null, error: { message: 'PRICE_NOT_SET', details: 'Water is not available to buy yet.' } };
  eq('server detail shown', (await errOf(P.createCartOrder(items2))).message, 'Water is not available to buy yet.');

  // reuse an identical unpaid order (any item order), only at the same server amount
  const pendingRow = (amount, qty = 2) => ({ id: 'o9', status: 'pending', created_at: 'x', order_items: [{ product_id: 't1', quantity: 1 }, { product_id: 't2', quantity: qty }], payments: [{ id: 'p9', status: 'created', amount, currency: 'INR' }] });
  next = { data: [pendingRow(9000)], error: null };
  eq('reuses identical unpaid order', (await P.findReusableCartOrder(items2, 9000))?.orderId, 'o9');
  next = { data: [pendingRow(9500)], error: null };
  eq('different amount not reused', await P.findReusableCartOrder(items2, 9000), null);
  next = { data: [pendingRow(9000, 3)], error: null };
  eq('different quantities not reused', await P.findReusableCartOrder(items2, 9000), null);

  // lost reply on create -> look again before anything else (no blind second create)
  calls.length = 0;
  queue.push({ data: [], error: null }); // first lookup: nothing
  queue.push({ data: null, error: { message: 'TypeError: Network request failed' } }); // create: unknown outcome
  queue.push({ data: [pendingRow(9000)], error: null }); // second lookup finds it
  const prepared = await P.prepareCartOrder(items2, 9000);
  eq('lost reply reconciled to the created order', [prepared.orderId, prepared.reused], ['o9', true]);
  eq('only one create_order call was made', calls.filter((c) => c[0] === 'rpc' && c[1] === 'create_order').length, 1);

  // order-status: new fields, paid != collected
  const S = compile('src/features/checkout/order-status.ts', { ...clientStub, './payments-api': P });
  next = {
    data: {
      id: 'o1', status: 'paid', total_amount: 9000, currency: 'INR', has_membership: false, has_in_store: true, created_at: 'c', collected_at: null,
      order_items: [{ id: 'i1', name: 'Helmet', category: 'tack', product_id: 't2', quantity: 2, unit_price: '2500.00' }, { id: 'i2', name: 'Breeches', category: 'tack', product_id: 't1', quantity: 1, unit_price: 4000 }],
      payments: [{ id: 'p1', status: 'success', amount: 9000, currency: 'INR', paid_at: 'pa', metadata: {} }],
    },
    error: null,
  };
  calls.length = 0;
  const st = await S.fetchOrderStatus('o1', 'u1');
  eq('status: shop order paid -> fulfilled state, orderStatus paid', [st.state, st.orderStatus, st.hasInStore, st.hasMembership], ['fulfilled', 'paid', true, false]);
  eq('status: items with server prices', st.items, [{ name: 'Helmet', category: 'tack', quantity: 2, unitPrice: 2500 }, { name: 'Breeches', category: 'tack', quantity: 1, unitPrice: 4000 }]);
  eq('status: scoped to owner when user given', calls.some((c) => c[0] === 'match' && c[1] && c[1].user_id === 'u1'), true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
