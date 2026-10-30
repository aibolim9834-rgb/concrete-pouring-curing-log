// Run: node scripts/test-pouring-progress.cjs. No network or production data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) { if (id in dependencies) return dependencies[id]; throw new Error(`Unexpected dependency: ${id}`); }, process: { env: {} }, localStorage: storage, TextEncoder, crypto: require('node:crypto').webcrypto });
  return module.exports;
}
const entries = new Map();
const storage = { getItem: key => entries.get(key) || null, setItem(key, value) { entries.set(key, value); }, removeItem(key) { entries.delete(key); }, key(index) { return [...entries.keys()][index] ?? null; }, get length() { return entries.size; } };
const model = load('lib/pouring-progress.ts');
const persistence = load('lib/progress-storage.ts', { './supabase': { supabase: { from() { throw new Error('Network must not be used'); } } }, './pouring-progress': model, './cloud-storage': load('lib/cloud-storage.ts') });
const editor = load('lib/progress-editor.ts');
const backup = load('lib/progress-backup.ts', { './pouring-progress': model });
const logData = load('lib/log-data.ts', { './pouring-progress': model });
const archive = load('lib/site-archive.ts', { './pouring-progress': model, './log-data': logData });
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }
const document = () => ({ version: 1, buildings: [{ id: 'b1', name: '101동', stages: model.presetStages(3, 2), records: { f2: { date: '2026-08-08', status: 'done', color: '#284654' } } }] });
(async () => {
  await check('calendar dates and leap years', () => { assert.equal(model.validDate('2024-02-29'), true); for (const s of ['2026-02-29', '2026-13-01', '', '2026-02-30']) assert.equal(model.validDate(s), false); });
  await check('vertical stage order includes roof, foundations and basements', () => { const rows = model.progressRows(document().buildings); assert.equal(rows[0].name, '옥탑'); assert.equal(rows[rows.length - 1].name, '버림'); assert(rows.findIndex(s => s.id === 'b1') < rows.findIndex(s => s.id === 'b2')); });
  await check('highest completed stage includes legacy actual dates and excludes future dates', () => { const b = document().buildings[0]; b.records.f3 = { date: '2026-08-01', status: 'partial', color: '#284654' }; b.records.roof = { date: '2026-12-01', status: 'done', color: '#284654' }; const before=JSON.stringify(b); assert.equal(model.completedStages(b, '2026-08-10')[0].id, 'f3'); assert.equal(model.completedStages(b, '2026-08-01').length, 1); assert.equal(model.completedStages(b, '2026-08-10').length, 2); assert.equal(JSON.stringify(b),before); });
  await check('renaming buildings and stages preserves records by stable ID', () => { const d = document(); d.buildings[0].name = '102동'; d.buildings[0].stages.find(s => s.id === 'f2').name = '기준층'; model.validateProgress(d); assert.equal(d.buildings[0].records.f2.date, '2026-08-08'); });
  await check('reject duplicate buildings', () => { const d = document(); d.buildings.push(structuredClone(d.buildings[0])); assert.throws(() => model.validateProgress(d)); });
  await check('reject duplicate stages and orphan records', () => { const d = document(); d.buildings[0].stages.push(d.buildings[0].stages[0]); assert.throws(() => model.validateProgress(d)); const c = document(); c.buildings[0].records.missing = c.buildings[0].records.f2; assert.throws(() => model.validateProgress(c)); });
  await check('reject unsafe keys and arrays used as record maps', () => { const d = document(); d.buildings[0].stages[0].id = 'constructor'; assert.throws(() => model.validateProgress(d)); const c = document(); c.buildings[0].records = []; assert.throws(() => model.validateProgress(c)); });
  await check('reject invalid imported dates, status and color', () => { for (const [key, value] of [['date', '2026-02-30'], ['status', 'unknown'], ['color', 'url(https://invalid)']]) { const d = document(); d.buildings[0].records.f2[key] = value; assert.throws(() => model.validateProgress(d)); } });
  await check('color without a date is valid and does not count as completed', () => { const d = document(); d.buildings[0].records.f3 = { date: '', status: 'none', color: '#284654' }; model.validateProgress(d); assert.equal(model.completedStages(d.buildings[0], '2026-08-10').length, 1); });
  await check('persist and reload with a revision', async () => { const first = await persistence.loadProgress('site-a', false); const saved = await persistence.saveProgress('site-a', first, document()); assert.equal(saved.revision, 1); assert.equal((await persistence.loadProgress('site-a', false)).document.buildings[0].records.f2.date, '2026-08-08'); });
  await check('site data stays separate', async () => { assert.equal((await persistence.loadProgress('site-b', false)).document.buildings.length, 0); });
  await check('stale tab cannot overwrite newer data', async () => { const stale = await persistence.loadProgress('site-a', false); await persistence.saveProgress('site-a', stale, document()); await assert.rejects(() => persistence.saveProgress('site-a', stale, document()), /다른 탭/); });
  await check('storage quota failure keeps the previous saved document', async () => { const before = entries.get('cp_pouring_progress_v1:site-a'); const state = await persistence.loadProgress('site-a', false); const setter = storage.setItem; storage.setItem = () => { throw new Error('QuotaExceeded'); }; try { await assert.rejects(() => persistence.saveProgress('site-a', state, model.emptyProgress()), /QuotaExceeded/); } finally { storage.setItem = setter; } assert.equal(entries.get('cp_pouring_progress_v1:site-a'), before); });
  await check('corrupt storage blocks load rather than resetting data', async () => { entries.set('cp_pouring_progress_v1:broken', '{'); await assert.rejects(() => persistence.loadProgress('broken', false)); assert.equal(entries.get('cp_pouring_progress_v1:broken'), '{'); });
  await check('cloud load failure preserves local data and does not silently fall back', async () => { const before=entries.get('cp_pouring_progress_v1:site-a'); await assert.rejects(()=>persistence.loadProgress('site-a',true),/Network must not be used/); assert.equal(entries.get('cp_pouring_progress_v1:site-a'),before); });
  await check('backup roundtrip preserves names, custom stages, dates, colors and blank cells', () => {
    const d = document(); d.buildings[0].stages.push({ id: 'custom', name: '피트층', order: 0 });
    d.buildings[0].records.custom = { date: '', status: 'none', color: '#ffffff' };
    d.buildings.push({ id: 'b2', name: '102동', stages: model.presetStages(1, 0), records: {} });
    const result = backup.parseProgressBackup('\uFEFF' + backup.serializeProgressBackup('복원 현장', d));
    assert.equal(JSON.stringify(result.document), JSON.stringify(d));
    assert.throws(() => backup.parseProgressBackup('{'));
    assert.throws(() => backup.parseProgressBackup(JSON.stringify({ document: { version: 2 } })));
  });
  await check('filter excludes hidden and removed targets from writes', () => {
    const d = document(); d.buildings.push({ id: 'b2', name: '102동', stages: model.presetStages(1, 0), records: {} });
    assert.equal(JSON.stringify(editor.visibleSelection(d, ['b1:f2', 'b2:f1', 'b1:missing', 'missing:f1'], 'b1')), JSON.stringify(['b1:f2']));
  });
  await check('delete, undo, reload and import derive editor names from the current document', () => {
    const d = document(); d.buildings.push({ id: 'b2', name: '102동', stages: [], records: {} });
    assert.equal(editor.progressEditor(d, 'b2').buildingName, '102동');
    const removed = { ...d, buildings: d.buildings.filter(b => b.id !== 'b2') };
    assert.equal(editor.progressEditor(removed, 'b2').buildingName, '101동');
    assert.equal(editor.progressEditor(d, 'b2').stageName, '');
    assert.equal(editor.progressEditor(model.emptyProgress()).buildingName, '');
  });
  await check('duplicate names blocked without changing existing duplicate IDs', () => {
    const sites = [{ id: 'a', name: '검증 현장' }, { id: 'b', name: '검증 현장' }];
    assert.throws(() => archive.assertNewSiteName(sites, ' 검증   현장 '));
    archive.assertNewSiteName(sites, '다른 현장'); assert.equal(sites.length, 2);
  });
  await check('site list sorts by name: numbers by value, then English, then 가나다', () => {
    const names = ['평택 고덕 대우 민간참여(1공구)', '대구 범어 자이 S&D', 'LG U+파주 전산 2동', '10현장', '9현장', '노량진 SK'];
    const input = names.map((name, i) => ({ id: 's' + i, name }));
    assert.equal(JSON.stringify(archive.sortSites(input).map(s => s.name)), JSON.stringify(['9현장', '10현장', 'LG U+파주 전산 2동', '노량진 SK', '대구 범어 자이 S&D', '평택 고덕 대우 민간참여(1공구)']));
    assert.equal(input[0].name, names[0], 'input list unchanged');
  });
  const sites = [{ id: 'archive-a', name: '같은 현장' }, { id: 'archive-b', name: '같은 현장' }];
  const logs = [{ ...logData.newLog('archive-a'), id: 'log-a', remarks: '보관 확인' }, { ...logData.newLog('archive-b'), id: 'log-b' }];
  let savedArchive;
  await check('delete and restore roundtrip uses IDs and preserves other sites and orphan data', () => {
    storage.setItem('cp_sites', JSON.stringify(sites)); storage.setItem('cp_logs', JSON.stringify(logs));
    const progressRaw = JSON.stringify({ document: document(), revision: 7 });
    storage.setItem('cp_pouring_progress_v1:archive-a', progressRaw);
    storage.setItem('cp_pouring_progress_v1:orphan', 'original orphan');
    savedArchive = archive.archiveSite(storage, sites[0], logs, 'local');
    const deleted = archive.removeLocalSite(storage, sites, logs, savedArchive);
    assert.equal(deleted.sites.length, 1); assert.equal(deleted.sites[0].id, 'archive-b');
    assert.equal(deleted.logs[0].id, 'log-b'); assert.equal(storage.getItem('cp_pouring_progress_v1:archive-a'), null);
    const restored = archive.restoreLocalSite(storage, deleted.sites, deleted.logs, savedArchive);
    assert.equal(restored.sites.length, 2); assert.equal(restored.logs.length, 2);
    assert.equal(storage.getItem('cp_pouring_progress_v1:archive-a'), progressRaw);
    assert.equal(storage.getItem('cp_pouring_progress_v1:orphan'), 'original orphan');
    assert.equal(archive.listSiteArchives(storage).length, 1);
    assert.throws(() => archive.restoreLocalSite(storage, restored.sites, restored.logs, savedArchive), /덮어쓰지/);
  });
  await check('failed archive prevents deletion and preserves all source data', () => {
    const before = [...entries]; const setter = storage.setItem;
    storage.setItem = () => { throw new Error('QuotaExceeded'); };
    try { assert.throws(() => archive.archiveSite(storage, sites[1], logs, 'local'), /QuotaExceeded/); }
    finally { storage.setItem = setter; }
    assert.deepEqual([...entries], before);
  });
  await check('partial delete failure rolls back active data while retaining recovery copy', () => {
    const currentSites = JSON.parse(storage.getItem('cp_sites')), currentLogs = JSON.parse(storage.getItem('cp_logs'));
    const saved = archive.archiveSite(storage, sites[0], currentLogs, 'local');
    const beforeSites = storage.getItem('cp_sites'), beforeLogs = storage.getItem('cp_logs');
    const remove = storage.removeItem;
    storage.removeItem = key => { if (key === 'cp_pouring_progress_v1:archive-a') throw new Error('WriteFailed'); remove(key); };
    try { assert.throws(() => archive.removeLocalSite(storage, currentSites, currentLogs, saved), /WriteFailed/); }
    finally { storage.removeItem = remove; }
    assert.equal(storage.getItem('cp_sites'), beforeSites); assert.equal(storage.getItem('cp_logs'), beforeLogs);
    assert(storage.getItem(saved.key));
  });
  await check('stale site lists and changed progress block deletion', () => {
    const currentSites = JSON.parse(storage.getItem('cp_sites')), currentLogs = JSON.parse(storage.getItem('cp_logs'));
    const saved = archive.archiveSite(storage, sites[0], currentLogs, 'local');
    assert.throws(() => archive.removeLocalSite(storage, [], currentLogs, saved), /다른 화면/);
    const raw = storage.getItem('cp_pouring_progress_v1:archive-a');
    storage.setItem('cp_pouring_progress_v1:archive-a', JSON.stringify({ document: document(), revision: 8 }));
    assert.throws(() => archive.removeLocalSite(storage, currentSites, currentLogs, saved), /바뀌었습니다/);
    storage.setItem('cp_pouring_progress_v1:archive-a', raw);
  });
  await check('failed restore rolls back sites and logs and keeps the archive', () => {
    const currentSites = JSON.parse(storage.getItem('cp_sites')), currentLogs = JSON.parse(storage.getItem('cp_logs'));
    const saved = archive.archiveSite(storage, sites[0], currentLogs, 'local');
    const deleted = archive.removeLocalSite(storage, currentSites, currentLogs, saved);
    const setter = storage.setItem, beforeSites = storage.getItem('cp_sites'), beforeLogs = storage.getItem('cp_logs');
    storage.setItem = (key, value) => { if (key === 'cp_pouring_progress_v1:archive-a') throw new Error('QuotaExceeded'); setter(key, value); };
    try { assert.throws(() => archive.restoreLocalSite(storage, deleted.sites, deleted.logs, saved), /QuotaExceeded/); }
    finally { storage.setItem = setter; }
    assert.equal(storage.getItem('cp_sites'), beforeSites); assert.equal(storage.getItem('cp_logs'), beforeLogs);
    assert(storage.getItem(saved.key));
    archive.restoreLocalSite(storage, deleted.sites, deleted.logs, saved);
  });
  await check('DB archives cannot accidentally restore into local sites', () => {
    assert.throws(() => archive.restoreLocalSite(storage, [], [], { ...savedArchive, mode: 'cloud' }), /DB 현장/);
  });
  await check('corrupt progress prevents archive and deletion without overwriting the source', () => {
    storage.setItem('cp_pouring_progress_v1:broken-site', '{');
    const before = [...entries];
    assert.throws(() => archive.archiveSite(storage, { id: 'broken-site', name: '손상 현장' }, [], 'local'));
    assert.deepEqual([...entries], before);
  });
  await check('cloud save tells a network failure apart from a newer revision elsewhere', async () => {
    const withResult = result => load('lib/progress-storage.ts', { './supabase': { supabase: { from() { const q = { update() { return q; }, eq() { return q; }, select() { return q; }, maybeSingle: async () => result }; return q; } } }, './pouring-progress': model, './cloud-storage': load('lib/cloud-storage.ts') });
    const current = { document: document(), revision: 3, mode: 'cloud' };
    await assert.rejects(withResult({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }).saveProgress('site-a', current, document()), /DB 저장에 실패/);
    await assert.rejects(withResult({ data: null, error: null }).saveProgress('site-a', current, document()), /다른 화면에서 변경/);
    assert.equal((await withResult({ data: { revision: 4 }, error: null }).saveProgress('site-a', current, document())).revision, 4);
  });
  console.log(`${count} checks passed; no network calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
