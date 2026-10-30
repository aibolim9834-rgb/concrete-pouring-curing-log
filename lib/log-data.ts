import { PouringLog, PouringLogInput, Site } from './types';
import { validDate } from './pouring-progress';

export const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function newLog(siteId = '', category = '1'): PouringLogInput {
  return { site_id: siteId, category, date: localToday(), building: '', floor: '', member_type: '슬라브', min_temp: null, max_temp: null, weather: '', remicon_company: '', strength: '', volume: '', curing_watering: '', curing_protection: '', remarks: '' };
}
export function validateSites(value: unknown): asserts value is Site[] {
  if (!Array.isArray(value)) throw new Error('현장 목록 형식을 확인해주세요.');
  const ids = new Set<string>();
  for (const s of value) {
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || ['code', 'address', 'created_at'].some(k => s[k] != null && typeof s[k] !== 'string')) throw new Error('현장 정보가 올바르지 않습니다.');
    ids.add(s.id);
  }
}
export function validateLogs(value: unknown): asserts value is PouringLog[] {
  if (!Array.isArray(value)) throw new Error('일지 목록 형식을 확인해주세요.');
  const ids = new Set<string>();
  for (const log of value) {
    if (!log || typeof log.id !== 'string' || !log.id || ids.has(log.id) || typeof log.site_id !== 'string' || !log.site_id || !validDate(log.date)
      || ['category','building','floor','member_type','weather','remicon_company','curing_watering','curing_protection'].some(k => typeof log[k] !== 'string')
      || ['strength','remarks','created_at'].some(k => log[k] != null && typeof log[k] !== 'string')
      || ['min_temp','max_temp'].some(k => log[k] !== null && (typeof log[k] !== 'number' || !Number.isFinite(log[k])))
      || (log.volume != null && log.volume !== '' && !((typeof log.volume === 'number' || typeof log.volume === 'string') && Number.isFinite(Number(log.volume))))) throw new Error('일지 정보가 올바르지 않습니다. 원본을 확인해주세요.');
    ids.add(log.id);
  }
}
export function validateLogInput(input: PouringLogInput) {
  validateLogs([{ ...input, id: 'validation' }]);
  if (!input.site_id || !input.building.trim() || !input.floor.trim() || !input.member_type.trim()) throw new Error('현장·동(구역)·층·구조부위를 입력해주세요.');
  if (input.min_temp !== null && input.max_temp !== null && input.min_temp > input.max_temp) throw new Error('최저온도는 최고온도보다 높을 수 없습니다.');
  if (input.volume != null && input.volume !== '' && Number(input.volume) < 0) throw new Error('타설물량은 0 이상으로 입력해주세요.');
}
export function readLocalData(storage: Storage) {
  let sites, logs;
  try { sites = JSON.parse(storage.getItem('cp_sites') ?? '[]'); logs = JSON.parse(storage.getItem('cp_logs') ?? '[]'); }
  catch { throw new Error('저장 자료의 형식이 올바르지 않습니다. 원본 자료를 보관한 뒤 정상 백업으로 복원해주세요.'); }
  validateSites(sites); validateLogs(logs);
  return { sites, logs };
}
// Synchronous compare/write/verify, with rollback. No render-time auto-save.
export function writeLocalData(storage: Storage, before: { sites: Site[]; logs: PouringLog[] }, after: { sites: Site[]; logs: PouringLog[] }) {
  const current = readLocalData(storage);
  if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error('다른 화면에서 현장 또는 일지를 변경했습니다. 새로고침 후 다시 시도해주세요.');
  validateSites(after.sites); validateLogs(after.logs);
  writeStorage(storage, [['cp_sites', JSON.stringify(after.sites)], ['cp_logs', JSON.stringify(after.logs)]]);
}
export function writeStorage(storage: Storage, changes: [string, string | null][]) {
  const original = changes.map(([key]) => [key, storage.getItem(key)] as const);
  try {
    for (const [key, value] of changes) {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      if (storage.getItem(key) !== value) throw new Error('브라우저 저장에 실패했습니다.');
    }
  } catch (error) {
    let failed = false;
    for (const [key, value] of [...original].reverse()) {
      if (storage.getItem(key) === value) continue;
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); }
      catch { failed = true; }
    }
    if (failed) throw new Error('저장과 원복에 실패했습니다. 입력을 중지하고 원본 백업을 저장해주세요.');
    throw error;
  }
}
export interface LogFilters { search: string; weather: string; from: string; to: string; building: string; floor: string; member: string }
export const emptyLogFilters = (): LogFilters => ({ search: '', weather: 'ALL', from: '', to: '', building: '', floor: '', member: '' });
export type LogSortKey = 'date' | 'building' | 'floor' | 'member_type' | 'min_temp' | 'max_temp' | 'weather' | 'remicon_company' | 'strength' | 'volume' | 'curing_watering' | 'curing_protection';
export interface LogSort { key: LogSortKey; direction: 'asc' | 'desc' }
export const defaultLogSort: LogSort = { key: 'date', direction: 'desc' };
const logCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export function sortLogs(logs: PouringLog[], sort: LogSort): PouringLog[] {
  const numeric = sort.key === 'min_temp' || sort.key === 'max_temp' || sort.key === 'volume';
  return [...logs].sort((a, b) => {
    const left = a[sort.key], right = b[sort.key];
    const emptyLeft = left == null || String(left).trim() === '' || (numeric && !Number.isFinite(Number(left)));
    const emptyRight = right == null || String(right).trim() === '' || (numeric && !Number.isFinite(Number(right)));
    // Missing values stay last in either direction; zero remains a real number.
    if (emptyLeft || emptyRight) return Number(emptyLeft) - Number(emptyRight);
    const compared = numeric ? Number(left) - Number(right) : logCollator.compare(String(left), String(right));
    return sort.direction === 'asc' ? compared : -compared;
  });
}
export function filterLogs(logs: PouringLog[], f: LogFilters) {
  const q = f.search.trim().toLocaleLowerCase();
  return logs.filter(log => (!f.from || log.date >= f.from) && (!f.to || log.date <= f.to) && (!f.building || log.building === f.building) && (!f.floor || log.floor === f.floor) && (!f.member || log.member_type === f.member) && (f.weather === 'ALL' || log.weather === f.weather) && [log.date, log.building, log.floor, log.member_type, log.remicon_company, log.curing_watering, log.curing_protection, log.remarks || ''].some(v => v.toLocaleLowerCase().includes(q)));
}
