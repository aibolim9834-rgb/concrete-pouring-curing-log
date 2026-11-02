// Supabase failures keep the Korean guidance on screen, add the server's error code so it can be traced,
// and log the original response; a missing row (no error object) gets the guidance alone.
export function dbError(message: string, error: unknown): Error {
  if (!error) return new Error(message);
  console.error(message, error);
  const code = typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  return new Error(code ? `${message} (오류 코드 ${code})` : message);
}
