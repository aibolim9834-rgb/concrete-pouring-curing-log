import type { KmaRegion } from './kma-area';

// 기상특보 for one site, read from the 기상청 기상특보 조회서비스 (data.go.kr 15000415) 특보현황 (getPwnStatus).
// That reply is one nationwide text: t6 lists the 특보 in force ("o 강풍주의보 : 전라남도(흑산도.홍도), 제주도") and
// t7 the 예비특보 by time. Areas are 특보구역 names from the guide's 특보구역코드 table (lib/kma-warning-zones.json).
// Kept free of fetch so it can be tested.

// [구역코드, 특보문 구역명 (REG_KO), 정식 이름 (REG_NAME), 상위 구역코드 or '']
export type WarningZone = [string, string, string, string];

export type WarningLevel = '주의보' | '경보' | '중대경보';
export interface SiteWarning { kind: string; level: WarningLevel; zones: string[] }   // e.g. 한파 경보 [서울서남권]
export interface SitePreview { kind: string; when: string; zones: string[] }           // e.g. 강풍 예비특보, 11/6 새벽(00시~06시)
export interface SiteWarnings { issuedAt: string; warnings: SiteWarning[]; previews: SitePreview[] } // issuedAt: HH:MM (KST), or MM.DD HH:MM when not today

const NATION = 'L1000000';
// The 특보구역 of each 시·도 in the region table. 전남광주통합특별시 keeps two: 광주광역시 for its five 구, 전라남도 for the rest.
const SIDO_ZONE: Record<string, string> = {
  서울특별시: 'L1100000', 부산광역시: 'L1150000', 대구광역시: 'L1140000', 인천광역시: 'L1110000', 대전광역시: 'L1120000',
  울산광역시: 'L1160000', 세종특별자치시: 'L1170000', 경기도: 'L1010000', 강원특별자치도: 'L1020000', 충청남도: 'L1030000',
  충청북도: 'L1040000', 전북특별자치도: 'L1060000', 경상북도: 'L1070000', 경상남도: 'L1080000', 제주특별자치도: 'L1090000',
};
const GWANGJU_GU = new Set(['동구', '서구', '남구', '북구', '광산구']);

function tree(zones: WarningZone[]) {
  const byCode = new Map(zones.map(z => [z[0], z]));
  const children = new Map<string, string[]>();
  for (const z of zones) if (z[3]) children.set(z[3], [...(children.get(z[3]) ?? []), z[0]]);
  const below = (code: string): string[] => (children.get(code) ?? []).flatMap(c => [c, ...below(c)]);
  const above = (code: string): string[] => { const up = byCode.get(code)?.[3]; return up && up !== code ? [up, ...above(up)] : []; };
  return { byCode, below, above };
}

// The 특보구역 a site's 기상 위치 falls in: its 시·군 zone when the table has one (용인 → 용인, with 용인동북부·서북부·남부 below it),
// otherwise its 시·도 zone (서울 동작구 → 서울, with the four 서울 권역 below it). Returns that zone, everything below it and
// everything above it, since a 특보 on any of them concerns the site. The table does not say which 구·동 lies in which 권역,
// so a 특보 on one 권역 of the site's city is shown with the 권역 name for the reader to judge.
export function siteZones(region: KmaRegion, zones: WarningZone[]): Set<string> {
  const { byCode, below, above } = tree(zones), [, sido, sgg] = region;
  const top = sido === '전남광주통합특별시' ? (GWANGJU_GU.has(sgg) ? 'L1130000' : 'L1050000') : SIDO_ZONE[sido];
  if (!top || !byCode.has(top)) return new Set();
  const city = sgg.match(/^(.+?시).+구$/)?.[1] ?? sgg, stem = city.replace(/(특별자치시|시|군|구)$/, '');
  const candidates = below(top).map(code => byCode.get(code)!)
    .filter(z => z[1] === stem || z[2] === city || z[1].startsWith(`${stem}(`) || z[2].startsWith(`${city}(`));
  // Several hits (a 시 and a 권역 of it) → the one nearest the 시·도.
  const own = stem && candidates.sort((a, b) => above(a[0]).length - above(b[0]).length)[0]?.[0] || top;
  return new Set([own, ...below(own), ...above(own)]);
}

// Splits "a, b(c, d), e" at the commas outside parentheses.
function splitTop(list: string): string[] {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
  }
  parts.push(list.slice(start));
  return parts.map(p => p.trim()).filter(Boolean);
}

