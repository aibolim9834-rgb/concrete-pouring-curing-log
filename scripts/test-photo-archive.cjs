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
  console.log(`${count} photo archive checks passed.`);
})().catch(e => { console.error(e); process.exit(1); });
