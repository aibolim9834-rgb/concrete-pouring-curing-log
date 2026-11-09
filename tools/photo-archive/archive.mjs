// 알폼핀 원본 보관 — runs on the office PC only (Windows Task Scheduler: every day 19:00 and at sign-in).
//  1. Finds photos whose original is still on the server (site_photos.archived_at is null, not marked deleted).
//  2. Finds the archive SSD by its volume serial (any drive letter) and saves each original to
//     <SSD>\<folder>\<현장명>\<YYYY-MM-DD>\<동 층>_<파일 이름>, then checks the saved file against the server hash.
//  3. Uploads a copy at most 2048px on the long side (JPEG 85) and asks the archive-site-photo Edge Function to point
//     the photo at that copy and remove the original. The function refuses anything that changed in between.
// Settings and the secret live in %LOCALAPPDATA%\con1-photo-archive\config.json (never in the repository);
// the log is archive.log in the same folder.
// Options: --dry-run lists what would be archived without changing anything; --limit N handles at most N photos.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { archiveParts, numbered } from './naming.mjs';
import { findVolume, serialLabel } from './drive.mjs';

const HOME = path.join(process.env.LOCALAPPDATA ?? '', 'con1-photo-archive');
const LOG = path.join(HOME, 'archive.log'), LOCK = path.join(HOME, 'archive.lock');
const args = process.argv.slice(2), dryRun = args.includes('--dry-run');
const limitAt = args.indexOf('--limit'), limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const mb = n => (n / 1048576).toFixed(2);

function log(line) {
  const entry = `${new Date().toLocaleString('sv-SE')} ${line}`;
  console.log(entry);
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2 * 1048576) fs.renameSync(LOG, `${LOG}.1`);
    fs.appendFileSync(LOG, entry + '\n');
  } catch { /* the console line is still there */ }
}

// The 19:00 run and a sign-in run can overlap; the second one skips. A lock older than 3 hours is a crashed run.
function takeLock() {
  try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); return true; }
  catch {
    if (Date.now() - fs.statSync(LOCK).mtimeMs > 3 * 3600_000) { fs.rmSync(LOCK, { force: true }); return takeLock(); }
    return false;
  }
}

