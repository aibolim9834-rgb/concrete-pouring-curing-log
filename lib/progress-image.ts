import { buildingLabel, ProgressBuilding } from './pouring-progress';
import { progressPrintLayout } from './progress-print';
import { progressColor } from './progress-color';
import { pourDatesLabel } from './progress-entries';
import { shortDate } from './date-only';

// The JPG is the printed 타설현황 sheet: A4 portrait with 10mm margins, drawn with the sizes the print CSS in globals.css
// gives (there vw and vh measure the 190 x 277mm page area). 3 pixels per CSS px is about 290 dpi.
const MM = 96 / 25.4, MARGIN = 10 * MM, PAGE_W = 210 * MM, PAGE_H = 297 * MM, SCALE = 3;
const FONT = '"Pretendard Variable", Pretendard, sans-serif';

// Breaks text where the printed table does: at spaces, and inside a word only when the word alone is too wide.
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const word of text.split(' ').filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last && ctx.measureText(`${last} ${word}`).width <= width) { lines[lines.length - 1] = `${last} ${word}`; continue; }
    let rest = word;
    while (rest.length > 1 && ctx.measureText(rest).width > width) {
      let cut = rest.length - 1;
      while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > width) cut--;
      lines.push(rest.slice(0, cut)); rest = rest.slice(cut);
    }
    lines.push(rest);
  }
  return lines.length ? lines : [''];
}

export async function progressImage(buildings: ProgressBuilding[], siteName: string, basis: string, ink: (color: string) => string) {
  const layout = progressPrintLayout(buildings);
  if (!layout) throw new Error('JPG로 저장할 동이 없습니다.');
  const { groups } = layout;
  const title = `${siteName} · 동별 타설현황`, subtitle = `${shortDate(basis)} 기준 · ${buildings.length}개 동`;
  // Pretendard is split by character range, so the characters on the sheet are fetched before drawing.
  const text = [title, subtitle, '층타설일', ...buildings.flatMap(b => [buildingLabel(b.name), ...b.stages.map(s => s.name), ...Object.values(b.records).map(pourDatesLabel)])].join('');
  await Promise.all([400, 600, 700].map(weight => document.fonts.load(`${weight} 16px ${FONT}`, text)));

  const W = PAGE_W - 2 * MARGIN, H = PAGE_H - 2 * MARGIN, vw = W / 100, vh = H / 100;
  const perRow = groups[0].length, lines = groups.reduce((sum, group) => sum + Math.max(...group.map(block => block.stages.length)) + 3, 0);
  const row = (97 * vh - 6.8 * vw - (groups.length - 1) * 1.7 * vw) / lines;
  const blockWidth = (W - (perRow - 1) * 1.4 * vw) / perRow;
  const font = Math.min(1.81 * vw, row * 0.62, (blockWidth - 1.35 * vw) / 9);
  const floorWidth = 4.2 * font + 0.8 * vw, dateWidth = blockWidth - floorWidth;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_W * SCALE); canvas.height = Math.round(PAGE_H * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 이미지를 만들 수 없습니다.');
  const setFont = (weight: number, size: number) => { ctx.font = `${weight} ${size}px ${FONT}`; };
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H); // JPG has no transparency
  ctx.translate(MARGIN, MARGIN);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  setFont(700, 2.2 * vw); ctx.fillStyle = '#111'; ctx.fillText(title, W / 2, 1.5 * vw, W);
  setFont(400, 1.5 * vw); ctx.fillStyle = '#333'; ctx.fillText(subtitle, W / 2, 4.6 * vw, W);
  let y = 6.75 * vw;

  // A table cell: 1px #7b8780 border, 2px side padding, text centered and cut at the cell edge.
  const cell = (x: number, top: number, w: number, h: number, background: string | undefined, color: string, weight: number, textLines: string[], size: number, lineHeight: number) => {
    if (background) { ctx.fillStyle = background; ctx.fillRect(x, top, w, h); }
    ctx.strokeStyle = '#7b8780'; ctx.lineWidth = 1; ctx.strokeRect(x, top, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 2, top, w - 4, h); ctx.clip();
    setFont(weight, size); ctx.fillStyle = color;
    textLines.forEach((line, i) => ctx.fillText(line, x + w / 2, top + h / 2 + (i - (textLines.length - 1) / 2) * lineHeight));
    ctx.restore();
  };
  for (const group of groups) {
    const height = Math.max(...group.map(block => block.stages.length));
    setFont(700, font);
    const names = group.map(({ building }) => wrap(ctx, buildingLabel(building.name), blockWidth - 4));
    const nameHeight = Math.max(row, ...names.map(name => name.length * font * 1.15 + 2));
    group.forEach(({ building, stages }, index) => {
      const x = index * (blockWidth + 1.4 * vw);
      cell(x, y, blockWidth, nameHeight, '#e8efea', '#111', 700, names[index], font, font * 1.15);
      cell(x, y + nameHeight, floorWidth, row, '#e8efea', '#111', 700, ['층'], font, row);
      cell(x + floorWidth, y + nameHeight, dateWidth, row, '#e8efea', '#111', 700, ['타설일'], font, row);
      // Shorter buildings leave the top empty so 버림·기초·1F line up across the row.
      let top = y + nameHeight + (height - stages.length + 1) * row;
      for (const stage of stages) {
        const record = building.records[stage.id], background = progressColor(record), color = background ? ink(background) : '#111';
        const label = record?.date ? pourDatesLabel(record) : '';
        cell(x, top, floorWidth, row, '#f1f4f1', '#111', 600, [stage.name], font, row);
        // Several pour dates (25.09.26, 10.10) take two half-height lines inside the same row.
        if (record?.dates && record.dates.length > 1) {
          const half = (row - 2) / 2, size = Math.min(font, half);
          setFont(600, size);
          cell(x + floorWidth, top, dateWidth, row, background, color, 600, wrap(ctx, label, dateWidth - 4), size, half);
        } else cell(x + floorWidth, top, dateWidth, row, background, color, 600, [label], font, row);
        top += row;
      }
    });
    y += nameHeight + (height + 1) * row + 1.7 * vw;
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('JPG 이미지를 만들지 못했습니다.')), 'image/jpeg', 0.92));
}
