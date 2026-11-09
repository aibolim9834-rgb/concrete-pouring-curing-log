// Where an original goes on the archive drive: <root>\<현장명>\<YYYY-MM-DD>\<동 층>_<올린 파일 이름>.
// Kept free of other imports so scripts/test-photo-archive.cjs can check it without sharp or the network.

// Characters Windows refuses in a file or folder name, and its reserved device names.
const BAD = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function safeName(value, fallback) {
  const s = String(value ?? '').replace(BAD, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return (s && !RESERVED.test(s) ? s : fallback).slice(0, 120);
}

// photo: the row's metadata (date, building, floor, name, id).
export function archiveParts(siteName, photo) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(photo?.date ?? '') ? photo.date : '날짜 없음';
  const place = [photo?.building, photo?.floor].map(v => String(v ?? '').trim()).filter(Boolean).join(' ');
  let name = String(photo?.name ?? '').trim() || `${photo?.id ?? 'photo'}.jpg`;
  if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) name += '.jpg';
  return { dir: [safeName(siteName, '현장 이름 없음'), date], file: safeName(place ? `${place}_${name}` : name, `${photo?.id ?? 'photo'}.jpg`) };
}

// "a.jpg", 2 → "a (2).jpg": a different photo that would land on a name already taken.
export function numbered(file, n) {
  const dot = file.lastIndexOf('.');
  return dot > 0 ? `${file.slice(0, dot)} (${n})${file.slice(dot)}` : `${file} (${n})`;
}
