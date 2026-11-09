import type { PouringLog } from './types';
import { normalizeStrength } from './strength';
import { normalizeWatering } from './watering';
import type { XlsxColumn, XlsxValue } from './xlsx';

// Columns of the 타설일지 Excel export, in the order of the paper 일지.
export const LOG_COLUMNS: XlsxColumn[] = [
  { header: '구분', kind: 'number' }, { header: '일자', kind: 'date' }, { header: '동(구역)' }, { header: '층' }, { header: '벽/슬라브' },
  { header: '최저온도(°C)', kind: 'number' }, { header: '최고온도(°C)', kind: 'number' }, { header: '기상' }, { header: '레미콘사' },
  { header: '타설강도' }, { header: '타설물량(m³)', kind: 'number' }, { header: '양생-살수' }, { header: '양생-보양' }, { header: '비고' },
];

export const logRows = (logs: PouringLog[]): XlsxValue[][] => logs.map((log, index) => [
  index + 1, log.date, log.building, log.floor, log.member_type, log.min_temp, log.max_temp, log.weather, log.remicon_company,
  normalizeStrength(log.strength), log.volume, normalizeWatering(log.curing_watering), log.curing_protection, log.remarks,
]);
