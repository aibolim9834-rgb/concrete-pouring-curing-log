import { ProgressBuilding, ProgressStage } from './pouring-progress';

// The printed sheet is A4 portrait with 10mm margins: 190 x 277mm, which is 718 x 1047 CSS px.
export const PRINT_PAGE = { width: 718, height: 1047, title: 50, rowGap: 12, columnGap: 10 };

export interface PrintBlock { building: ProgressBuilding; stages: ProgressStage[] }

// Each building is its own block of floors and 타설일. Blocks fill a row left to right and wrap to the next row;
// the number per row is the one that leaves the largest readable text with everything on one sheet.
export function progressPrintLayout(buildings: ProgressBuilding[]) {
  if (!buildings.length) return null;
  const blocks: PrintBlock[] = buildings.map(building => ({ building, stages: [...building.stages].sort((a, b) => b.order - a.order) }));
  let best: { groups: PrintBlock[][]; rowHeight: number; fontSize: number; blockWidth: number; floorWidth: number } | null = null;
  for (let perRow = 1; perRow <= blocks.length; perRow++) {
    const groups: PrintBlock[][] = [];
    for (let i = 0; i < blocks.length; i += perRow) groups.push(blocks.slice(i, i + perRow));
    // Each block row adds its two header rows; the building name may wrap once, so it counts as two lines.
    const lines = groups.reduce((sum, group) => sum + Math.max(...group.map(block => block.stages.length)) + 3, 0);
    const rowHeight = Math.max(6, Math.min(24, Math.floor((PRINT_PAGE.height * 0.97 - PRINT_PAGE.title - (groups.length - 1) * PRINT_PAGE.rowGap) / lines)));
    const blockWidth = (PRINT_PAGE.width - (perRow - 1) * PRINT_PAGE.columnGap) / perRow;
    // The floor column takes about 4.2em (B1F, 옥탑) and a date such as 25.09.26 about 4.8em.
    let fontSize = Math.min(13, Math.floor(rowHeight * 0.62));
    while (fontSize > 4 && blockWidth - (fontSize * 4.2 + 6) < fontSize * 4.8 + 4) fontSize--;
    if (!best || fontSize > best.fontSize || (fontSize === best.fontSize && rowHeight > best.rowHeight)) best = { groups, rowHeight, fontSize, blockWidth, floorWidth: fontSize * 4.2 + 6 };
  }
  return best;
}
