// Run: node scripts/test-write-guard.cjs. Reads the app's source only; no network.
// Every write to the server (insert/update/upsert/delete/rpc/storage upload) must pass a refusal through dbError()
// within a few lines, so the 작업 기록 keeps the server's code, wording and the shape of what was sent.
// A write that handles its failure another way is listed in ALLOWED with the reason.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const WINDOW = 6; // lines after the write call in which dbError( must appear
const WRITE = /\.(insert|update|upsert|delete|rpc|upload)\(/;
const SERVER = /supabase\b|bucket\(\)/;
const ALLOWED = [
  { file: 'components/ConcreteApp.tsx', match: 'supabase.from(table).insert(', why: 'insertOnce: shared insert; each caller passes its result to dbError' },
  { file: 'lib/event-log.ts', match: "from('client_events').insert(", why: 'the 작업 기록 itself; a failed send keeps the rows queued for the next try' },
  { file: 'lib/site-photos-cloud.ts', match: "rpc('photo_storage_usage')", why: 'read-only storage total, not a save' },
];

function findUnguarded(file, text) {
  const lines = text.split(/\r?\n/), found = [];
  lines.forEach((line, i) => {
    if (!WRITE.test(line) || !SERVER.test(line) || /^\s*\/\//.test(line)) return;
    if (ALLOWED.some(a => a.file === file && line.includes(a.match))) return;
    if (lines.slice(i, i + WINDOW + 1).some(l => l.includes('dbError('))) return;
    found.push(`${file}:${i + 1}  ${line.trim().slice(0, 140)}`);
  });
  return found;
}
function sources(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

let count = 0;
const check = (name, run) => { run(); console.log('PASS ' + name); count++; };

check('the guard flags a server write without dbError and accepts one with it', () => {
  const bad = "const { error } = await supabase.from('pouring_logs').insert(row);\nif (error) throw new Error('저장 실패');";
  const good = "const { error } = await supabase.from('pouring_logs').insert(row);\nif (error) throw dbError('저장 실패', error, row);";
  assert.equal(findUnguarded('components/New.tsx', bad).length, 1);
  assert.equal(findUnguarded('components/New.tsx', good).length, 0);
  assert.equal(findUnguarded('components/New.tsx', "cache.delete(key);").length, 0); // not a server call
});

check('every server write in the app passes a refusal through dbError (or is listed with its reason)', () => {
  const files = ['components', 'lib', 'app'].flatMap(sources);
  const unguarded = files.flatMap(f => findUnguarded(f, fs.readFileSync(path.join(root, f), 'utf8')));
  assert.deepEqual(unguarded, [], `서버 저장 코드가 실패를 dbError()로 넘기지 않습니다. 실패 원인이 작업 기록에 남도록 dbError(안내, error, 보낸 값)로 던지거나, 다른 방식으로 처리한다면 scripts/test-write-guard.cjs의 ALLOWED에 이유와 함께 적어주세요.\n${unguarded.join('\n')}`);
  for (const a of ALLOWED) assert(fs.readFileSync(path.join(root, a.file), 'utf8').includes(a.match), `ALLOWED 항목이 더 이상 코드에 없습니다: ${a.file} ${a.match}`);
});

console.log(`${count} write guard checks passed; source files only.`);
