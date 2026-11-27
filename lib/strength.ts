// The unit is always written MPa (30MPA, 30Mpa, 30 mpa → 30MPa), and a standalone number gains it.
// Other mixed specifications (40-210, 27, 30MPa, 27MPa(기둥 40MPa 12M3)) keep their own wording.
export function normalizeStrength(value?: string | null): string {
  const original = value ?? '';
  const text = original.trim();
  if (!text) return '';
  const match = /^(\d+(?:\.\d+)?|\.\d+)\s*(?:MPa\s*)*$/i.exec(text);
  if (match) return `${match[1]}MPa`;
  return /mpa/i.test(original) ? original.replace(/(\d)\s*mpa/gi, '$1MPa').replace(/mpa/gi, 'MPa') : original;
}
