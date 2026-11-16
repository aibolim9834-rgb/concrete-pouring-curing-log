// Folder and file names the office PC uses when it moves 알폼핀 originals (tools/photo-archive/naming.mjs).
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let count = 0;
const check = async (name, run) => { await run(); count++; console.log(`PASS ${name}`); };
(async () => {
  const { safeName, archiveParts, numbered } = await import(pathToFileURL(path.join(__dirname, '..', 'tools', 'photo-archive', 'naming.mjs')).href);
  await check('site / date / "동 층_파일" layout', () => {
    assert.deepEqual(archiveParts('신반포 22차 현대ENG', { id: 'x', date: '2026-11-04', building: '102동', floor: '23F', name: 'KakaoTalk_20261104_092626558.jpg' }),
      { dir: ['신반포 22차 현대ENG', '2026-11-04'], file: '102동 23F_KakaoTalk_20261104_092626558.jpg' });
  });
  await check('characters Windows refuses become _, and trailing dots or spaces go', () => {
    assert.equal(safeName('A/B:C*D?"E<F>G|H\\I', 'x'), 'A_B_C_D__E_F_G_H_I');
    assert.equal(safeName('현장명. ', 'x'), '현장명');
    assert.equal(safeName('CON', '대체'), '대체');
    assert.equal(safeName('   ', '대체'), '대체');
    assert.equal(safeName('가'.repeat(200), 'x').length, 120);
  });
  await check('missing date, place or extension still gives a usable name', () => {
    assert.deepEqual(archiveParts('', { id: 'p1', date: '', building: '', floor: '', name: '' }), { dir: ['현장 이름 없음', '날짜 없음'], file: 'p1.jpg' });
    assert.equal(archiveParts('현장', { id: 'p2', date: '2026-11-04', building: '101동', floor: '', name: '사진' }).file, '101동_사진.jpg');
  });
  await check('a second, different photo under a taken name gets a number before the extension', () => {
    assert.equal(numbered('101동 5F_a.jpg', 2), '101동 5F_a (2).jpg');
    assert.equal(numbered('noext', 3), 'noext (3)');
  });
  const { findVolume, serialLabel } = await import(pathToFileURL(path.join(__dirname, '..', 'tools', 'photo-archive', 'drive.mjs')).href);
  await check('the archive SSD is found by its volume serial whatever letter it has, and a missing SSD gives null', () => {
    const drives = { 'C:\\': 1861316714, 'E:\\': 3858762594, 'F:\\': 2560074328 };
    const stat = d => { if (!(d in drives)) throw Object.assign(Error('ENOENT'), { code: 'ENOENT' }); return { dev: drives[d] }; };
    assert.equal(findVolume(2560074328, stat), 'F:\\');
    delete drives['F:\\'];
    assert.equal(findVolume(2560074328, stat), null);
    assert.equal(serialLabel(2560074328), '9897-A258');
  });
  // 현장 자료 백업 (tools/photo-archive/site-backup.mjs), written to a temporary folder.
  const fs = require('node:fs'), os = require('node:os');
  const backup = await import(pathToFileURL(path.join(__dirname, '..', 'tools', 'photo-archive', 'site-backup.mjs')).href);
  const tables = () => ({
    sites: [{ id: 's1', name: '신반포 22차 현대ENG', code: 'A0001', status: 'active' }, { id: 's2', name: 'A/B 현장', code: 'A0002', status: 'closed' }],
    pouring_logs: [{ id: 'l2', site_id: 's1', date: '2026-11-02', volume: null }, { id: 'l1', site_id: 's1', date: '2026-11-01', volume: 12 }, { id: 'l3', site_id: 's2', date: '2026-10-01', volume: 3 }],
    pouring_progress: [{ site_id: 's1', document: { buildings: [] }, revision: 4 }],
    site_photos: [{ id: 'p1', site_id: 's1', metadata: { id: 'p1', siteId: 's1', date: '2026-11-04' }, archive_name: 'D:\\이도형\\알폼핀 체결 사진\\x.jpg' }],
  });
  await check('each site gets its own records only: site row, logs, 타설현황 and photo rows', () => {
    const [a, b] = backup.buildSiteBackups(tables(), '2026-11-16T10:00:00Z', 'example.supabase.co');
    assert.equal(a.format, 'con1-site-backup'); assert.equal(a.site.id, 's1');
    assert.deepEqual(a.logs.map(l => l.id), ['l1', 'l2']); assert.equal(a.logs[1].volume, null);
    assert.equal(a.progress.revision, 4); assert.equal(a.photos[0].archive_name, 'D:\\이도형\\알폼핀 체결 사진\\x.jpg');
    assert.deepEqual(a.counts, { logs: 2, progress: 1, photos: 1 });
    assert.deepEqual(b.logs.map(l => l.id), ['l3']); assert.equal(b.progress, null); assert.deepEqual(b.counts, { logs: 1, progress: 0, photos: 0 });
  });
  await check('the same records give the same hash whatever order the server returned them in', () => {
    const t = tables(); t.pouring_logs.reverse(); t.sites[0] = { status: 'active', code: 'A0001', name: '신반포 22차 현대ENG', id: 's1' };
    assert.equal(backup.buildSiteBackups(t, 'later', 'x')[0].contentHash, backup.buildSiteBackups(tables(), 'now', 'y')[0].contentHash);
  });
  await check('a backup is saved per site, read back and checked, and saved again only when that site changed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'con1-backup-'));
    try {
      const at = new Date(2026, 10, 16, 19, 0);
      const first = backup.writeSiteBackups(root, backup.buildSiteBackups(tables(), at.toISOString(), 'x'), at, fs);
      assert.deepEqual(first.map(r => r.saved), [true, true]);
      assert.equal(path.basename(first[0].file), '신반포 22차 현대ENG_2026-11-16_1900.json');
      assert.equal(path.basename(path.dirname(first[1].file)), 'A_B 현장');
      const saved = JSON.parse(fs.readFileSync(first[0].file, 'utf8'));
      assert.deepEqual(saved.logs.map(l => l.id), ['l1', 'l2']);
      const later = new Date(2026, 10, 17, 19, 0);
      assert.deepEqual(backup.writeSiteBackups(root, backup.buildSiteBackups(tables(), later.toISOString(), 'x'), later, fs).map(r => r.saved), [false, false]);
      const changed = tables(); changed.pouring_logs.push({ id: 'l4', site_id: 's1', date: '2026-11-17', volume: 6 });
      const second = backup.writeSiteBackups(root, backup.buildSiteBackups(changed, later.toISOString(), 'x'), later, fs);
      assert.deepEqual(second.map(r => r.saved), [true, false]);
      assert.deepEqual(fs.readdirSync(path.dirname(first[0].file)).sort(), ['신반포 22차 현대ENG_2026-11-16_1900.json', '신반포 22차 현대ENG_2026-11-17_1900.json']);
      // Same minute twice with different records: the earlier file stays and the new one gets a number.
      changed.pouring_logs.push({ id: 'l5', site_id: 's1', date: '2026-11-17', volume: 6 });
      const third = backup.writeSiteBackups(root, backup.buildSiteBackups(changed, later.toISOString(), 'x'), later, fs);
      assert.equal(path.basename(third[0].file), '신반포 22차 현대ENG_2026-11-17_1900 (2).json');
      assert.equal(fs.readdirSync(path.dirname(first[0].file)).filter(f => f.endsWith('.part')).length, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  console.log(`${count} photo archive checks passed.`);
})().catch(e => { console.error(e); process.exit(1); });
