// Mobile privacy tests (no network). Run from the app root: node scripts/test-privacy.js
const ts = require(process.cwd() + '/node_modules/typescript');
const fs = require('fs');
const compile = (file, stubs = {}) => {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp = {};
  new Function('require', 'exports', 'module', js)((id) => (id in stubs ? stubs[id] : require(id)), exp, { exports: exp });
  return exp;
};
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };

const P = 'src/features/privacy/';
const L = compile(P + 'privacy-logic.ts');
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

// ── notice text ──
eq('parseNotice: headings, list, paragraphs', L.parseNotice('## A\nText.\n- one\n- two\n\nMore.'), [{ type: 'h2', text: 'A' }, { type: 'p', text: 'Text.' }, { type: 'ul', items: ['one', 'two'] }, { type: 'p', text: 'More.' }]);
eq('parseNotice: HTML stays text', L.parseNotice('<script>x</script>'), [{ type: 'p', text: '<script>x</script>' }]);
eq('parseNotice: empty', [L.parseNotice(''), L.parseNotice(null)], [[], []]);
eq('splitMarks highlights the gap', L.splitMarks('Address: [not yet provided].'), [{ text: 'Address: ', mark: false }, { text: '[not yet provided]', mark: true }, { text: '.', mark: false }]);
eq('noticeState', [L.noticeState({ published: true, version: '1.0', body: 'x' }), L.noticeState({ published: false, version: '1.0', body: 'x' }), L.noticeState({ published: false, version: null }), L.noticeState(null)], ['published', 'draft', 'none', 'none']);
eq('registration: only a published notice is ticked', [L.registrationNotice({ published: true, version: '1.0', body: 'x' }), L.registrationNotice({ published: false, version: '1.0', body: 'x' }), L.registrationNotice(null)],
  [{ state: 'published', mustAcknowledge: true, version: '1.0' }, { state: 'draft', mustAcknowledge: false, version: null }, { state: 'none', mustAcknowledge: false, version: null }]);

// ── pending acknowledgement ──
{ const s = mem(); L.rememberPendingAcknowledgement(s, '1.0'); eq('pending: returned once for the current version', [L.takePendingAcknowledgement(s, '1.0'), L.takePendingAcknowledgement(s, '1.0')], ['1.0', null]); }
{ const s = mem(); L.rememberPendingAcknowledgement(s, '1.0'); eq('pending: dropped when the notice changed', [L.takePendingAcknowledgement(s, '2.0'), s._m.size], [null, 0]); }
{ const s = mem(); L.rememberPendingAcknowledgement(s, null); const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() {} };
  ok('pending: no empty version; broken storage is harmless', s._m.size === 0 && (() => { L.rememberPendingAcknowledgement(bad, '1.0'); return L.takePendingAcknowledgement(bad, '1.0') === null && L.takePendingAcknowledgement(null, '1.0') === null; })()); }

// ── choices and requests ──
eq('purposeView', [L.purposeView({ is_mandatory: true, status: 'acknowledged' }), L.purposeView({ is_mandatory: false, status: 'none' }), L.purposeView({ is_mandatory: false, status: 'withdrawn' })],
  [{ kind: 'required', on: true, label: 'Needed to run your account' }, { kind: 'switch', on: true, label: 'On' }, { kind: 'switch', on: false, label: 'Off' }]);
eq('validateRequest: details needed except for access', [L.validateRequest({ type: 'access' }), L.validateRequest({ type: 'grievance', details: ' ' }).details ? 'needs details' : 'ok', L.validateRequest({ type: 'grievance', details: 'x' })], [{}, 'needs details', {}]);
ok('validateRequest: limits and unknown types', L.validateRequest({ type: 'other', details: 'x'.repeat(2001) }).details && L.validateRequest({ type: 'access', subject: 'x'.repeat(121) }).subject && L.validateRequest({ type: 'erasure' }).type && L.validateRequest({ type: 'bogus' }).type);
eq('status helpers', [['submitted', 'in_progress', 'awaiting_requester'].every(L.isOpen), L.isOpen('completed'), L.canCancel('submitted'), L.canCancel('in_progress')], [true, false, true, false]);
eq('dueText: only a club-set target on an open request', [L.dueText({ due_at: '2027-01-10', status: 'submitted' }, (d) => d), L.dueText({ due_at: null, status: 'submitted' }, (d) => d), L.dueText({ due_at: '2027-01-10', status: 'completed' }, (d) => d)], ['We aim to answer by 2027-01-10.', null, null]);
{ const m = L.friendlyPrivacyError({ message: 'duplicate key value violates "x" (a@b.c)' });
  ok('errors: plain language, never database text', m === 'Something went wrong. Please try again.' && L.friendlyPrivacyError({ message: 'MANDATORY_PURPOSE' }).includes('close your account') && /connection/.test(L.friendlyPrivacyError({ message: 'Failed to fetch' }))); }

