const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, id => load(id.replace('./', '')));
  return m.exports;
}
const { buildReport, reportOptions, reportDates, validateReportOptions, reportDayLabel, REPORT_ITEMS } = load('daily-report');
const { validateSites } = load('log-data');

const log = (over) => ({ id: Math.random().toString(36), site_id: 's1', category: '1', date: '2026-10-28', building: '103동', floor: '15F', member_type: '슬라브', min_temp: 7, max_temp: 18, weather: '맑음', remicon_company: '삼표', strength: '24MPa', volume: 128, curing_watering: '1일 2회 살수', curing_protection: '비닐 보양', remarks: '', ...over });
const logs = [
  log({}),
  log({ member_type: '계단', volume: '7' }),
  log({ building: '101동', floor: '16F', member_type: '벽', min_temp: 8, max_temp: 19, remicon_company: '유진레미콘', volume: 38, curing_watering: '', curing_protection: '', remarks: '펌프카 52M 1대' }),
  log({ date: '2026-10-27', building: '102동', floor: '14F', weather: '흐림', volume: 133 }),
  log({ date: '2026-10-27', building: '102동', floor: '14F', member_type: '벽', weather: '비', volume: '', min_temp: null, max_temp: null }),
];
const before = JSON.stringify(logs);
const site = '대구 범어 자이 S&D';

// A site with nothing saved starts with 일자·동·층·벽/슬라브·기상·타설강도·타설물량, format A, no title line.
const defaults = reportOptions(null);
assert.equal(defaults.format, 'A');
assert.deepEqual(Object.keys(defaults.items).filter(k => defaults.items[k]), ['date', 'building', 'floor', 'member', 'weather', 'strength', 'volume']);
assert.equal(Object.keys(defaults.items).length, REPORT_ITEMS.length);
assert.equal(buildReport(site, logs, '2026-10-28', defaults), [
  '- 10/28(수) 101동 16F 벽 24MPa 38m³',
  '- 10/28(수) 103동 15F 슬라브 24MPa 128m³',
  '- 10/28(수) 103동 15F 계단 24MPa 7m³',
  '합계 173m³',
  '기상 맑음',
].join('\n'));
assert.equal(buildReport(site, logs, '2026-10-28', { ...defaults, format: 'B' }), [
  '■ 일자: 2026-10-28(수)', '■ 기상: 맑음', '■ 타설 내용',
  '  1) 101동 16F 벽 · 24MPa · 38m³', '  2) 103동 15F 슬라브 · 24MPa · 128m³', '  3) 103동 15F 계단 · 24MPa · 7m³',
  '■ 합계: 173m³',
].join('\n'));

// Everything on: the title carries the date once, trucks follow each volume, a missing volume is named and left out of the total.
const all = reportOptions({ format: 'A', items: Object.fromEntries(REPORT_ITEMS.map(([k]) => [k, true])) });
assert.equal(buildReport(site, logs, '2026-10-27', all), [
  '[10/27(화) 대구 범어 자이 S&D 타설 보고]',
  '- 102동 14F 슬라브 24MPa 133m³(23대) / 삼표',
  '- 102동 14F 벽 24MPa 물량 미입력 / 삼표',
  '합계 133m³(23대) · 물량 미입력 1건',
  '기상 흐림·비, 최저 7℃ / 최고 18℃',
  '양생 1일 2회 살수, 비닐 보양',
].join('\n'));
const allB = buildReport(site, logs, '2026-10-28', { ...all, format: 'B' }).split('\n');
assert.equal(allB[0], '■ 현장: 대구 범어 자이 S&D');
assert.ok(allB.includes('■ 레미콘사: 유진레미콘, 삼표'));
assert.ok(allB.includes('■ 비고: 101동 16F 벽 펌프카 52M 1대'));
assert.ok(allB.includes('■ 합계: 173m³(31대)'));

// Turning 타설물량 off drops every volume and the 합계 line; decimals add without float noise.
assert.ok(!buildReport(site, logs, '2026-10-28', reportOptions({ format: 'A', items: { volume: false } })).includes('m³'));
assert.ok(buildReport(site, [log({ volume: 0.1 }), log({ volume: 0.2 })], '2026-10-28', defaults).includes('합계 0.3m³'));

// A stored value missing an item (added later) takes that item's default; a saved choice wins.
assert.deepEqual(reportOptions({ format: 'B', items: { title: true, weather: false } }).items.weather, false);
assert.equal(reportOptions({ format: 'B', items: { title: true } }).items.volume, true);
assert.equal(reportOptions({ format: 'B', items: {} }).format, 'B');

// Stored values are checked where sites are read.
validateReportOptions(null); validateReportOptions(undefined);
validateReportOptions({ format: 'A', items: { date: false } });
for (const bad of [{ format: 'C', items: {} }, { format: 'A' }, { format: 'A', items: { date: 'yes' } }, { format: 'A', items: [] }, [], 'A'])
  assert.throws(() => validateReportOptions(bad), /보고 문구 설정/);
validateSites([{ id: 's1', name: '현장', report_options: { format: 'B', items: { title: true } } }, { id: 's2', name: '현장2', report_options: null }]);
assert.throws(() => validateSites([{ id: 's1', name: '현장', report_options: { format: 'X', items: {} } }]), /보고 문구 설정/);

assert.deepEqual(reportDates(logs), [{ date: '2026-10-28', count: 3 }, { date: '2026-10-27', count: 2 }]);
assert.equal(reportDayLabel('2026-11-02'), '11/2(월)');
assert.equal(JSON.stringify(logs), before);
console.log('Daily report: default items, both formats, missing volumes, stored options and validation');
