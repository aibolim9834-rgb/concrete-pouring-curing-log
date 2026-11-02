// Server requests carry a deadline, so a stalled connection releases the screen's locks instead of leaving "저장 중" up.
export const REQUEST_TIMEOUT_MS = 20_000;
export const READ_TIMEOUT_MESSAGE = '서버 응답이 늦어 자료를 불러오지 못했습니다. 연결 상태를 확인한 뒤 새로고침해주세요.';
// A write cut off by the deadline may still have reached the server, so it is never resent automatically.
export const WRITE_TIMEOUT_MESSAGE = '서버 응답이 없어 저장 여부를 확인하지 못했습니다. 새로고침해 확인해주세요. 입력 내용은 유지됩니다.';

export class RequestTimeoutError extends Error {}

/** Runs one Supabase request with a deadline; a request cut off by it ends in RequestTimeoutError, never in a partial result. */
export async function timed<T extends { error: unknown }>(request: (signal: AbortSignal) => PromiseLike<T>, message: string, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController(), signal = controller.signal;
  // Settles even when the underlying call ignores the signal.
  const expired = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new RequestTimeoutError(message)), { once: true }));
  expired.catch(() => {});
  const timer = setTimeout(() => controller.abort(), ms);
  let result: T;
  try { result = await Promise.race([request(signal), expired]); }
  catch (error) { if (signal.aborted) throw new RequestTimeoutError(message); throw error; }
  finally { clearTimeout(timer); }
  // Supabase reports an aborted fetch as an error result rather than a rejection.
  if (result.error && signal.aborted) throw new RequestTimeoutError(message);
  return result;
}