async function main() {
  const c = JSON.parse(fs.readFileSync(path.join(HOME, 'config.json'), 'utf8'));
  // The SSD is found by its volume serial, so a changed drive letter does not matter; config.root is the older fixed path.
  if (c.volumeSerial) {
    const drive = findVolume(c.volumeSerial, p => fs.statSync(p));
    if (!drive) { log(`보관 SSD(볼륨 ${serialLabel(c.volumeSerial)})가 연결되어 있지 않습니다. 다음 실행 때 다시 시도합니다.`); return 0; }
    c.root = path.join(drive, c.folder);
    if (drive !== 'D:\\') log(`보관 SSD가 ${drive.slice(0, 2)} 드라이브로 연결되어 있어 그곳에 저장합니다.`);
  }
  // The folder itself is never created here, so a wrong drive cannot quietly receive the originals.
  if (!fs.existsSync(c.root) || !fs.statSync(c.root).isDirectory()) {
    log(`보관 폴더가 없습니다(${c.root}). 외장 SSD 연결을 확인하세요. 다음 실행 때 다시 시도합니다.`);
    return 0;
  }
  const sb = createClient(c.supabaseUrl, c.anonKey, { auth: { persistSession: false } });
  const bucket = sb.storage.from('site-photos');
  const callArchive = async body => {
    const res = await fetch(`${c.supabaseUrl}/functions/v1/archive-site-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}`, 'x-archive-secret': c.archiveSecret },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data; try { data = JSON.parse(raw); } catch { data = { error: raw }; }
    return { status: res.status, ...data };
  };

  if (!dryRun) {
    const retry = await callArchive({ action: 'retry_removals' });
    if (retry.status !== 200) throw Error(`보관 함수 호출 실패 ${retry.status}: ${retry.error}`);
    if (retry.pending) log(`지난번에 지우지 못한 서버 원본 ${retry.pending}개 중 ${retry.removed}개를 지웠습니다.`);
  }

  const { data: sites, error: siteError } = await sb.from('sites').select('id,name');
  if (siteError) throw Error('현장 목록을 불러오지 못했습니다: ' + siteError.message);
  const siteName = new Map(sites.map(s => [s.id, s.name]));
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb.from('site_photos').select('id,site_id,metadata,original_path,original_hash').is('archived_at', null).order('id').range(from, from + 499);
    if (error) throw Error('사진 목록을 불러오지 못했습니다: ' + error.message);
    rows.push(...data);
    if (data.length < 500) break;
  }
  // Photos marked deleted are left alone; the hourly purge removes them, and a restored one is picked up next time.
  const todo = rows.filter(r => typeof r.metadata?.deletedAt !== 'number').slice(0, limit);
  log(`${dryRun ? '[미리보기] ' : ''}보관할 원본 ${todo.length}장 (서버에 원본이 있는 사진 ${rows.length}장 중 삭제 표시 제외)`);

  let done = 0, failed = 0, saved = 0;
  for (const row of todo) {
    const parts = archiveParts(siteName.get(row.site_id) ?? row.site_id, row.metadata);
    const dir = path.join(c.root, ...parts.dir);
    if (dryRun) { log(`[미리보기] ${path.join(dir, parts.file)}`); continue; }
    try {
      const { data: blob, error } = await bucket.download(row.original_path);
      if (error || !blob) throw Error('원본을 내려받지 못했습니다 ' + (error?.message ?? ''));
      const original = Buffer.from(await blob.arrayBuffer());
      if (sha(original) !== row.original_hash) throw Error('서버 원본이 올릴 때 기록과 다릅니다');

      // A file already under that name is reused only when it is this very original (a run that stopped half way).
      fs.mkdirSync(dir, { recursive: true });
      let target;
      for (let n = 1; ; n++) {
        target = path.join(dir, n === 1 ? parts.file : numbered(parts.file, n));
        if (!fs.existsSync(target) || sha(fs.readFileSync(target)) === row.original_hash) break;
      }
      if (!fs.existsSync(target)) { fs.writeFileSync(`${target}.part`, original); fs.renameSync(`${target}.part`, target); }
      if (sha(fs.readFileSync(target)) !== row.original_hash) throw Error('보관 폴더에 저장한 파일이 원본과 다릅니다');

      const reduced = await sharp(original).autoOrient()
        .resize(c.maxLongSide, c.maxLongSide, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: c.jpegQuality }).toBuffer();
      const reducedHash = sha(reduced), reducedPath = `${row.site_id}/${row.id}/reduced-2048-${reducedHash}`;
      const upload = await bucket.upload(reducedPath, reduced, { contentType: 'image/jpeg', upsert: false });
      if (upload.error && String(upload.error.statusCode) !== '409') throw Error('2048px 사진을 올리지 못했습니다 ' + upload.error.message);

      const result = await callArchive({ action: 'archive', id: row.id, original_path: row.original_path, original_hash: row.original_hash, reduced_path: reducedPath, reduced_hash: reducedHash, archive_name: target });
      if (result.status !== 200) throw Error(`서버에서 바꾸지 못했습니다 ${result.status} ${result.error}`);
      done++; saved += original.length - reduced.length;
      log(`보관 ${target} (원본 ${mb(original.length)}MB → 서버 ${mb(reduced.length)}MB${result.removed ? '' : ' · 서버 원본은 다음 실행 때 지웁니다'})`);
    } catch (e) {
      failed++;
      log(`실패 ${path.join(dir, parts.file)} (${row.id}): ${e?.message ?? e}. 서버 원본은 그대로 두었습니다.`);
    }
  }
  if (!dryRun) log(`끝: 보관 ${done}장, 실패 ${failed}장, 서버 사용량 약 ${(saved / 1048576).toFixed(1)}MB 줄어듦`);
  return failed ? 1 : 0;
}

fs.mkdirSync(HOME, { recursive: true });
if (!takeLock()) { log('다른 보관 작업이 실행 중이라 이번 실행은 건너뜁니다.'); process.exit(0); }
try { process.exitCode = await main(); }
catch (e) { log('중단: ' + (e?.message ?? e)); process.exitCode = 2; }
finally { fs.rmSync(LOCK, { force: true }); }
