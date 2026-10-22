// Mobile receipt tests (no network). Run from the app root: node scripts/test-receipt.js
const ts = require(process.cwd() + '/node_modules/typescript');
const fs = require('fs');
const compile = (file) => {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp = {};
  new Function('require', 'exports', 'module', js)(require, exp, { exports: exp });
  return exp;
};
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };

const L = compile('src/features/checkout/receipt-logic.ts');
const good = {
  document_type: 'payment_receipt', receipt_number: 'CHR-R-2026-000012', status: 'paid', paid_at: '2026-10-19T08:30:00Z', amount: 5000, currency: 'INR',
  payment_reference: 'pay_ABC123', order_reference: 'CHR-1A2B3C4D', items: [{ name: 'Adult 8-class pack', quantity: 1, unit_price: 5000 }],
  business: { name: 'Colonel Horse Riding Club', address: null, gstin: null, contact_email: 'club@example.org', contact_phone: '  ' },
};
const r = L.parseReceipt(good);
ok('a complete payment receipt parses', r && r.receiptNumber === 'CHR-R-2026-000012' && r.amount === 5000 && r.currency === 'INR' && r.paymentReference === 'pay_ABC123');
ok('items carry quantity and unit price', r.items.length === 1 && r.items[0].unitPrice === 5000 && r.items[0].quantity === 1);
ok('amounts keep the server value and currency', L.parseReceipt({ ...good, currency: 'USD', amount: '20.50' }).amount === 20.5 && L.parseReceipt({ ...good, currency: 'USD' }).currency === 'USD');
ok('anything that is not a payment receipt is rejected (e.g. a tax invoice)', L.parseReceipt({ ...good, document_type: 'tax_invoice' }) === null);
ok('incomplete or malformed data is rejected', [null, undefined, 'x', 5, {}, { ...good, receipt_number: '' }, { ...good, amount: 0 }, { ...good, amount: 'abc' }, { ...good, paid_at: null }].every((v) => L.parseReceipt(v) === null));
ok('missing optional parts are null, never invented', L.parseReceipt({ ...good, payment_reference: null }).paymentReference === null && r.business.address === null && r.business.gstin === null && r.business.contactPhone === null);
ok('business lines only list what is configured', JSON.stringify(L.businessLines(r)) === JSON.stringify(['Colonel Horse Riding Club', 'club@example.org']));
ok('a configured GSTIN is shown, an absent one is not', L.businessLines(L.parseReceipt({ ...good, business: { ...good.business, gstin: '27ABCDE1234F1Z5' } })).includes('GSTIN 27ABCDE1234F1Z5') && !L.businessLines(r).some((l) => /GSTIN/.test(l)));
ok('a missing business name falls back to the club name', L.parseReceipt({ ...good, business: {} }).business.name === 'Colonel Horse Riding Club');

// The app only reads receipts through the owner-checked RPC and never carries email-provider secrets.
const api = fs.readFileSync('src/features/checkout/receipt-api.ts', 'utf8');
ok('receipts are read only through my_receipt', /rpc\('my_receipt'/.test(api) && !/\.from\('payment_receipts'\)/.test(api));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]));
const leaks = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && /RESEND_(API_KEY|WEBHOOK_SECRET)|EMAIL_FUNCTION_SECRET|EXPO_PUBLIC_\w*(SERVICE_ROLE|SECRET)/.test(fs.readFileSync(f, 'utf8')));
ok('no email-provider secret in the app bundle sources', leaks.length === 0, leaks.join());
const envExample = fs.readFileSync('.env.example', 'utf8');
ok('.env.example has no email or provider secret', !/RESEND|EMAIL_|SERVICE_ROLE=/.test(envExample.replace(/^#.*$/gm, '')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
