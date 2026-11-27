import type { PouringLog } from './types';
import { normalizeStrength } from './strength';
import { normalizeWatering } from './watering';
import { shortDateDay } from './date-only';
import { excelDate } from './xlsx';
import type { XlsxColumn, XlsxOptions, XlsxValue } from './xlsx';

// "26.09.22(화) ~ 26.10.29(목)" for the earliest and latest valid dates, or '' when there are none.
export function datePeriod(dates: string[]) {
  const valid = dates.filter(d => excelDate(d) !== null).sort();
  return valid.length ? `${shortDateDay(valid[0])} ~ ${shortDateDay(valid[valid.length - 1])}` : '';
}

// Columns of the 타설일지 Excel export, in the order of the paper 일지.
// Same alignment as the screen and print tables: numbers right, 기상·레미콘사·살수 and short codes centered, 동(구역)·보양·비고 left.
export const LOG_COLUMNS: XlsxColumn[] = [
  { header: '구분', kind: 'number', align: 'center' }, { header: '일자', kind: 'date' }, { header: '동(구역)' }, { header: '층', align: 'center' }, { header: '벽/슬라브', align: 'center' },
  { header: '최저온도(°C)', kind: 'number', align: 'right' }, { header: '최고온도(°C)', kind: 'number', align: 'right' }, { header: '기상', align: 'center' }, { header: '레미콘사', align: 'center' },
  { header: '타설강도', align: 'right' }, { header: '타설물량(m³)', kind: 'number', align: 'right' }, { header: '양생-살수', align: 'center' }, { header: '양생-보양' }, { header: '비고' },
];

export const logRows = (logs: PouringLog[]): XlsxValue[][] => logs.map((log, index) => [
  index + 1, log.date, log.building, log.floor, log.member_type, log.min_temp, log.max_temp, log.weather, log.remicon_company,
  normalizeStrength(log.strength), log.volume, normalizeWatering(log.curing_watering), log.curing_protection, log.remarks,
]);

// Site name and period above the table, and the 타설물량 total below it.
export function logSheetOptions(siteName: string, logs: PouringLog[]): XlsxOptions {
  const range = datePeriod(logs.map(log => log.date));
  return { title: `${siteName} 콘크리트 타설·양생 일지`, subtitle: `${range ? `기간 ${range} · ` : ''}${logs.length}건`, total: { label: '합계', columns: [10] } };
}
