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
const { progressPrintLayout, PRINT_PAGE } = load('progress-print');
// Every building and stage is on one sheet: the rows, the two header lines (building names may wrap) and the title fit the page height,
// and a date still fits its column at the chosen size. A small site keeps the full size.
for (const [count, stages] of [[1,10],[2,50],[5,40],[6,36],[12,65],[20,80]]) {
  const buildings = Array.from({ length: count }, (_, b) => ({ id: String(b), name: `${b}동`, records: { f1: { color: '#FFFF00', date: '2026-10-25' } }, stages: Array.from({ length: stages }, (_, s) => ({ id: `f${s}`, name: `${s}층`, order: s })) }));
  const before = JSON.stringify(buildings), layout = progressPrintLayout(buildings);
  assert.equal(layout.rows.length, stages);
  assert.ok((layout.rows.length + 3) * layout.rowHeight + PRINT_PAGE.title <= PRINT_PAGE.height, `${count}x${stages} fits the page height`);
  assert.ok(layout.fontSize >= 5 && layout.fontSize <= 13 && layout.fontSize <= layout.rowHeight);
  const dateWidth = (PRINT_PAGE.width - layout.stageWidth) / (count * 3);
  assert.ok(layout.fontSize === 5 || dateWidth >= layout.fontSize * 4.6 + 4, `${count}x${stages} dates fit their column`);
  if (count === 1) assert.deepEqual([layout.fontSize, layout.rowHeight], [13, 26]);
  assert.equal(JSON.stringify(buildings), before);
}
console.log('Print layout: one sheet for any building and stage count, dates fit, data/color preservation passed');
