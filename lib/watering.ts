export const wateringOptions = ['1일 1회 살수', '1일 2회 살수', '1일 3회 살수', '1일 4회 살수'];

export function normalizeWatering(value: string): string {
  return value.includes('실시') ? value.replace(/실시/g, '').replace(/\s+/g, ' ').trim() : value;
}
