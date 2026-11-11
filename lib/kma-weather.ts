// 기상청 단기예보 조회서비스 (data.go.kr 15084084) helpers for the 오늘 날씨 card, kept free of fetch so they can be tested.
// Times follow the 2026-10-19 활용가이드: 초단기실황 base_time is each hour (HH00) and is served from HH:10;
// 단기예보 is issued 02·05·08·11·14·17·20·23시 and served 10 minutes later. Today's 최저(TMN) is only in the 02시 issue
// and the previous day's 23시 issue, so the card always reads one of those two.

export interface TodayWeather {
  date: string;              // YYYY-MM-DD (KST)
  temp: number | null;       // 현재 기온 (초단기실황 T1H)
  observedAt: string;        // HH:MM of that 실황
  min: number | null;        // 오늘 최저 (단기예보 TMN)
  max: number | null;        // 오늘 최고 (단기예보 TMX)
  // From the latest 단기예보 issue: the highest 강수확률 (POP, %) and the hours with 강수형태 (PTY) for the rest of today and for tomorrow.
  pop: number | null;
  rain: RainSpell | null;
  popTomorrow: number | null;
  rainTomorrow: RainSpell | null;
}
// e.g. { hours: '14~17시', kind: '비', amount: '약 6mm' }; amount is '' when the issue carries no 강수량 (PCP).
interface RainSpell { hours: string; kind: string; amount: string }

const HOUR = 3600_000;
// Clock parts in KST whatever the server's time zone is.
function kst(ms: number) {
  const d = new Date(ms + 9 * HOUR);
  const p = (n: number) => String(n).padStart(2, '0');
  return { ymd: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`, hour: d.getUTCHours(), minute: d.getUTCMinutes(), p };
}
export const kstHour = (ms: number) => kst(ms).hour;
export const kstDate = (ms: number) => { const { ymd } = kst(ms); return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`; };

// 실황 for the last full hour that is already served; 5 minutes of margin past the guide's HH:10.
export function nowcastBase(ms: number, hoursBack = 0) {
  const ready = kst(ms).minute < 15 ? 1 : 0, { ymd, hour, p } = kst(ms - (ready + hoursBack) * HOUR);
  return { base_date: ymd, base_time: `${p(hour)}00` };
}
// 02시 issue of today once it is served (02:15 with margin), otherwise yesterday's 23시 issue.
export function forecastBase(ms: number) {
  const now = kst(ms);
  if (now.hour > 2 || now.hour === 2 && now.minute >= 15) return { base_date: now.ymd, base_time: '0200' };
  return { base_date: kst(ms - 24 * HOUR).ymd, base_time: '2300' };
}

// The newest 단기예보 issue already served (HH:10 per the guide, 5 minutes of margin); before 02:15 it is yesterday's 23시 issue.
export function latestForecastBase(ms: number) {
  const now = kst(ms), served = [23, 20, 17, 14, 11, 8, 5, 2].find(h => now.hour > h || now.hour === h && now.minute >= 15);
  if (served === undefined) return { base_date: kst(ms - 24 * HOUR).ymd, base_time: '2300' };
  return { base_date: now.ymd, base_time: `${now.p(served)}00` };
}

export interface KmaItem { category: string; obsrValue?: string; fcstValue?: string; fcstDate?: string; fcstTime?: string; baseTime?: string }

// Error codes from the guide's 에러 코드 정리: 20·21·30·31 are key problems, 22 is the daily quota, 03 is NODATA.
function kmaError(code: string, message: string) {
  if (/^(20|21|30|31)$/.test(code) || /SERVICE_KEY|SERVICE_ACCESS_DENIED/.test(message)) return new Error('기상청 키가 아직 등록되지 않았거나 올바르지 않습니다.');
  if (code === '22' || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(message)) return new Error('기상청 하루 호출 한도를 넘었습니다.');
  return new Error(`기상청 응답 오류${message ? ` (${message})` : ''}.`);
}
// The service answers JSON when asked, but key and quota errors can still come back as XML.
// Shared by the 단기예보 and 기상특보 services, which use the same envelope; T is the item shape of the operation.
export function readKmaBody<T = KmaItem>(text: string): T[] {
  let body: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: T[] } } } };
  try { body = JSON.parse(text); }
  catch {
    const tag = (name: string) => new RegExp(`<${name}>([^<]*)<`).exec(text)?.[1] ?? '';
    throw kmaError(tag('returnReasonCode') || tag('resultCode'), tag('returnAuthMsg') || tag('resultMsg'));
  }
  const header = body.response?.header;
  if (header?.resultCode === '03') return []; // NODATA: the issue is not served yet
  if (header?.resultCode !== '00') throw kmaError(header?.resultCode ?? '', header?.resultMsg ?? '');
  return body.response?.body?.items?.item ?? [];
}

