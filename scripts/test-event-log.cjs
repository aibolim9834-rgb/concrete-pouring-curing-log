// 작업 기록 (lib/event-log.ts): rows, limits, the offline queue and sending, with a fake Supabase. No network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, extras = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) { if (id in extras) return extras[id]; throw new Error(`Unexpected dependency ${id}`); }, Error, ...globals });
  return module.exports;
}
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }
const timeout = load('lib/request-timeout.ts', {}, { AbortController, setTimeout, clearTimeout });
const dbErr = load('lib/db-error.ts', {}, { console: { error() {} } });

function memory() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; }
// A fresh module per test: its own limits, trail, storage, connection state and fake Supabase.
function setup({ cloud = true, online = true, insert = async () => ({ error: null }), env = {} } = {}) {
  const storage = memory(), sent = [], nav = { onLine: online, userAgent: 'Mozilla/5.0 (Test) Chrome/130' };
  const supabase = { from(table) { assert.equal(table, 'client_events'); return { insert(rows) { return { abortSignal: async () => { sent.push(rows); return insert(rows); } }; } }; } };
  const mod = load('lib/event-log.ts', { './supabase': { supabase }, './cloud-storage': { cloudStorageEnabled: () => cloud }, './request-timeout': timeout }, {
    localStorage: storage, navigator: nav, process: { env }, setTimeout: () => 0, AbortSignal: { timeout: () => undefined }, Date, Math, JSON,
  });
  return { mod, storage, sent, nav };
}
const plain = v => JSON.parse(JSON.stringify(v));

