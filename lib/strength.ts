// Only a standalone strength is unambiguous; leave mixed specifications intact.
export function normalizeStrength(value?: string | null): string {
  const original = value ?? '';
  const text = original.trim();
  if (!text) return '';
  const match = /^(\d+(?:\.\d+)?|\.\d+)\s*(?:MPa\s*)*$/i.exec(text);
  return match ? `${match[1]}MPa` : original;
}
