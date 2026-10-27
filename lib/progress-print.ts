import { ProgressBuilding, progressRows } from './pouring-progress';

export function progressPrintPages(buildings: ProgressBuilding[]) {
  const pages = [];
  for (let b = 0; b < buildings.length; b += 4) {
    const group = buildings.slice(b, b + 4);
    const rows = progressRows(group);
    for (let r = 0; r < rows.length; r += 30) {
      pages.push({ buildings: group, rows: rows.slice(r, r + 30) });
    }
  }
  return pages;
}
