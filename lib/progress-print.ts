import { ProgressBuilding, progressRows } from './pouring-progress';

// The printed sheet is A3 landscape with 10mm margins: 400 x 277mm, which is 1512 x 1047 CSS px.
export const PRINT_PAGE = { width: 1512, height: 1047, title: 50 };

// Every building and stage goes on one sheet; text size, row height and the stage column shrink to fit.
export function progressPrintLayout(buildings: ProgressBuilding[]) {
  const rows = progressRows(buildings);
  // Body rows plus two header rows, where long building names may wrap to a second line.
  const lines = rows.length + 3;
  const rowHeight = Math.max(8, Math.min(26, Math.floor((PRINT_PAGE.height * 0.97 - PRINT_PAGE.title) / lines)));
  // A date such as 26.10.30 is about 4.6em wide and a stage name such as 지상 25층 about 6em.
  const dateWidth = (size: number) => (PRINT_PAGE.width - (size * 6 + 8)) / Math.max(1, buildings.length * 3);
  let fontSize = Math.min(13, Math.floor(rowHeight * 0.62));
  while (fontSize > 5 && dateWidth(fontSize) < fontSize * 4.6 + 4) fontSize--;
  fontSize = Math.max(5, fontSize);
  return { rows, rowHeight, fontSize, stageWidth: Math.ceil(fontSize * 6 + 8) };
}
