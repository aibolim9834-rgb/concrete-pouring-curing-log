// 현장 자료 백업 — runs with the 알폼핀 원본 보관 on the office PC (every day 19:00 and at sign-in).
// Saves each site's server records to <보관 SSD>\이도형\con1 현장 자료 백업\<현장명>\<현장명>_<YYYY-MM-DD>_<HHmm>.json:
// the site row, its 타설일지, its 타설현황 (document and revision) and its photo rows (metadata, server paths, 원본 위치).
// A new file is written only when the site's records changed since its latest backup; nothing is ever deleted.
// Restoring from one of these files is done in the app (현장 관리), which only adds what the server is missing.
// Kept free of sharp and the network, so scripts/test-photo-archive.cjs can check it with plain data.
import crypto from 'node:crypto';
import path from 'node:path';
import { safeName } from './naming.mjs';

export const BACKUP_FORMAT = 'con1-site-backup';
export const BACKUP_FOLDER = 'con1 현장 자료 백업';

// Key order fixed at every level, so the same records always give the same text and the same hash.
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
  : value;
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const byId = (a, b) => String(a.id).localeCompare(String(b.id));

// tables: whole-table reads of sites, pouring_logs, pouring_progress and site_photos.
export function buildSiteBackups(tables, createdAt, project) {
  return tables.sites.map(site => {
    const records = stable({
      site,
      logs: tables.pouring_logs.filter(r => r.site_id === site.id).sort(byId),
      progress: tables.pouring_progress.find(r => r.site_id === site.id) ?? null,
      photos: tables.site_photos.filter(r => r.site_id === site.id).sort(byId),
    });
    const contentHash = sha(JSON.stringify(records));
    return {
      format: BACKUP_FORMAT, version: 1, createdAt, project, contentHash,
      counts: { logs: records.logs.length, progress: records.progress ? 1 : 0, photos: records.photos.length },
      ...records,
    };
  });
}

const pad = n => String(n).padStart(2, '0');
// Local time, so the file name matches the clock on the office PC.
export function backupFileName(siteName, at) {
  return `${safeName(siteName, '현장 이름 없음')}_${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}${pad(at.getMinutes())}.json`;
}

// fsx: node:fs (injected for tests). Returns what happened to each site.
export function writeSiteBackups(root, backups, at, fsx) {
  const results = [];
  for (const backup of backups) {
    const dir = path.join(root, safeName(backup.site.name, '현장 이름 없음'));
    // The newest file in the folder holds the last saved state; an unreadable one just means "save again".
    let latestHash = null;
    if (fsx.existsSync(dir)) {
      const latest = fsx.readdirSync(dir).filter(f => f.endsWith('.json')).sort().pop();
      if (latest) try { latestHash = JSON.parse(fsx.readFileSync(path.join(dir, latest), 'utf8')).contentHash ?? null; } catch { latestHash = null; }
    }
    if (latestHash === backup.contentHash) { results.push({ site: backup.site.name, saved: false }); continue; }
    fsx.mkdirSync(dir, { recursive: true });
    let file = path.join(dir, backupFileName(backup.site.name, at));
    for (let n = 2; fsx.existsSync(file); n++) file = path.join(dir, backupFileName(backup.site.name, at).replace(/\.json$/, ` (${n}).json`));
    const text = JSON.stringify(backup, null, 2);
    fsx.writeFileSync(`${file}.part`, text);
    fsx.renameSync(`${file}.part`, file);
    // Read back and check before counting it as saved.
    const back = JSON.parse(fsx.readFileSync(file, 'utf8'));
    const { format, version, createdAt, project, contentHash, counts, ...records } = back;
    if (contentHash !== backup.contentHash || sha(JSON.stringify(stable(records))) !== backup.contentHash) throw Error(`백업 파일을 다시 읽어 보니 내용이 다릅니다: ${file}`);
    results.push({ site: backup.site.name, saved: true, file, counts: backup.counts });
  }
  return results;
}

// Whole-table read with a count check, so a row added or removed mid-read does not give a half snapshot.
export async function readTables(sb) {
  const keys = { sites: 'id', pouring_logs: 'id', pouring_progress: 'site_id', site_photos: 'id' };
  const tables = {};
  for (const [name, key] of Object.entries(keys)) {
    const head = await sb.from(name).select('*', { count: 'exact', head: true });
    if (head.error) throw Error(`${name} 건수를 불러오지 못했습니다: ${head.error.message}`);
    const rows = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await sb.from(name).select('*').order(key).range(from, from + 499);
      if (error) throw Error(`${name}을(를) 불러오지 못했습니다: ${error.message}`);
      rows.push(...data);
      if (data.length < 500) break;
    }
    if (rows.length !== head.count) throw Error(`${name} 건수가 맞지 않습니다(서버 ${head.count}, 받은 ${rows.length}). 다음 실행 때 다시 백업합니다.`);
    tables[name] = rows;
  }
  return tables;
}
