// Supabase failures keep the Korean guidance on screen, add the server's error code so it can be traced,
// and log the original response; a missing row (no error object) gets the guidance alone.
// The code and the server's own wording ride along as dbCode/dbDetail for the 작업 기록 (lib/event-log.ts).
export function dbError(message: string, error: unknown): Error {
  if (!error) return Object.assign(new Error(message), { dbCode: 'NO_ROW', dbDetail: '서버가 대상 행을 돌려주지 않음 (없거나 권한 밖)' });
  console.error(message, error);
  const field = (name: string) => typeof error === 'object' && error !== null && name in error && typeof (error as Record<string, unknown>)[name] === 'string' ? (error as Record<string, string>)[name] : '';
  const code = field('code');
  const detail = [field('message'), field('details'), field('hint')].filter(Boolean).join(' / ') || String(error);
  return Object.assign(new Error(code ? `${message} (오류 코드 ${code})` : message), { dbCode: code || 'DB', dbDetail: detail.slice(0, 1000) });
}
