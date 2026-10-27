import { ProgressRecord } from './pouring-progress';

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
