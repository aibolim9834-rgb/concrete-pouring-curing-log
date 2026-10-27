import { validateLogs, validateSites, writeStorage } from './log-data';
import { validateProgress } from './pouring-progress';
import { validateArchive } from './site-archive';

export interface AppBackup { format: 'con1-backup'; version: 1; createdAt: string; entries: [string, string][] }
const isDataKey = (key: string) => ['cp_sites','cp_logs','cp_selected_site'].includes(key) || key.startsWith('cp_pouring_progress_v1:') || key.startsWith('cp_site_archive_v1:');
export function validateBackup(value: unknown): asserts value is AppBackup {
  const b = value as AppBackup;
  if (!b || b.format !== 'con1-backup' || b.version !== 1 || !Array.isArray(b.entries) || typeof b.createdAt !== 'string') throw new Error('지원하지 않는 전체 백업 파일입니다.');
  const keys = new Set<string>();
  for (const entry of b.entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || !isDataKey(entry[0]) || keys.has(entry[0])) throw new Error('백업 항목을 확인해주세요.');
    const [key, raw] = entry; keys.add(key);
    if (key === 'cp_sites') validateSites(JSON.parse(raw));
    else if (key === 'cp_logs') validateLogs(JSON.parse(raw));
    else if (key.startsWith('cp_pouring_progress_v1:')) {
      const progress = JSON.parse(raw); validateProgress(progress.document);
      if (!Number.isInteger(progress.revision) || progress.revision < 1) throw new Error('현황 저장 형식을 확인해주세요.');
    } else if (key.startsWith('cp_site_archive_v1:')) validateArchive(JSON.parse(raw));
  }
  if (!keys.has('cp_sites') || !keys.has('cp_logs')) throw new Error('현장과 일지 목록이 없는 백업입니다.');
}
export function collectBackup(storage: Storage, verify = true): AppBackup {
  const entries: [string,string][] = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key && isDataKey(key)) entries.push([key, storage.getItem(key)!]); }
  for (const key of ['cp_sites','cp_logs']) if (!entries.some(([k]) => k === key)) entries.push([key, '[]']);
  const backup: AppBackup = { format: 'con1-backup', version: 1, createdAt: new Date().toISOString(), entries: entries.sort(([a],[b]) => a.localeCompare(b)) };
  if (verify) validateBackup(backup); return backup;
}
export function parseBackup(text: string): AppBackup {
  if (new TextEncoder().encode(text).length > 50 * 1024 * 1024) throw new Error('50MB 이하의 파일을 선택해주세요.');
  let parsed;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('백업 JSON 형식이 올바르지 않습니다. 원본 파일의 내용을 확인해주세요.'); }
  // Support the existing single-site archive files as well as full backups.
  if (parsed?.version === 1 && parsed.site && parsed.logs && 'progressRaw' in parsed) {
    validateArchive(parsed);
    if (parsed.mode !== 'local') throw new Error('DB 현장 보관본은 별도 DB 복원이 필요합니다.');
    const entries: [string,string][] = [['cp_sites', JSON.stringify([parsed.site])], ['cp_logs', JSON.stringify(parsed.logs)], ['cp_selected_site', parsed.site.id]];
    if (parsed.progressRaw !== null) entries.push([`cp_pouring_progress_v1:${parsed.site.id}`, parsed.progressRaw]);
    const converted: AppBackup = { format: 'con1-backup', version: 1, createdAt: parsed.archivedAt, entries };
    validateBackup(converted); return converted;
  }
  validateBackup(parsed); return parsed;
}
export function backupCounts(backup: AppBackup) {
  const map = new Map(backup.entries);
  return { sites: JSON.parse(map.get('cp_sites')!).length, logs: JSON.parse(map.get('cp_logs')!).length, progress: backup.entries.filter(([key]) => key.startsWith('cp_pouring_progress_v1:')).length, archives: backup.entries.filter(([key]) => key.startsWith('cp_site_archive_v1:')).length };
}
export function restoreBackup(storage: Storage, backup: AppBackup, expected: AppBackup) {
  validateBackup(backup);
  const current = collectBackup(storage, false);
  if (JSON.stringify(current.entries) !== JSON.stringify(expected.entries)) throw new Error('미리보기 이후 다른 화면에서 자료가 바뀌었습니다. 파일을 다시 선택해주세요.');
  const recovery = JSON.stringify(current);
  storage.setItem('cp_restore_recovery_v1', recovery);
  if (storage.getItem('cp_restore_recovery_v1') !== recovery) throw new Error('복원 전 백업을 보관하지 못했습니다. 복원을 중지했습니다.');
  const next = new Map(backup.entries);
  const keys = new Set([...current.entries.map(([key]) => key), ...Array.from(next.keys())]);
  writeStorage(storage, Array.from(keys).map(key => [key, next.get(key) ?? null]));
}
