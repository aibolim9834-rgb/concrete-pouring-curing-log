import { supabase } from './supabase';
import { cloudStorageEnabled } from './cloud-storage';
import { RequestTimeoutError } from './request-timeout';

// 작업 기록 (public.client_events): each save, edit, delete or upload leaves one row on success and on failure, together with
// guards that stopped a save (warn) and unexpected script errors, so "어제 저장이 안 됐다" can be traced afterwards.
// Rows carry identifiers (log ID, 일자, 동·층) but never the values typed in. They wait in this browser while offline
// (up to 50) and are sent once the connection is back or the app is opened again. Nothing is kept or sent in QA/local mode.

type EventOutcome = 'ok' | 'warn' | 'error';
interface EventInput {
  page: string; action: string; outcome: EventOutcome;
  siteId?: string; target?: string; message?: string; code?: string; detail?: string; durationMs?: number;
}
interface EventRow {
  happened_at: string; device: string; site_id: string | null; page: string; action: string; outcome: EventOutcome;
  target: string | null; message: string | null; code: string | null; detail: string | null; duration_ms: number | null;
  online: boolean | null; app_version: string | null; client: string | null; trail: { a: string; t: string }[] | null;
}
type Queued = EventRow & { _k: string };
type Store = Pick<Storage, 'getItem' | 'setItem'>;

const QUEUE_KEY = 'cp_event_queue', DEVICE_KEY = 'cp_device_id';
const QUEUE_MAX = 50, SESSION_MAX = 300, PROBLEM_MAX = 20, REPEAT_MS = 60_000, TRAIL_MAX = 10;

const cut = (value: unknown, max: number) => value == null || value === '' ? null : String(value).slice(0, max);
const store = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

