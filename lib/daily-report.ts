import type { PouringLog } from './types';
import { remiconTrucks } from './remicon';

// 일일 보고 문구: one day's 타설일지 of a site as a short message for 카톡·문자. Nothing here changes a log.
// Items follow the 일지 table's columns; the third value is whether a site with no saved choice starts with it checked.
export const REPORT_ITEMS = [
  ['title', '제목 줄(현장명)', false], ['date', '일자', true], ['building', '동(구역)', true], ['floor', '층', true],
  ['member', '벽/슬라브', true], ['temp', '최저·최고온도', false], ['weather', '기상', true], ['remicon', '레미콘사', false],
  ['strength', '타설강도', true], ['volume', '타설물량', true], ['trucks', '레미콘 대수', false], ['watering', '살수', false],
  ['protection', '보양', false], ['remarks', '비고', false],
] as const;
export type ReportItem = typeof REPORT_ITEMS[number][0];
export type ReportFormat = 'A' | 'B'; // A 간단 (한 줄씩), B 항목형 (■ 항목)
// What sites.report_options holds. Items missing from a stored value (added to the app later) use their default.
export interface ReportOptions { format: ReportFormat; items: Partial<Record<ReportItem, boolean>> }

export function validateReportOptions(value: unknown) {
  if (value == null) return;
  const v = value as ReportOptions;
  if (typeof v !== 'object' || Array.isArray(v) || (v.format !== 'A' && v.format !== 'B') || !v.items || typeof v.items !== 'object' || Array.isArray(v.items)
    || Object.values(v.items).some(on => typeof on !== 'boolean')) throw new Error('현장의 보고 문구 설정이 올바르지 않습니다.');
}
export function reportOptions(stored: ReportOptions | null | undefined): { format: ReportFormat; items: Record<ReportItem, boolean> } {
  return { format: stored?.format ?? 'A', items: Object.fromEntries(REPORT_ITEMS.map(([key, , on]) => [key, stored?.items[key] ?? on])) as Record<ReportItem, boolean> };
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const weekday = (date: string) => { const [y, m, d] = date.split('-').map(Number); return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
export const reportDayLabel = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}(${weekday(date)})`;
export const reportFullDay = (date: string) => `${date}(${weekday(date)})`;

// Dates that have logs, newest first, with how many logs each has.
export function reportDates(logs: PouringLog[]) {
  const counts = new Map<string, number>();
  for (const log of logs) counts.set(log.date, (counts.get(log.date) || 0) + 1);
  return Array.from(counts, ([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date));
}

const collator = new Intl.Collator('ko', { numeric: true });
const uniq = (values: (string | undefined)[]) => Array.from(new Set(values.map(v => (v ?? '').trim()).filter(Boolean)));
const amount = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

export function buildReport(siteName: string, logs: PouringLog[], date: string, options: ReturnType<typeof reportOptions>): string {
  const o = options.items;
  const rows = logs.filter(log => log.date === date).sort((a, b) => collator.compare(a.building, b.building) || collator.compare(a.floor, b.floor));
  const mins = rows.flatMap(r => r.min_temp === null ? [] : [r.min_temp]), maxs = rows.flatMap(r => r.max_temp === null ? [] : [r.max_temp]);
  const temp = o.temp && (mins.length || maxs.length) ? `최저 ${mins.length ? Math.min(...mins) : '-'}℃ / 최고 ${maxs.length ? Math.max(...maxs) : '-'}℃` : '';
  const sky = [o.weather ? uniq(rows.map(r => r.weather)).join('·') : '', temp].filter(Boolean).join(', ');
  const curing = [...(o.watering ? uniq(rows.map(r => r.curing_watering)) : []), ...(o.protection ? uniq(rows.map(r => r.curing_protection)) : [])];
  let total = 0, trucks = 0, missing = 0;
  // Volumes are counted while the lines are written, so the 합계 line goes after them.
  const volume = (r: PouringLog) => {
    if (!o.volume) return '';
    const v = r.volume === null || r.volume === undefined || String(r.volume).trim() === '' ? NaN : Number(r.volume);
    if (!Number.isFinite(v)) { missing++; return '물량 미입력'; }
    total += v; trucks += remiconTrucks(v);
    return `${amount(v)}m³${o.trucks ? `(${remiconTrucks(v)}대)` : ''}`;
  };
  const place = (r: PouringLog) => [o.building && r.building, o.floor && r.floor, o.member && r.member_type].filter(Boolean).join(' ');
  const totalText = () => `${amount(Math.round(total * 100) / 100)}m³${o.trucks ? `(${trucks}대)` : ''}${missing ? ` · 물량 미입력 ${missing}건` : ''}`;

  if (options.format === 'A') {
    // With the title line the date sits in it once; without it each line starts with the date.
    const lines = o.title ? [`[${o.date ? `${reportDayLabel(date)} ` : ''}${siteName} 타설 보고]`] : [];
    for (const r of rows) {
      const main = [!o.title && o.date && reportDayLabel(date), place(r), o.strength && r.strength, volume(r)].filter(Boolean).join(' ');
      const extra = [o.remicon && r.remicon_company, o.remarks && r.remarks?.trim() && `(${r.remarks.trim()})`].filter(Boolean).join(' ');
      lines.push(`- ${main}${extra ? ` / ${extra}` : ''}`);
    }
    if (o.volume) lines.push(`합계 ${totalText()}`);
    if (sky) lines.push(`기상 ${sky}`);
    if (curing.length) lines.push(`양생 ${curing.join(', ')}`);
    return lines.join('\n');
  }
  const lines = o.title ? [`■ 현장: ${siteName}`] : [];
  if (o.date) lines.push(`■ 일자: ${reportFullDay(date)}`);
  if (sky) lines.push(`■ 기상: ${sky}`);
  lines.push('■ 타설 내용');
  rows.forEach((r, i) => lines.push(`  ${i + 1}) ${[place(r), o.strength && r.strength, volume(r)].filter(Boolean).join(' · ')}`));
  if (o.volume) lines.push(`■ 합계: ${totalText()}`);
  const companies = o.remicon ? uniq(rows.map(r => r.remicon_company)) : [];
  if (companies.length) lines.push(`■ 레미콘사: ${companies.join(', ')}`);
  if (curing.length) lines.push(`■ 양생: ${curing.join(', ')}`);
  const remarks = o.remarks ? rows.filter(r => r.remarks?.trim()).map(r => `${place(r)} ${r.remarks!.trim()}`.trim()) : [];
  if (remarks.length) lines.push(`■ 비고: ${remarks.join(' / ')}`);
  return lines.join('\n');
}
