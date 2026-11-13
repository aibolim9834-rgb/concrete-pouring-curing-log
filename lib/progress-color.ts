import { ProgressDocument, ProgressRecord } from './pouring-progress';

// An optional display flag keeps legacy colors and all record details intact.
export const progressColor = (record: ProgressRecord | undefined) => record?.colorCleared ? undefined : record?.color;

// Clearing on purpose also ends the automatic month fill, so a later date change leaves the cell blank.
export function clearProgressColor(record: ProgressRecord | undefined): ProgressRecord | undefined {
  if (!record || record.colorCleared) return record;
  const next: ProgressRecord = { ...record, colorCleared: true };
  delete next.colorAuto;
  return next;
}

// A color picked by hand replaces the automatic month fill for good.
export function setProgressColor(record: ProgressRecord | undefined, color: string): ProgressRecord {
  const next: ProgressRecord = { ...(record || { date: '', status: 'none' }), color };
  delete next.colorCleared;
  delete next.colorAuto;
  return next;
}

// Colors come from the site's own records, so the recent list follows the site across browsers.
export function recentProgressColors(document: ProgressDocument, exclude: string[], limit = 10) {
  const skip = new Set(['#FFFFFF', ...exclude.map(c => c.toUpperCase())]), latest = new Map<string, string>();
  for (const b of document.buildings) for (const r of Object.values(b.records)) {
    const color = progressColor(r)?.toUpperCase();
    if (color && !skip.has(color) && (latest.get(color) ?? '') <= r.date) latest.set(color, r.date);
  }
  return Array.from(latest).sort((a, c) => c[1].localeCompare(a[1])).slice(0, limit).map(([color]) => color);
}

// Twenty-four light colors used one per month in turn from the site's first pour month, so no color returns within
// 24 months. The order keeps neighbouring months and the same month a year apart clearly different; every color keeps
// dark text at 7.7:1 or more.
export const MONTH_COLORS = ['#8CCF7E','#B6E6FF','#FE9A9A','#C0C257','#DDD9FF','#E3E67B','#93BCFF','#FED2D0','#78FAD1','#DF9EEE','#FED898','#50D5AE',
  '#CCDFFF','#FDA16B','#62F7FF','#F6CEFF','#E6B14E','#B9AEFF','#FFD4BC','#20D3DB','#F997C6','#AFF3A0','#4FC9FE','#FECEE4'];
// From a site's 25th month the turn's color is already on the table, so the month takes a spare the site has not used (text 9.6:1 or more).
export const SPARE_COLORS = ['#FEBBAA','#6EE5D7','#FBB2EA','#BDDB8A','#BFCBFF','#FFBF81','#6DE0FB','#FEB7C6','#91E3AE','#DCBFFF','#E4CD77','#A3D4FE'];
const BLANK = '#ffffff';
const monthsFrom = (start: string, date: string) => (Number(date.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(date.slice(5, 7)) - Number(start.slice(5, 7));
export const cycleMonthColor = (start: string, date: string) => MONTH_COLORS[(monthsFrom(start, date) % 24 + 24) % 24];

// The site's first pour month counts as color 1. It is stored once painting starts, so an earlier date entered later
// takes its own turn instead of shifting every month's color.
function ensureColorStart(document: ProgressDocument) {
  if (!document.colorStart) {
    const first = document.buildings.flatMap(b => Object.values(b.records).map(r => r.date)).filter(Boolean).sort()[0];
    if (first) document.colorStart = first.slice(0, 7);
  }
  return document.colorStart;
}

// The site's color for the month of `date`: the fill most of that month's cells already carry, so a month painted
// by hand keeps its color; otherwise the month's turn in the cycle, or a spare when that color is already in use.
export function monthColor(document: ProgressDocument, date: string, skipKey = '') {
  const month = date.slice(0, 7), counts = new Map<string, number>(), used = new Set<string>();
  for (const b of document.buildings) for (const [sid, r] of Object.entries(b.records)) {
    const color = progressColor(r)?.toUpperCase();
    if (`${b.id}:${sid}` === skipKey || !r.date || !color || color === BLANK.toUpperCase()) continue;
    if (r.date.slice(0, 7) === month) counts.set(color, (counts.get(color) || 0) + 1); else used.add(color);
  }
  let best = '', most = 0;
  counts.forEach((n, color) => { if (n > most) { best = color; most = n; } });
  if (best) return best;
  const turn = cycleMonthColor(document.colorStart || month, date);
  return used.has(turn) ? SPARE_COLORS.find(c => !used.has(c)) || turn : turn;
}

const unpainted = (r: ProgressRecord) => !r.colorCleared && r.color.toLowerCase() === BLANK;

// Called after a cell's pour date is entered or changed. A cell with no fill, or one still carrying its automatic
// month fill, takes the new month's color; a hand-picked color or a fill cleared on purpose stays as it is.
export function applyMonthColor(document: ProgressDocument, bid: string, sid: string, before: ProgressRecord | undefined) {
  const b = document.buildings.find(x => x.id === bid), r = b?.records[sid];
  if (!b || !r || r.date === (before?.date || '') || !(r.colorAuto || unpainted(r))) return;
  if (!r.date) { const next: ProgressRecord = { ...r, color: BLANK }; delete next.colorAuto; b.records[sid] = next; return; }
  ensureColorStart(document);
  b.records[sid] = { ...r, color: monthColor(document, r.date, `${bid}:${sid}`), colorAuto: true };
}

// Fills every dated cell that has no fill yet with its month color, oldest pour first; returns how many cells changed.
export function fillMonthColors(document: ProgressDocument) {
  const targets = document.buildings.flatMap(b => Object.entries(b.records).filter(([, r]) => r.date && unpainted(r)).map(([sid, r]) => ({ b, sid, date: r.date })))
    .sort((x, y) => x.date.localeCompare(y.date));
  if (targets.length) ensureColorStart(document);
  for (const { b, sid, date } of targets) b.records[sid] = { ...b.records[sid], color: monthColor(document, date), colorAuto: true };
  return targets.length;
}
