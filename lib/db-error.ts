// Supabase failures keep the Korean guidance on screen, add the server's error code so it can be traced,
// and log the original response; a missing row (no error object) gets the guidance alone.
// The code and the server's own wording ride along as dbCode/dbDetail for the 작업 기록 (lib/event-log.ts).
// `sent` is what the app tried to save: only the kind of each field goes into the record, never the value typed in,
// so a refused save shows which field had the wrong shape (e.g. volume=빈 글자 for a numeric column).
// This runs only after a save has already failed, so it cannot affect a save that succeeds.
export function dbError(message: string, error: unknown, sent?: Record<string, unknown>): Error {
  const shape = sent ? ` || 보낸 값: ${sentShape(sent)}` : '';
  if (!error) return Object.assign(new Error(message), { dbCode: 'NO_ROW', dbDetail: `서버가 대상 행을 돌려주지 않음 (없거나 권한 밖)${shape}`.slice(0, 1000) });
  console.error(message, error);
  const field = (name: string) => typeof error === 'object' && error !== null && name in error && typeof (error as Record<string, unknown>)[name] === 'string' ? (error as Record<string, string>)[name] : '';
  const code = field('code');
  const detail = [field('message'), field('details'), field('hint')].filter(Boolean).join(' / ') || String(error);
  return Object.assign(new Error(code ? `${message} (오류 코드 ${code})` : message), { dbCode: code || 'DB', dbDetail: `${detail}${shape}`.slice(0, 1000) });
}

const kind = (v: unknown): string =>
  v === undefined ? '없음' : v === null ? 'null' : v === '' ? '빈 글자'
  : typeof v === 'string' ? (v.trim() ? `글자 ${v.length}자` : `공백 ${v.length}자`)
  : typeof v === 'number' ? (Number.isFinite(v) ? '숫자' : '숫자 아님')
  : typeof v === 'boolean' ? '참/거짓'
  : Array.isArray(v) ? `목록 ${v.length}개`
  : typeof v === 'object' ? '묶음' : typeof v;
export const sentShape = (sent: Record<string, unknown>) => Object.entries(sent).map(([key, value]) => `${key}=${kind(value)}`).join(', ');
