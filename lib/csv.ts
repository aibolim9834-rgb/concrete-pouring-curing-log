// CSV is for viewing in spreadsheets. Keep formula-like text from becoming a formula.
// Stored data and JSON backups remain byte-for-byte unchanged.
export function csvCell(value: string | number) {
  const text = String(value);
  const safe = typeof value === 'string' && /^(?:\s*[=+\-@＝＋－＠]|[\t\r\n])/.test(text) ? '\t' + text : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