// The zone codes an area list names: "전라남도(신안(흑산면제외), 진도), 제주도" → 신안(흑산면제외), 진도 under 전라남도, and 제주도.
// A bare name at the top is looked up among the 시·도 level first (광주 is 광주광역시 there, not 경기 광주시).
function namedZones(list: string, zones: WarningZone[]): string[] {
  const { below } = tree(zones);
  const find = (name: string, scope: string[] | null) => {
    const pool = scope ? scope.flatMap(below) : null;
    const hits = zones.filter(z => (z[1] === name || z[2] === name) && (!pool || pool.includes(z[0])));
    if (scope) return hits.map(z => z[0]);
    const top = hits.filter(z => z[3] === NATION);
    return (top.length ? top : hits).map(z => z[0]);
  };
  const walk = (item: string, scope: string[] | null): string[] => {
    // 흑산도.홍도 is written under 전라남도 but sits outside it in the table, so a name not found in its scope is looked up anywhere.
    const whole = find(item, scope);
    if (whole.length) return whole;
    if (scope && !item.includes('(')) return find(item, null);
    const m = item.match(/^([^(]+)\((.*)\)$/);
    if (!m) return [];
    const parent = find(m[1].trim(), scope);
    return parent.length ? splitTop(m[2]).flatMap(child => walk(child, parent)) : [];
  };
  return splitTop(list).flatMap(item => walk(item, null));
}

// Lines of a t6/t7 text; a line that does not start a new item continues the one before.
function lines(text: string) {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (out.length && !/^(o\s|\(\d+\))/.test(line)) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out;
}

const label = (codes: string[], zones: WarningZone[]) => {
  const byCode = new Map(zones.map(z => [z[0], z[1]]));
  return Array.from(new Set(codes.map(c => byCode.get(c)!).filter(Boolean)));
};

// Kinds left off the site screen (2026-11-05 사용자 결정): they do not change the day's 타설 or 양생.
// 풍랑 is only issued for sea zones anyway.
export const HIDDEN_KINDS: ReadonlySet<string> = new Set(['건조', '황사', '폭풍해일', '풍랑']);

export function warningsFor(t6: string, site: Set<string>, zones: WarningZone[]): SiteWarning[] {
  const out: SiteWarning[] = [];
  for (const line of lines(t6)) {
    const m = line.match(/^o\s*(.+?)(중대경보|경보|주의보)\s+:\s+(.+)$/);
    if (!m || HIDDEN_KINDS.has(m[1].trim())) continue;
    const hit = namedZones(m[3], zones).filter(code => site.has(code));
    if (hit.length) out.push({ kind: m[1].trim(), level: m[2] as WarningLevel, zones: label(hit, zones) });
  }
  // 경보 before 주의보.
  return out.sort((a, b) => Number(b.level !== '주의보') - Number(a.level !== '주의보'));
}

// "11월 06일 새벽(00시~06시)" → "11/6 새벽(00시~06시)"
const shortWhen = (when: string) => when.replace(/(\d+)월\s*0?(\d+)일/, '$1/$2').trim();

export function previewsFor(t7: string, site: Set<string>, zones: WarningZone[]): SitePreview[] {
  const out: SitePreview[] = [];
  let kind = '';
  for (const line of lines(t7)) {
    const head = line.match(/^\(\d+\)\s*(.+?)\s*예비특보/);
    if (head) { kind = head[1]; continue; }
    const m = line.match(/^o\s*(.+?)\s+:\s+(.+)$/);
    if (!m || !kind || HIDDEN_KINDS.has(kind)) continue;
    const hit = namedZones(m[2], zones).filter(code => site.has(code));
    if (hit.length) out.push({ kind, when: shortWhen(m[1]), zones: label(hit, zones) });
  }
  return out;
}

// tmFc 202611050700 → "07:00" when that is today in KST, "11.05 07:00" on any other day, so an older 발표 is not read as today's.
export const issuedClock = (tmFc: string | number, now = Date.now()) => {
  const s = String(tmFc);
  if (!/^\d{12}$/.test(s)) return '';
  const today = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  return `${s.slice(0, 8) === today ? '' : `${s.slice(4, 6)}.${s.slice(6, 8)} `}${s.slice(8, 10)}:${s.slice(10, 12)}`;
};
