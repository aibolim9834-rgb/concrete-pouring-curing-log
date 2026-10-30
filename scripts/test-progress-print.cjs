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
assert.equal(progressPrintLayout([]), null);
// Every building is one block of its own floors on one A4 portrait sheet: block rows (with two header rows and a possibly
// wrapped name) fit the page height, blocks fit the width, a date fits its column, and every building appears once in order.
for (const [count, stages] of [[1,10],[2,50],[6,36],[7,41],[12,65],[20,80]]) {
  const buildings = Array.from({ length: count }, (_, b) => ({ id: String(b), name: `${b}동`, records: { f1: { color: '#FFFF00', date: '2026-10-25' } }, stages: Array.from({ length: stages - (b % 3) }, (_, s) => ({ id: `f${s}`, name: `${s}F`, order: s })) }));
  const before = JSON.stringify(buildings), layout = progressPrintLayout(buildings);
  assert.deepEqual(layout.groups.flat().map(block => block.building.id), buildings.map(b => b.id));
  for (const block of layout.groups.flat()) assert.deepEqual(block.stages.map(s => s.order), [...block.building.stages].map(s => s.order).sort((a, b) => b - a));
  const perRow = layout.groups[0].length;
  assert.ok(layout.groups.every(group => group.length <= perRow));
  const lines = layout.groups.reduce((sum, group) => sum + Math.max(...group.map(block => block.stages.length)) + 3, 0);
  assert.ok(lines * layout.rowHeight + PRINT_PAGE.title + (layout.groups.length - 1) * PRINT_PAGE.rowGap <= PRINT_PAGE.height, `${count}x${stages} fits the page height`);
  assert.ok(perRow * layout.blockWidth + (perRow - 1) * PRINT_PAGE.columnGap <= PRINT_PAGE.width + 0.5, `${count}x${stages} fits the page width`);
  assert.ok(layout.fontSize === 4 || layout.blockWidth - layout.floorWidth >= layout.fontSize * 4.8 + 4, `${count}x${stages} dates fit their column`);
  if (count === 7 && stages === 41) assert.deepEqual([perRow, layout.groups.length], [7, 1]);
  assert.equal(JSON.stringify(buildings), before);
}
console.log('Print layout: building blocks wrap into rows on one A4 portrait sheet, dates fit, order and data preserved');
