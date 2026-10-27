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
const { progressPrintPages } = load('progress-print');
assert.equal(progressPrintPages([]).length, 0);
for (const [count, stages, expected] of [[4,27,1],[12,27,3],[12,65,9],[5,31,4]]) {
  const buildings = Array.from({ length: count }, (_, b) => ({ id: String(b), name: `${b}동`, records: { f1: { color: '#FFFF00', date: '2026-10-25' } }, stages: Array.from({ length: stages }, (_, s) => ({ id: `f${s}`, name: `${s}층`, order: s })) }));
  const before = JSON.stringify(buildings), pages = progressPrintPages(buildings), pairs = new Set();
  assert.equal(pages.length, expected);
  for (const page of pages) {
    assert.ok(page.buildings.length <= 4 && page.rows.length <= 30);
    for (const b of page.buildings) for (const r of page.rows) { const key = `${b.id}:${r.id}`; assert.ok(!pairs.has(key)); pairs.add(key); }
  }
  assert.equal(pairs.size, count * stages);
  assert.equal(JSON.stringify(buildings), before);
}
console.log('Print pagination: page counts, complete nonduplicate coverage, data/color preservation passed');
