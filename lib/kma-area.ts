// Finds the 기상청 단기예보 grid (nx, ny) for a site address by matching its 시·도, 시·군·구 and 읍·면·동 words
// against the official region table (lib/kma-regions.json). No map or geocoding service is used.

// [행정구역코드, 1단계 시·도, 2단계 시·군·구, 3단계 읍·면·동, 격자 X, 격자 Y]; level 2/3 are '' on the higher-level rows.
export type KmaRegion = [string, string, string, string, number, number];

// What a site stores: the region picked for its weather and that region's grid.
export interface WeatherArea { code: string; label: string; nx: number; ny: number }

type AreaMatch =
  | { status: 'ok'; area: WeatherArea }
  // Found the 시·군·구 only; its own grid is used until a 읍·면·동 is picked from choices.
  | { status: 'sgg'; area: WeatherArea; choices: KmaRegion[] }
  // Several places fit and their grids differ, so one has to be picked before there is an area.
  | { status: 'pick'; place: string; choices: KmaRegion[] }
  | { status: 'none' };

// Short and former names people write for each 시·도. 광주·전남 are one 전남광주통합특별시 in the 2026-09-30 table.
const SIDO_ALIASES: Record<string, string[]> = {
  서울특별시: ['서울', '서울시'], 부산광역시: ['부산', '부산시'], 대구광역시: ['대구', '대구시'], 인천광역시: ['인천', '인천시'],
  대전광역시: ['대전', '대전시'], 울산광역시: ['울산', '울산시'], 세종특별자치시: ['세종', '세종시'], 경기도: ['경기'],
  강원특별자치도: ['강원', '강원도'], 충청북도: ['충북'], 충청남도: ['충남'], 전북특별자치도: ['전북', '전라북도'],
  전남광주통합특별시: ['광주', '광주광역시', '전남', '전라남도', '전남광주'], 경상북도: ['경북'], 경상남도: ['경남'],
  제주특별자치도: ['제주', '제주도'],
};

const regionLabel = (r: KmaRegion) => [r[1], r[2] === r[1] ? '' : r[2], r[3]].filter(Boolean).join(' ');
export const toArea = (r: KmaRegion, label = regionLabel(r)): WeatherArea => ({ code: r[0], label, nx: r[4], ny: r[5] });
// What the card shows: the last two parts, such as 서초구 반포동.
export const shortAreaLabel = (area: WeatherArea) => area.label.split(' ').slice(-2).join(' ');

// 행정동 and 법정동 names reduced to a shared stem: 반포1동·반포본동·반포동 → 반포, 수성2.3가동·수성동1가 → 수성, 가양제1동 → 가양.
// 읍·면 names are compared whole.
function dongStem(name: string) {
  if (/(읍|면)$/.test(name)) return name;
  let stem = name, prev = '';
  while (stem !== prev) { prev = stem; stem = stem.replace(/[\d.]+가$/, '').replace(/본?동$/, '').replace(/제?[\d.]+가?$/, ''); }
  return stem || name;
}

function tokensOf(address: string) {
  const inside = (address.match(/\([^)]*\)/g) ?? []).flatMap(m => m.slice(1, -1).split(','));
  return [...address.replace(/\([^)]*\)/g, ' ').split(/[\s,]+/), ...inside.map(t => t.trim())].filter(Boolean);
}

// The place a site saves: one picked by hand, else what the address finds on its own (null when it needs a pick).
export function resolveArea(address: string, picked: WeatherArea | null, rows: KmaRegion[]): WeatherArea | null {
  if (!address.trim()) return null;
  if (picked) return picked;
  const match = matchAddress(address, rows);
  return match.status === 'ok' || match.status === 'sgg' ? match.area : null;
}

export function matchAddress(address: string, rows: KmaRegion[]): AreaMatch {
  const tokens = tokensOf(address);
  if (!tokens.length) return { status: 'none' };
  const sidoNames = new Set(rows.map(r => r[1]));
  const sido = sidoNames.has(tokens[0]) ? tokens[0] : Object.keys(SIDO_ALIASES).find(name => SIDO_ALIASES[name].includes(tokens[0]));
  const rest = sido ? tokens.slice(1) : tokens;
  const inSido = sido ? rows.filter(r => r[1] === sido) : rows;

  // 시·군·구: "수원시 장안구" is one name (수원시장안구) in the table; 세종 has no separate 시·군·구 word.
  let sggs: string[] = [], used = 0;
  const sggNames = new Set(inSido.map(r => r[2]).filter(Boolean));
  for (let i = 0; i < rest.length && !sggs.length; i++) {
    const joined = rest[i] + (rest[i + 1] ?? '');
    if (sggNames.has(joined)) { sggs = [joined]; used = i + 2; }
    else if (sggNames.has(rest[i])) { sggs = [rest[i]]; used = i + 1; }
    else if (/시$/.test(rest[i])) { sggs = Array.from(sggNames).filter(n => n.startsWith(rest[i]) && n !== rest[i]); used = i + 1; }
  }
  if (!sggs.length && sido && sggNames.has(sido)) { sggs = [sido]; used = 0; }
  // Without a 시·도 word the 시·군·구 must be one place in the whole country (중구, 남구 exist in several cities).
  const sggRows = inSido.filter(r => sggs.includes(r[2]));
  if (!sggs.length || new Set(sggRows.map(r => r[1])).size !== 1) return { status: 'none' };
  const dongs = sggRows.filter(r => r[3]);

  for (const token of rest.slice(used)) {
    if (!/(동|읍|면|\d가)$/.test(token)) continue;
    const exact = dongs.filter(r => r[3] === token);
    const fits = exact.length ? exact : dongs.filter(r => dongStem(r[3]) === dongStem(token));
    if (!fits.length) continue;
    const head = fits[0];
    if (fits.every(r => r[4] === head[4] && r[5] === head[5])) {
      const label = fits.length === 1 ? regionLabel(head) : [head[1], head[2] === head[1] ? '' : head[2], token].filter(Boolean).join(' ');
      return { status: 'ok', area: toArea(head, label) };
    }
    return { status: 'pick', place: token, choices: fits };
  }
  const sggRow = sggs.length === 1 ? sggRows.find(r => !r[3]) : undefined;
  if (sggRow) return { status: 'sgg', area: toArea(sggRow), choices: dongs };
  return { status: 'pick', place: rest[used - 1] ?? sggs[0], choices: dongs };
}
