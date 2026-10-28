import { ProgressDocument, ProgressRecord } from './pouring-progress';

// An optional display flag keeps legacy colors and all record details intact.
export const progressColor = (record: ProgressRecord | undefined) => record?.colorCleared ? undefined : record?.color;

export function clearProgressColor(record: ProgressRecord | undefined): ProgressRecord | undefined {
  return record && !record.colorCleared ? { ...record, colorCleared: true } : record;
}

export function setProgressColor(record: ProgressRecord | undefined, color: string): ProgressRecord {
  const next: ProgressRecord = { ...(record || { date: '', status: 'none' }), color };
  delete next.colorCleared;
  return next;
}

// Colors come from the site's own records, so the recent list follows the site across browsers.
export function recentProgressColors(document: ProgressDocument, exclude: string[], limit = 5) {
  const skip = new Set(['#FFFFFF', ...exclude.map(c => c.toUpperCase())]), latest = new Map<string, string>();
  for (const b of document.buildings) for (const r of Object.values(b.records)) {
    const color = progressColor(r)?.toUpperCase();
    if (color && !skip.has(color) && (latest.get(color) ?? '') <= r.date) latest.set(color, r.date);
  }
  return Array.from(latest).sort((a, c) => c[1].localeCompare(a[1])).slice(0, limit).map(([color]) => color);
}
