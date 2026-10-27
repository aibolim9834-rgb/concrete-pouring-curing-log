import { Site, PouringLog } from './types';
import { validateProgress } from './pouring-progress';
import { validateSites, validateLogs } from './log-data';

const prefix = 'cp_site_archive_v1:';
const progressKey = (id: string) => `cp_pouring_progress_v1:${id}`;
export interface SiteArchive {
  version: 1; key: string; archivedAt: string; mode: 'local' | 'cloud';
  site: Site; logs: PouringLog[]; progressRaw: string | null;
}
export function assertNewSiteName(sites: Site[], name: string) {
  const normalized = name.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
  if (!normalized) throw new Error('현장명을 입력해주세요.');
  if (sites.some(site => site.name.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase() === normalized)) {
    throw new Error('같은 이름의 현장이 있습니다. 현장 목록에서 선택하거나 다른 이름을 입력해주세요.');
  }
}
export function validateArchive(archive: SiteArchive) {
  if (archive?.version !== 1 || !archive.site?.id || !archive.site.name || !Array.isArray(archive.logs)
    || typeof archive.archivedAt !== 'string' || !Number.isFinite(Date.parse(archive.archivedAt))
    || archive.logs.some(log => log.site_id !== archive.site.id)
    || (archive.mode !== 'local' && archive.mode !== 'cloud')) throw new Error('현장 보관 파일을 확인해주세요.');
  validateSites([archive.site]); validateLogs(archive.logs);
  if (archive.progressRaw !== null) {
    const progress = JSON.parse(archive.progressRaw);
    validateProgress(progress.document);
    if (!Number.isInteger(progress.revision) || progress.revision < 1) throw new Error('현황 저장 형식을 확인해주세요.');
  }
}
export function listSiteArchives(storage: Storage): SiteArchive[] {
  const archives: SiteArchive[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const archive = JSON.parse(storage.getItem(key)!);
    validateArchive(archive);
    archives.push({ ...archive, key });
  }
  return archives.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}
// Write and verify the entire recovery copy before changing any active data.
export function archiveSite(storage: Storage, site: Site, logs: PouringLog[], mode: 'local' | 'cloud'): SiteArchive {
  const key = `${prefix}${site.id}:${crypto.randomUUID()}`;
  const archive: SiteArchive = { version: 1, key, archivedAt: new Date().toISOString(), mode, site,
    logs: logs.filter(log => log.site_id === site.id), progressRaw: storage.getItem(progressKey(site.id)) };
  validateArchive(archive);
  const raw = JSON.stringify(archive);
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error('복구용 보관본을 저장하지 못했습니다. 삭제를 중지했습니다.');
  validateArchive(JSON.parse(storage.getItem(key)!));
  return archive;
}
function applyStorage(storage: Storage, changes: [string, string | null][]) {
  const before = changes.map(([key]) => [key, storage.getItem(key)] as const);
  try {
    for (const [key, value] of changes) {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      if (storage.getItem(key) !== value) throw new Error('브라우저 저장에 실패했습니다.');
    }
  } catch (error) {
    let restored = true;
    for (const [key, value] of [...before].reverse()) {
      if (storage.getItem(key) === value) continue;
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); }
      catch { restored = false; }
    }
    if (!restored) throw new Error('저장 공간 문제로 복원하지 못했습니다. 복구용 보관본을 유지하고 있으니 새로고침 전에 백업을 저장해주세요.');
    throw error;
  }
}
function checkLocalState(storage: Storage, sites: Site[], logs: PouringLog[]) {
  if (JSON.stringify(JSON.parse(storage.getItem('cp_sites') || '[]')) !== JSON.stringify(sites)
    || JSON.stringify(JSON.parse(storage.getItem('cp_logs') || '[]')) !== JSON.stringify(logs)) {
    throw new Error('다른 화면에서 현장 또는 일지를 변경했습니다. 새로고침 후 다시 시도해주세요.');
  }
}
export function removeLocalSite(storage: Storage, sites: Site[], logs: PouringLog[], archive: SiteArchive) {
  checkLocalState(storage, sites, logs);
  if (storage.getItem(archive.key) !== JSON.stringify(archive)
    || storage.getItem(progressKey(archive.site.id)) !== archive.progressRaw) throw new Error('보관 이후 데이터가 바뀌었습니다. 삭제를 중지했습니다.');
  const nextSites = sites.filter(site => site.id !== archive.site.id);
  const nextLogs = logs.filter(log => log.site_id !== archive.site.id);
  applyStorage(storage, [['cp_sites', JSON.stringify(nextSites)], ['cp_logs', JSON.stringify(nextLogs)], [progressKey(archive.site.id), null]]);
  return { sites: nextSites, logs: nextLogs };
}
export function restoreLocalSite(storage: Storage, sites: Site[], logs: PouringLog[], archive: SiteArchive) {
  validateArchive(archive);
  if (archive.mode !== 'local') throw new Error('DB 현장의 복원은 DB 연결 작업 시 진행해주세요. 보관본은 내려받을 수 있습니다.');
  checkLocalState(storage, sites, logs);
  if (sites.some(site => site.id === archive.site.id) || storage.getItem(progressKey(archive.site.id)) !== null
    || logs.some(log => log.site_id === archive.site.id || archive.logs.some(saved => saved.id === log.id))) {
    throw new Error('같은 현장 ID 또는 연결된 기록이 남아 있어 덮어쓰지 않았습니다.');
  }
  const nextSites = [...sites, archive.site], nextLogs = [...logs, ...archive.logs];
  applyStorage(storage, [['cp_sites', JSON.stringify(nextSites)], ['cp_logs', JSON.stringify(nextLogs)], [progressKey(archive.site.id), archive.progressRaw]]);
  // The recovery copy remains available even after restoration.
  return { sites: nextSites, logs: nextLogs };
}
