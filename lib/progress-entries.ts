import { buildingLabel, ProgressDocument, ProgressEntry, ProgressRecord, validateProgressEntry, validateProgressRecord, validDate } from './pouring-progress';
import { scheduleMetrics } from './progress-schedule';
import { progressColor } from './progress-color';
import { csvCell } from './csv';
import { normalizeShortDate } from './date-only';

export interface EntryDraft { id?: string; member: string; zone: string; volume: string; remarks: string }
export function entryFromDraft(draft: EntryDraft, id: string): ProgressEntry {
  const volume = draft.volume.trim();
  const entry = { id: draft.id || id, member: draft.member.trim(), zone: draft.zone.trim(), volume: volume === '' ? null : Number(volume), remarks: draft.remarks.trim() };
  validateProgressEntry(entry);
  return entry;
}

// Optional entries extend v1 without replacing existing dates, colors or blank cells.
export function updateProgressRecord(record: ProgressRecord | undefined, date: string, color: string): ProgressRecord {
  const next: ProgressRecord = { ...record, date, status: date ? 'done' : 'none', color };
  validateProgressRecord(next);
  return next;
}
export function upsertProgressEntry(record: ProgressRecord | undefined, entry: ProgressEntry, date: string, color: string): ProgressRecord {
  validateProgressEntry(entry);
  if (!validDate(date)) throw new Error('공통 타설일을 먼저 입력해주세요.');
  if (record?.date && record.date !== date) throw new Error('공통 타설일이 바뀌었습니다. 먼저 표의 타설일을 저장해주세요.');
  const entries = record?.entries || [];
  const next: ProgressRecord = { ...record, date, color: record?.color || color, status: 'done', entries: entries.some(e => e.id === entry.id) ? entries.map(e => e.id === entry.id ? entry : e) : [...entries, entry] };
  validateProgressRecord(next);
  return next;
}
export function removeProgressEntry(record: ProgressRecord, id: string): ProgressRecord {
  if (!record.entries?.some(e => e.id === id)) throw new Error('삭제할 구역 기록을 다시 선택해주세요.');
  return { ...record, status: record.date ? 'done' : 'none', entries: record.entries.filter(e => e.id !== id) };
}

// Retain the basis argument for existing callers; exports display every recorded date.
export function progressCsv(document: ProgressDocument, filter: string, _basis: string) {
  const lines: (string | number)[][] = [['동', '층·단계', '타설일', '타설일 목록', '상태', '구조부위', '구역', '물량(m³)', '비고', '색상', '예정 타설일', '예정 작업일', '실시 작업일', '계획 대비 차이(일)']];
  for (const b of document.buildings.filter(b => filter === 'all' || b.id === filter)) {
    for (const s of [...b.stages].sort((a, c) => c.order - a.order)) {
      const r = b.records[s.id];
      const base = [buildingLabel(b.name), s.name, r?.date || '', pourDates(r).join(', '), r?.date ? '완료' : '미입력'];
      const metrics = scheduleMetrics(b,s.id,r);
      const schedule = [r?.plannedDate || '',metrics.plannedDays ?? '',metrics.actualDays ?? '',metrics.variance ?? ''];
      if (r?.entries?.length) for (const e of r.entries) lines.push([...base, e.member, e.zone, e.volume ?? '', e.remarks, progressColor(r) || '', ...schedule]);
      else lines.push([...base, '', '', '', '', progressColor(r) || '', ...schedule]);
    }
  }
  return '\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export const pourDates = (record: ProgressRecord | undefined) => record?.dates || (record?.date ? [record.date] : []);
// A single date is stored as before (no `dates`), so older records and exports keep their shape.
export function setPourDates(record: ProgressRecord | undefined, dates: string[], color: string): ProgressRecord {
  const list = Array.from(new Set(dates)).sort();
  if (list.some(d => !validDate(d))) throw new Error('올바른 날짜를 입력해주세요.');
  if (!list.length && record?.entries?.length) throw new Error('구역 내역이 있는 타설일은 비울 수 없습니다.');
  const next: ProgressRecord = { ...(record || { color }), date: list[list.length - 1] || '', status: list.length ? 'done' : 'none', color: record?.color || color };
  if (list.length > 1) next.dates = list; else delete next.dates;
  validateProgressRecord(next);
  return next;
}
// First date in full, later dates in the same year as month.day: 25.04.01, 04.03, 04.05
export function pourDatesLabel(record: ProgressRecord | undefined) {
  const list = pourDates(record);
  return list.map((d, i) => i && d.slice(0, 4) === list[0].slice(0, 4) ? d.slice(5).replace('-', '.') : d.slice(2).replaceAll('-', '.')).join(', ');
}
// Comma-separated pour dates typed in a cell: "26-07-01, 26-07-03" or "260701, 260703".
export function parsePourDateList(text: string): string[] {
  const parts = text.split(',').map(s => s.trim()).filter(Boolean), dates = parts.map(normalizeShortDate);
  const bad = parts.filter((_, i) => !dates[i]);
  if (bad.length) throw new Error(`날짜 형식을 확인해주세요: ${bad.join(', ')} (예: 26-07-09)`);
  return Array.from(new Set(dates as string[])).sort();
}
