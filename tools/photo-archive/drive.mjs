// Finds the archive SSD by its volume serial number (what `vol D:` prints as 9897-A258), whatever drive letter
// Windows gave it today. On Windows, fs.statSync('X:\\').dev is that serial number.
// statRoot is injected so scripts/test-photo-archive.cjs can check this without real drives.
export function findVolume(serial, statRoot) {
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const drive = `${letter}:\\`;
    try { if (statRoot(drive).dev === serial) return drive; } catch { /* no drive with this letter */ }
  }
  return null;
}

// 2560074328 → "9897-A258", the form Windows shows.
export function serialLabel(serial) {
  const hex = (serial >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}
