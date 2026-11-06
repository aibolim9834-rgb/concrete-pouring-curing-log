// Log floors are stored the way the progress sheet names them: 지하 2층 → B2F, 21층 → 21F.
// Anything else (PH2, 옥상, notes in brackets) is kept as typed.
export function normalizeFloor(value?: string | null): string {
  return (value ?? '')
    .replace(/지하\s*(\d+)\s*(?:층|[fF])?/g, 'B$1F')
    .replace(/(\d+)\s*층/g, '$1F')
    // "1F층" carries both marks; keep the F.
    .replace(/(\d+F)\s*층/g, '$1');
}

// 알폼핀 사진 floors follow the same rule, and a bare floor (35, 3f, b2) is a floor there too: the photo page always showed "35" as 35층.
export function normalizePhotoFloor(value?: string | null): string {
  const floor = normalizeFloor((value ?? '').trim());
  const bare = /^([bB]?)(\d+)[fF]?$/.exec(floor);
  return bare ? `${bare[1].toUpperCase()}${bare[2]}F` : floor;
}

// 알폼핀 사진 buildings: a bare number is a 동 (101 → 101동), as the photo page has always shown it; anything else is kept, upper-cased.
export function normalizePhotoBuilding(value?: string | null): string {
  const building = (value ?? '').trim().toUpperCase();
  return /^\d+$/.test(building) ? `${building}동` : building;
}