const num = (v?: string) => v == null || v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v);
export const nowcastTemp = (items: KmaItem[]) => num(items.find(i => i.category === 'T1H')?.obsrValue);
// TMN/TMX of the given day (YYYYMMDD) from a 단기예보 issue.
export function todayRange(items: KmaItem[], ymd: string) {
  const value = (category: string) => num(items.find(i => i.category === category && i.fcstDate === ymd)?.fcstValue);
  return { min: value('TMN'), max: value('TMX') };
}

// PTY 1 비 · 2 비/눈 · 3 눈 · 4 소나기 (0 is none).
function spellKind(codes: Set<string>) {
  const snow = codes.has('3'), rain = codes.has('1') || codes.has('4');
  return codes.has('2') || snow && rain ? '비·눈' : snow ? '눈' : '비';
}
// Wet hours as runs: [14,15,16,17] → 14~17시; more than two runs end with 외.
function spellHours(hours: number[]) {
  const runs: [number, number][] = [];
  for (const h of hours) { const last = runs[runs.length - 1]; if (last && h === last[1] + 1) last[1] = h; else runs.push([h, h]); }
  const p = (n: number) => String(n).padStart(2, '0');
  const text = runs.slice(0, 2).map(([a, b]) => a === b ? `${p(a)}시` : `${p(a)}~${p(b)}시`).join(', ');
  return runs.length > 2 ? `${text} 외` : text;
}
// Hourly 강수량 strings as sent: 강수없음 · 0 · "1mm 미만" · "2.0mm"; the guide's range forms "30.0~50.0mm" and
// "50.0mm 이상" count their lower bound and mark the total as "이상".
export function rainAmount(values: string[]) {
  let total = 0, trace = false, atLeast = false, known = false;
  for (const raw of values) {
    const v = raw.trim();
    if (v === '강수없음' || v === '0') { known = true; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(\d+(?:\.\d+)?)\s*mm\s*미만$/.exec(v))) { known = true; trace = true; }
    else if ((m = /^(\d+(?:\.\d+)?)\s*~\s*\d+(?:\.\d+)?\s*mm$/.exec(v)) || (m = /^(\d+(?:\.\d+)?)\s*mm\s*이상$/.exec(v))) { known = true; atLeast = true; total += Number(m[1]); }
    else if ((m = /^(\d+(?:\.\d+)?)\s*(?:mm)?$/.exec(v))) { known = true; total += Number(m[1]); }
  }
  if (!known || total === 0 && !trace) return '';
  if (total === 0) return '1mm 미만';
  return `약 ${Math.round(total)}mm${atLeast ? ' 이상' : ''}`;
}

// Highest 강수확률 and the hours with 강수 for one day (YYYYMMDD), counting only hours from fromHour on.
export function rainOutlook(items: KmaItem[], ymd: string, fromHour = 0): { pop: number | null; rain: RainSpell | null } {
  const hourly = (category: string) => items.filter(i => i.category === category && i.fcstDate === ymd && Number((i.fcstTime ?? '').slice(0, 2)) >= fromHour);
  const pops = hourly('POP').map(i => num(i.fcstValue)).filter((n): n is number => n !== null);
  const wet = hourly('PTY').filter(i => i.fcstValue && i.fcstValue.trim() !== '0');
  const hours = Array.from(new Set(wet.map(i => Number(i.fcstTime!.slice(0, 2))))).sort((a, b) => a - b);
  return {
    pop: pops.length ? Math.max(...pops) : null,
    rain: hours.length ? { hours: spellHours(hours), kind: spellKind(new Set(wet.map(i => i.fcstValue!.trim()))), amount: rainAmount(hourly('PCP').map(i => i.fcstValue ?? '')) } : null,
  };
}
// data.go.kr gives an already-encoded key and a decoded one; either may be pasted into the environment variable.
export const serviceKeyParam = (key: string) => /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
