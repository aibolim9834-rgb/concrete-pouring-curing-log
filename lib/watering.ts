export const wateringOptions = ['1일 1회 살수', '1일 2회 살수', '1일 3회 살수', '1일 4회 살수'];

// 살수 is saved without "실시", and a bare "없음" is written the way most logs say it: 1일 0회 살수.
export function normalizeWatering(value: string): string {
  const text = value.includes('실시') ? value.replace(/실시/g, '').replace(/\s+/g, ' ').trim() : value;
  return text.trim() === '없음' ? '1일 0회 살수' : text;
}

// 보양 is free text; only the spellings that meant the same thing are brought to the one most logs use.
export function normalizeProtection(value: string): string {
  const text = value.replace(/비닐\s*보양/g, '비닐 보양').replace(/천막\s*보양/g, '천막 보양').replace(/기계\s+미장/g, '기계미장');
  return text.trim() === '없음' ? '보양 없음' : text;
}