// A random number per browser, so one device's events can be read in order. Nothing in it identifies the person.
function deviceId(s = store()): string {
  let id = '';
  try { id = s?.getItem(DEVICE_KEY) || ''; } catch { /* storage blocked: a per-load number below */ }
  if (!/^[a-z0-9-]{8,40}$/.test(id)) {
    id = `d-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    try { s?.setItem(DEVICE_KEY, id); } catch { /* kept for this load only */ }
  }
  return id;
}

// The last ten things the user did (names and times only), attached to warnings and errors.
const trail: { a: string; t: string }[] = [];
const clock = (d = new Date()) => d.toTimeString().slice(0, 8);
export function noteAction(action: string) { trail.push({ a: action.slice(0, 40), t: clock() }); if (trail.length > TRAIL_MAX) trail.shift(); }

// Message, error code and original detail of a thrown value. dbError() adds dbCode/dbDetail; timeouts get TIMEOUT.
export function describeError(e: unknown): { message: string; code?: string; detail?: string; unexpected: boolean } {
  if (e instanceof RequestTimeoutError) return { message: e.message, code: 'TIMEOUT', unexpected: true };
  if (e instanceof Error) {
    const db = e as Error & { dbCode?: string; dbDetail?: string };
    if (db.dbCode !== undefined || db.dbDetail !== undefined) return { message: e.message, code: db.dbCode || 'DB', detail: db.dbDetail, unexpected: true };
    // The app's own guards ("현장을 선택해주세요", 입력 확인) are plain Errors; anything else is a real fault.
    const plain = e.name === 'Error';
    return { message: e.message, ...(plain ? {} : { code: e.name, detail: e.stack?.split('\n').slice(0, 4).join(' | ') }), unexpected: !plain };
  }
  return { message: typeof e === 'string' ? e : '알 수 없는 오류', code: 'UNKNOWN', detail: cut(safeJson(e), 300) ?? undefined, unexpected: true };
}
function safeJson(value: unknown) { try { return JSON.stringify(value); } catch { return String(value); } }

export function buildRow(input: EventInput, device: string, now = new Date()): EventRow {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const problem = input.outcome !== 'ok';
  return {
    happened_at: now.toISOString(), device, site_id: cut(input.siteId, 80), page: input.page.slice(0, 20) || '앱',
    action: input.action.slice(0, 60) || '작업', outcome: input.outcome, target: cut(input.target, 200),
    message: cut(input.message, 500), code: cut(input.code, 40), detail: cut(input.detail, 1000),
    duration_ms: input.durationMs == null ? null : Math.max(0, Math.min(600000, Math.round(input.durationMs))),
    online: nav ? nav.onLine : null, app_version: cut(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local', 40),
    client: cut(nav?.userAgent, 160), trail: problem && trail.length ? trail.slice(-TRAIL_MAX) : null,
  };
}

// Per-load limits: the same warning or error once a minute, at most 20 of them and 300 events in all.
const seen = new Map<string, number>();
let sent = 0, problems = 0;
export function admit(input: EventInput, now = Date.now()): boolean {
  if (sent >= SESSION_MAX) return false;
  if (input.outcome !== 'ok') {
    const key = `${input.outcome}|${input.action}|${input.message ?? ''}`;
    if (now - (seen.get(key) ?? -Infinity) < REPEAT_MS || problems >= PROBLEM_MAX) return false;
    seen.set(key, now); problems++;
  }
  sent++;
  return true;
}
export function resetLimits() { seen.clear(); sent = 0; problems = 0; trail.length = 0; }

export function readQueue(s = store()): Queued[] {
  try { const v = JSON.parse(s?.getItem(QUEUE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeQueue(rows: Queued[], s = store()) { try { s?.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-QUEUE_MAX))); } catch { /* full or blocked: events are best effort */ } }

let timer: ReturnType<typeof setTimeout> | null = null;
export function logEvent(input: EventInput) {
  try {
    if (!cloudStorageEnabled() || !admit(input)) return;
    const s = store();
    writeQueue([...readQueue(s), { ...buildRow(input, deviceId(s)), _k: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }], s);
    if (!timer) timer = setTimeout(() => { timer = null; void flushEvents(); }, 1500);
  } catch { /* logging never breaks the work it records */ }
}

// Sends what is waiting; rows stay queued when the send fails and go with the next try.
let flushing = false;
export async function flushEvents() {
  if (flushing || !cloudStorageEnabled()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const batch = readQueue();
  if (!batch.length) return;
  flushing = true;
  try {
    const { error } = await supabase.from('client_events').insert(batch.map(({ _k, ...row }) => row)).abortSignal(AbortSignal.timeout(10_000));
    if (!error) { const done = new Set(batch.map(r => r._k)); writeQueue(readQueue().filter(r => !done.has(r._k))); }
  } catch { /* offline or blocked: try again later */ }
  finally { flushing = false; }
}

// Runs fn and records its outcome. okTarget can name what was saved (e.g. the new log's ID) on success.
export async function tracked<T>(info: Omit<EventInput, 'outcome' | 'message' | 'code' | 'detail' | 'durationMs'>, run: () => Promise<T>, okTarget?: (value: T) => string | undefined): Promise<T> {
  noteAction(info.action);
  const start = Date.now();
  try {
    const value = await run();
    logEvent({ ...info, outcome: 'ok', target: okTarget?.(value) ?? info.target, durationMs: Date.now() - start });
    return value;
  } catch (e) {
    const d = describeError(e);
    logEvent({ ...info, outcome: d.unexpected ? 'error' : 'warn', message: d.message, code: d.code, detail: d.detail, durationMs: Date.now() - start });
    throw e;
  }
}

const pageName = (path = typeof location === 'undefined' ? '/' : location.pathname) => path.startsWith('/progress') ? '타설현황' : path.startsWith('/photos') ? '사진' : '일지';

// Once per app load: send what earlier visits left, send again when the connection returns, and record unexpected script errors.
let started = false;
export function startEventLog() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void flushEvents();
  window.addEventListener('online', () => void flushEvents());
  window.addEventListener('error', e => { const d = describeError(e.error ?? e.message); logEvent({ page: pageName(), action: '예상하지 못한 오류', outcome: 'error', message: d.message, code: d.code, detail: d.detail ?? `${e.filename}:${e.lineno}` }); });
  window.addEventListener('unhandledrejection', e => { const d = describeError(e.reason); logEvent({ page: pageName(), action: '처리되지 않은 오류', outcome: 'error', message: d.message, code: d.code, detail: d.detail }); });
}
