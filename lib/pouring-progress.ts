export interface ProgressStage { id: string; name: string; order: number }
export interface ProgressEntry { id: string; member: string; zone: string; volume: number | null; remarks: string }
export interface ProgressRecord { date: string; status: 'none' | 'partial' | 'done'; color: string; colorCleared?: boolean; plannedDate?: string; comparisonStage?: string; entries?: ProgressEntry[]; dates?: string[] }
export interface ProgressBuilding { id: string; name: string; stages: ProgressStage[]; records: Record<string, ProgressRecord> }
export interface ProgressDocument { version: 1; buildings: ProgressBuilding[] }
export const emptyProgress = (): ProgressDocument => ({ version: 1, buildings: [] });
export const buildingLabel = (name: string) => /^\d+$/.test(name.trim()) ? `${name.trim()}동` : name;
export const progressId = () => globalThis.crypto?.randomUUID?.() || `progress-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function presetStages(floors: number, basements: number): ProgressStage[] {
  return [{ id: 'blinding', name: '버림', order: -102 }, { id: 'foundation', name: '기초', order: -101 },
    ...Array.from({ length: basements }, (_, i) => ({ id: `b${i + 1}`, name: `B${i + 1}F`, order: -(i + 1) })),
    ...Array.from({ length: floors }, (_, i) => ({ id: `f${i + 1}`, name: `${i + 1}F`, order: i + 1 })),
    { id: 'roof', name: '옥상', order: 1001 }, { id: 'penthouse', name: '옥탑', order: 1002 }];
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateProgressEntry(entry: ProgressEntry) {
  if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(entry.id)
    || ['__proto__', 'prototype', 'constructor'].includes(entry.id)
    || typeof entry.member !== 'string' || !entry.member.trim() || entry.member.length > 80
    || typeof entry.zone !== 'string' || !entry.zone.trim() || entry.zone.length > 80
    || !(entry.volume === null || (typeof entry.volume === 'number' && Number.isFinite(entry.volume) && entry.volume >= 0))
    || typeof entry.remarks !== 'string' || entry.remarks.length > 1000) throw new Error('부위·구역·물량·비고를 확인해주세요.');
  if ('date' in entry) throw new Error('구역별 날짜 대신 층·단계의 공통 타설일을 사용해주세요.');
}
export function validateProgressRecord(record: ProgressRecord) {
  if (!record || !(record.status === 'none' ? record.date === '' : ['partial', 'done'].includes(record.status) && validDate(record.date))
    || !/^#[\da-f]{6}$/i.test(record.color)) throw new Error('타설 날짜 또는 색상이 올바르지 않습니다.');
  if (record.colorCleared !== undefined && typeof record.colorCleared !== 'boolean') throw new Error('배경색 설정이 올바르지 않습니다.');
  if (record.plannedDate !== undefined && (typeof record.plannedDate !== 'string' || (record.plannedDate !== '' && (!validDate(record.plannedDate) || record.plannedDate.startsWith('0000-'))))) throw new Error('예정 타설일이 올바르지 않습니다.');
  if (record.comparisonStage !== undefined && (typeof record.comparisonStage !== 'string' || record.comparisonStage.length > 101)) throw new Error('작업일 비교 단계를 확인해주세요.');
  // Multi-day pours keep every pour date; `date` stays the last one so completion and variance use it.
  if (record.dates !== undefined && (!Array.isArray(record.dates) || record.dates.length < 2 || record.dates.length > 100
    || record.dates.some((d, i) => typeof d !== 'string' || !validDate(d) || (i > 0 && d <= record.dates![i - 1]))
    || record.dates[record.dates.length - 1] !== record.date)) throw new Error('여러 타설일은 날짜순으로, 마지막 날짜가 대표 타설일과 같아야 합니다.');
  if (record.entries !== undefined) {
    if (!Array.isArray(record.entries) || record.entries.length > 200) throw new Error('한 층·단계의 구역 내역은 200건까지 기록할 수 있습니다.');
    const ids = new Set<string>();
    for (const entry of record.entries) {
      validateProgressEntry(entry);
      if (ids.has(entry.id)) throw new Error('중복된 구역 기록 ID가 있습니다.');
      ids.add(entry.id);
    }
    if (record.entries.length && !validDate(record.date)) throw new Error('구역별 내역에는 공통 타설일이 필요합니다.');
  }
}
export function validateProgress(value: unknown): asserts value is ProgressDocument {
  const d = value as ProgressDocument;
  const safeId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(id) && !['__proto__', 'prototype', 'constructor'].includes(id);
  if (!d || d.version !== 1 || !Array.isArray(d.buildings) || d.buildings.length > 100) throw new Error('지원하지 않는 타설현황 파일입니다.');
  const ids = new Set<string>(), names = new Set<string>();
  for (const b of d.buildings) {
    if (!b || !safeId(b.id) || ids.has(b.id) || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80 || names.has(b.name.trim()) || !Array.isArray(b.stages) || b.stages.length > 500 || !b.records || typeof b.records !== 'object' || Array.isArray(b.records)) throw new Error('동 정보가 올바르지 않습니다.');
    ids.add(b.id); names.add(b.name.trim());
    const stages = new Set<string>(), stageNames = new Set<string>();
    for (const s of b.stages) {
      if (!s || !safeId(s.id) || stages.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80 || stageNames.has(s.name.trim()) || !Number.isFinite(s.order)) throw new Error('층·단계 정보가 올바르지 않습니다.');
      stages.add(s.id); stageNames.add(s.name.trim());
    }
    for (const [id, r] of Object.entries(b.records)) {
      if (!stages.has(id)) throw new Error('층·단계가 없는 타설 기록입니다.');
      validateProgressRecord(r);
      if (r.comparisonStage && (!stages.has(r.comparisonStage) || r.comparisonStage === id)) throw new Error('작업일 비교 단계가 없거나 자기 자신을 가리킵니다.');
    }
  }
}
export function progressRows(buildings: ProgressBuilding[]) {
  const rows = new Map<string, ProgressStage>();
  for (const b of buildings) for (const s of b.stages) if (!rows.has(s.id)) rows.set(s.id, s);
  return Array.from(rows.values()).sort((a, b) => b.order - a.order || a.id.localeCompare(b.id));
}
export function completedStages(b: ProgressBuilding, basis: string) {
  // Actual dates define completion, including legacy records saved as "partial".
  return b.stages.filter(s => { const date = b.records[s.id]?.date || ''; return validDate(date) && date <= basis; }).sort((a, c) => c.order - a.order);
}
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