(async () => {
  await check('a row keeps identifiers, cuts long text, clamps the time and attaches the trail only to problems', () => {
    const { mod } = setup({ env: { NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' } });
    mod.noteAction('일지 추가');
    const ok = mod.buildRow({ page: '일지', action: '일지 추가', outcome: 'ok', siteId: 's1', target: 'log-1 · 2026-11-05 103동 5F 슬라브', durationMs: 812.6 }, 'd-test0001', new Date('2026-11-05T08:00:00Z'));
    assert.equal(ok.happened_at, '2026-11-05T08:00:00.000Z'); assert.equal(ok.duration_ms, 813); assert.equal(ok.app_version, 'abcdef1');
    assert.equal(ok.trail, null); assert.equal(ok.online, true); assert.match(ok.client, /Chrome/);
    const bad = mod.buildRow({ page: '일지', action: '일지 추가', outcome: 'error', message: 'x'.repeat(900), detail: 'y'.repeat(3000), durationMs: 9e9 }, 'd-test0001');
    assert.equal(bad.message.length, 500); assert.equal(bad.detail.length, 1000); assert.equal(bad.duration_ms, 600000);
    assert.equal(plain(bad.trail).length, 1); assert.equal(bad.trail[0].a, '일지 추가');
    assert.equal(setup().mod.buildRow({ page: '사진', action: 'a', outcome: 'ok' }, 'd-test0001').app_version, 'local');
  });

  await check('the trail keeps the last ten actions', () => {
    const { mod } = setup();
    for (let i = 1; i <= 12; i++) mod.noteAction(`동작 ${i}`);
    const row = mod.buildRow({ page: '일지', action: 'x', outcome: 'warn' }, 'd-test0001');
    assert.equal(row.trail.length, 10); assert.equal(row.trail[0].a, '동작 3'); assert.equal(row.trail[9].a, '동작 12');
  });

  await check('the same problem goes once a minute, at most 20 problems and 300 events per load; successes are not merged', () => {
    const { mod } = setup(), t0 = 1_000_000;
    const err = { page: '일지', action: '일지 추가', outcome: 'error', message: '서버 응답 없음' };
    assert.equal(mod.admit(err, t0), true); assert.equal(mod.admit(err, t0 + 30_000), false); assert.equal(mod.admit(err, t0 + 61_000), true);
    assert.equal(mod.admit({ ...err, message: '다른 오류' }, t0 + 61_000), true);
    for (let i = 0; i < 5; i++) assert.equal(mod.admit({ page: '일지', action: '일지 추가', outcome: 'ok' }, t0), true);
    mod.resetLimits();
    let problems = 0; for (let i = 0; i < 30; i++) if (mod.admit({ ...err, message: `오류 ${i}` }, t0)) problems++;
    assert.equal(problems, 20);
    mod.resetLimits();
    let all = 0; for (let i = 0; i < 350; i++) if (mod.admit({ page: '일지', action: 'a', outcome: 'ok' }, t0)) all++;
    assert.equal(all, 300);
  });

  await check('errors are told apart: server, timeout, network and the app\'s own guards', () => {
    const { mod } = setup();
    const db = mod.describeError(dbErr.dbError('일지 저장에 실패했습니다.', { code: '42501', message: 'permission denied', hint: 'grant' }));
    assert.equal(db.code, '42501'); assert.match(db.detail, /permission denied \/ grant/); assert.equal(db.unexpected, true);
    const none = mod.describeError(dbErr.dbError('현장명 변경에 실패했습니다.', null));
    assert.equal(none.code, 'NO_ROW'); assert.equal(none.unexpected, true);
    const late = mod.describeError(new timeout.RequestTimeoutError('서버 응답이 없어 저장 여부를 확인하지 못했습니다.'));
    assert.equal(late.code, 'TIMEOUT'); assert.equal(late.unexpected, true);
    const net = mod.describeError(new TypeError('Failed to fetch'));
    assert.equal(net.code, 'TypeError'); assert.equal(net.unexpected, true);
    const guard = mod.describeError(new Error('등록할 현장을 선택해주세요.'));
    assert.equal(guard.code, undefined); assert.equal(guard.unexpected, false);
  });

  await check('events wait in this browser and are sent without their queue keys; a failed send keeps them', async () => {
    let fail = true;
    const { mod, storage, sent } = setup({ insert: async () => ({ error: fail ? { message: 'offline' } : null }) });
    mod.logEvent({ page: '일지', action: '일지 추가', outcome: 'ok', target: 'log-1' });
    mod.logEvent({ page: '사진', action: '사진 올리기', outcome: 'error', message: '사진 업로드 실패' });
    assert.equal(mod.readQueue(storage).length, 2);
    await mod.flushEvents();
    assert.equal(sent.length, 1); assert.equal(mod.readQueue(storage).length, 2);
    fail = false; await mod.flushEvents();
    assert.equal(sent.length, 2); assert.equal(mod.readQueue(storage).length, 0);
    const rows = plain(sent[1]); assert.equal(rows.length, 2); assert(rows.every(r => !('_k' in r) && /^d-/.test(r.device)));
    assert.equal(rows[0].device, rows[1].device); assert.equal(storage.getItem('cp_device_id'), rows[0].device);
  });

  await check('offline: nothing is sent until the connection is back; the queue keeps the latest 50', async () => {
    const { mod, storage, sent, nav } = setup({ online: false });
    for (let i = 0; i < 60; i++) mod.logEvent({ page: '일지', action: '일지 수정', outcome: 'ok', target: `log-${i}` });
    await mod.flushEvents();
    assert.equal(sent.length, 0);
    const queued = mod.readQueue(storage); assert.equal(queued.length, 50); assert.equal(queued[0].target, 'log-10'); assert.equal(queued[0].online, false);
    nav.onLine = true; await mod.flushEvents();
    assert.equal(sent.length, 1); assert.equal(sent[0].length, 50); assert.equal(mod.readQueue(storage).length, 0);
  });

  await check('QA and browser-only mode keep and send nothing', async () => {
    const { mod, storage, sent } = setup({ cloud: false });
    mod.logEvent({ page: '일지', action: '일지 추가', outcome: 'error', message: 'x' });
    await mod.flushEvents();
    assert.equal(mod.readQueue(storage).length, 0); assert.equal(sent.length, 0);
  });

  await check('tracked records success with the saved target and failure with its reason, and passes both through', async () => {
    const { mod, storage } = setup();
    assert.equal(await mod.tracked({ page: '일지', action: '일지 추가', siteId: 's1', target: '새 일지 · 2026-11-05' }, async () => 'log-9', id => `${id} · 2026-11-05`), 'log-9');
    await assert.rejects(mod.tracked({ page: '일지', action: '일지 수정', siteId: 's1', target: 'log-9' }, async () => { throw dbErr.dbError('일지 저장에 실패했습니다.', { code: 'PGRST116', message: 'no rows' }); }), /일지 저장에 실패했습니다/);
    await assert.rejects(mod.tracked({ page: '일지', action: '일지 수정', siteId: 's1', target: 'log-9' }, async () => { throw new Error('수정할 일지를 다시 선택해주세요.'); }));
    const q = plain(mod.readQueue(storage));
    assert.deepEqual(q.map(r => [r.action, r.outcome, r.target, r.code]), [
      ['일지 추가', 'ok', 'log-9 · 2026-11-05', null], ['일지 수정', 'error', 'log-9', 'PGRST116'], ['일지 수정', 'warn', 'log-9', null]]);
    assert(q[0].duration_ms >= 0); assert.equal(q[1].trail.at(-1).a, '일지 수정');
  });

  console.log(`${count} event log checks passed; no network calls.`);
})().catch(e => { console.error(e); process.exit(1); });
