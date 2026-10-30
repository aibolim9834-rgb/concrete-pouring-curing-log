import { ProgressRecord, validDate, validateProgressRecord } from './pouring-progress';
import { updateProgressRecord } from './progress-entries';

export function inlineDateRecord(record: ProgressRecord | undefined, field: 'actual' | 'planned', value: string, color: string, comparisonStage: string): ProgressRecord {
  if (value && (!validDate(value) || value.startsWith('0000-'))) throw new Error('올바른 날짜를 입력해주세요.');
  if (field === 'actual' && !value && record?.entries?.length) throw new Error('구역 내역이 있는 타설일은 비울 수 없습니다.');
  const base: ProgressRecord = record || {date:'',status:'none',color};
  const next: ProgressRecord = field === 'planned'
    ? {...base,plannedDate:value}
    : value ? updateProgressRecord(base,value,base.color)
    : {...base,date:'',status:'none'};
  const result = {...next,comparisonStage:base.comparisonStage ?? comparisonStage};
  validateProgressRecord(result); return result;
}
