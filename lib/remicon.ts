// One ready-mix truck carries 6 m³; a part load still counts as a truck, so 7 m³ is 2대.
const REMICON_TRUCK_M3 = 6;
export const remiconTrucks = (volume: number) => volume > 0 ? Math.ceil(volume / REMICON_TRUCK_M3) : 0;

// 레미콘사 is stored as the company name alone: 영빈레미콘 → 영빈, 국민 레미콘, 삼표레미콘 → 국민, 삼표.
// The word is dropped only after a name, so a cell that says just "레미콘" is kept as typed.
export function normalizeRemicon(value?: string | null): string {
  return (value ?? '').replace(/(\S)\s*레미콘(?=\s*(?:[,，]|$))/g, '$1');
}
