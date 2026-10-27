import { ProgressDocument, validateProgress } from './pouring-progress';

export function parseProgressBackup(text: string): { siteName: string; document: ProgressDocument } {
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) throw new Error('5MB 이하의 백업 파일을 선택해주세요.');
  const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  validateProgress(parsed.document);
  return { siteName: typeof parsed.siteName === 'string' ? parsed.siteName : '현장', document: parsed.document };
}

export function serializeProgressBackup(siteName: string, document: ProgressDocument) {
  validateProgress(document);
  const text = JSON.stringify({ siteName, document }, null, 2);
  parseProgressBackup(text);
  return text;
}
