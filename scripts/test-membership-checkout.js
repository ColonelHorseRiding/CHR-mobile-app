// Membership and One-Time Ride checkout contract tests (no network). Run from the app root:
//   node scripts/test-membership-checkout.js
// These flows share payments-api.ts with the Tack Shop cart; this checks the Tack Shop change left them untouched.
const ts = require(process.cwd() + '/node_modules/typescript');
const fs = require('fs');
const compile = (file, stubs = {}) => {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp = {};
  new Function('require', 'exports', 'module', js)((id) => (id in stubs ? stubs[id] : require(id)), exp, { exports: exp });
  return exp;
};
let pass = 0, fail = 0;
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); ok ? pass++ : fail++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `\n   got  ${JSON.stringify(g)}\n   want ${JSON.stringify(w)}`); };

const TD = compile('src/features/store/tack-details.ts');
const C = compile('src/features/store/cart.ts', { './tack-details': TD });
let next; const queue = []; const calls = [];
const builder = () => { const b = { then: (res, rej) => Promise.resolve(queue.length ? queue.shift() : next).then(res, rej) };
  for (const fn of ['select', 'eq', 'gte', 'order', 'limit', 'abortSignal']) b[fn] = (...a) => { calls.push([fn, ...a.filter((x) => !(x && x.aborted !== undefined))]); return b; }; return b; };
const supabase = { rpc: (n, a) => { calls.push(['rpc', n, a]); return builder(); }, from: (t) => { calls.push(['from', t]); return builder(); }, functions: { invoke: async () => ({ data: null, error: null }) } };
const P = compile('src/features/checkout/payments-api.ts', { '@/services/supabase/client': { supabase }, '@/features/store/cart': C, '@supabase/supabase-js': { FunctionsFetchError: class {}, FunctionsHttpError: class {}, FunctionsRelayError: class {} } });
const errOf = async (p) => { try { await p; return null; } catch (e) { return { kind: e.kind, code: e.code, message: e.message }; } };

(async () => {
  for (const [label, id, price] of [['Gold membership', 'mem-gold', 15000], ['One-Time Ride', 'ride-1', 2000]]) {
    calls.length = 0;
    next = { data: [{ order_id: 'o1', payment_id: 'p1', total_amount: price, amount_due: price, currency: 'INR' }], error: null };
    const o = await P.createOrder(id);
    eq(`${label}: create_order gets exactly one item, quantity 1, no size/variant key`, calls.find((c) => c[0] === 'rpc'), ['rpc', 'create_order', { p_items: [{ product_id: id, quantity: 1 }] }]);
    eq(`${label}: the charged amount is the server's`, [o.orderId, o.paymentId, o.amountDue], ['o1', 'p1', price]);

    const row = (amount, items) => ({ id: 'o9', status: 'pending', created_at: 'x', order_items: items ?? [{ product_id: id, quantity: 1 }], payments: [{ id: 'p9', status: 'created', amount, currency: 'INR' }] });
    next = { data: [row(price)], error: null };
    eq(`${label}: an identical unpaid order is reused`, (await P.findReusableOrder(id, price))?.orderId, 'o9');
    next = { data: [row(price + 1)], error: null };
    eq(`${label}: a stale price is never reused`, await P.findReusableOrder(id, price), null);
    next = { data: [row(price, [{ product_id: id, quantity: 1 }, { product_id: 'other', quantity: 1 }])], error: null };
    eq(`${label}: a different basket is not reused`, await P.findReusableOrder(id, price), null);
    calls.length = 0;
    queue.push({ data: [], error: null }, { data: null, error: { message: 'TypeError: Network request failed' } }, { data: [row(price)], error: null });
    const prepared = await P.prepareOrder(id, price);
    eq(`${label}: a lost reply is reconciled, one create_order only`, [prepared.orderId, calls.filter((c) => c[0] === 'rpc').length], ['o9', 1]);
    eq(`${label}: the unpaid-order lookup still selects only product_id/quantity (membership path unchanged)`, calls.find((c) => c[0] === 'select')[1].includes('variant_id'), false);
  }
  for (const [code, kind] of [['MEMBERSHIP_ALREADY_ACTIVE', 'already-owned'], ['ACTIVE_MEMBERSHIP_EXISTS', 'already-owned'], ['PRODUCT_UNAVAILABLE', 'unavailable'], ['TOO_MANY_PENDING_ORDERS', 'rate-limited'], ['Not authenticated', 'session']]) {
    next = { data: null, error: { message: code, details: null } };
    eq(`create_order ${code} → ${kind}`, (await errOf(P.createOrder('mem-gold'))).kind, kind);
  }
  next = { data: null, error: { message: 'Something unmapped', details: null } };
  eq('an unmapped error stays generic (unchanged)', (await errOf(P.createOrder('mem-gold'))).message, "We couldn't create your order. Please try again.");

  // The membership checkout screen and handoff were not modified by the Tack Shop work.
  const h = compile('src/features/checkout/handoff.ts');
  eq('handoff to checkout still passes only the product id', h.checkoutHref({ id: 'mem-gold' }), { pathname: '/store/checkout', params: { productId: 'mem-gold' } });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