// ── the API layer against a fake Supabase ──
const calls = [];
let reply = {};
const fakeSupabase = { rpc: (fn, args) => { calls.push([fn, args]); const r = typeof reply[fn] === 'function' ? reply[fn](args) : reply[fn] ?? { data: null, error: null }; return { abortSignal: () => (r instanceof Promise ? r : Promise.resolve(r)) }; } };
const A = compile(P + 'privacy-api.ts', { '@/services/supabase/client': { supabase: fakeSupabase }, './privacy-logic': L });

(async () => {
  reply = { record_consent: { data: { recorded: true }, error: null } };
  calls.length = 0;
  await A.recordConsent('push_notifications', 'withdrawn');
  eq('recordConsent sends only the purpose, action, version and source (never a user id or time)', calls[0], ['record_consent', { p_purpose: 'push_notifications', p_action: 'withdrawn', p_notice_version: null, p_source: 'mobile' }]);
  ok('…and no identity-like keys at all', !JSON.stringify(calls[0][1]).match(/user|uid|email|time|at"/i));
  calls.length = 0;
  await A.submitRequest({ type: 'grievance', subject: '  Title  ', details: '  Something  ' });
  eq('submitRequest trims and sends no user id', calls[0], ['submit_privacy_request', { p_type: 'grievance', p_subject: 'Title', p_details: 'Something' }]);
  calls.length = 0;
  await A.submitRequest({ type: 'erasure' });
  eq('an erasure request carries no target account', calls[0], ['submit_privacy_request', { p_type: 'erasure', p_subject: null, p_details: null }]);
  calls.length = 0; await A.cancelRequest('rid'); eq('cancelRequest sends only the request id', calls[0], ['cancel_my_privacy_request', { p_id: 'rid' }]);
  calls.length = 0; await A.getNotice(); eq('getNotice asks for the English notice', calls[0], ['current_privacy_notice', { p_language: 'en' }]);

  reply = { record_consent: { data: null, error: { message: 'MANDATORY_PURPOSE', details: 'x' } } };
  let err; try { await A.recordConsent('membership_service', 'withdrawn'); } catch (e) { err = e; }
  ok('a server refusal becomes a plain message with its code', err instanceof A.PrivacyError && err.code === 'MANDATORY_PURPOSE' && err.message.includes('close your account'));
  reply = { submit_privacy_request: { data: null, error: { message: 'relation "privacy_requests" does not exist (secret)' } } };
  try { await A.submitRequest({ type: 'access' }); } catch (e) { err = e; }
  ok('raw database text is never shown', err.message === 'Something went wrong. Please try again.' && !err.message.includes('privacy_requests'));
  reply = { export_my_data: () => Promise.reject(new Error('Network request failed')) };
  try { await A.exportMyData(); } catch (e) { err = e; }
  ok('a network failure is reported as a connection problem, not as success', err instanceof A.PrivacyError && /connection/.test(err.message));

  // ── push: a withdrawn choice is respected quietly ──
  let saved = [];
  const storage = new Map();
  const notifications = {
    setNotificationChannelAsync: async () => {}, AndroidImportance: { HIGH: 4 }, setNotificationHandler() {},
    getPermissionsAsync: async () => ({ granted: true, status: 'granted', canAskAgain: true }),
    getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[abcdEFGH1234]' }),
    addPushTokenListener: () => ({ remove() {} }),
  };
  const mk = (savePushDevice) => compile('src/features/push/push-device.ts', {
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { eas: { projectId: '06c783ed-2caf-4b10-b7fe-e385a144ebde' } }, version: '2.0.0' } } },
    'expo-device': { isDevice: true }, 'react-native': { Platform: { OS: 'android' } },
    '@/services/supabase/storage': { authStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) } },
    './notifications-module': { Notifications: notifications }, './push-api': { EXPO_TOKEN_RE: /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/, savePushDevice, removePushDevice: async () => {} },
  });
  const warn = console.warn; console.warn = () => {};
  eq('push: a withdrawn choice → "withdrawn", no error', await mk(async () => { throw new Error('PUSH_WITHDRAWN'); }).registerThisDevice({ prompt: false }), 'withdrawn');
  eq('push: an ordinary failure is still "failed"', await mk(async () => { throw new Error('boom'); }).registerThisDevice({ prompt: false }), 'failed');
  eq('push: success is still "registered"', await mk(async (t) => { saved.push(t); }).registerThisDevice({ prompt: false }), 'registered');
  console.warn = warn;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
