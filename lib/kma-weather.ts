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
}

const HOUR = 3600_000;
// Clock parts in KST whatever the server's time zone is.
function kst(ms: number) {
  const d = new Date(ms + 9 * HOUR);
  const p = (n: number) => String(n).padStart(2, '0');
  return { ymd: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`, hour: d.getUTCHours(), minute: d.getUTCMinutes(), p };
}
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

export interface KmaItem { category: string; obsrValue?: string; fcstValue?: string; fcstDate?: string; baseTime?: string }

// Error codes from the guide's 에러 코드 정리: 20·21·30·31 are key problems, 22 is the daily quota, 03 is NODATA.
function kmaError(code: string, message: string) {
  if (/^(20|21|30|31)$/.test(code) || /SERVICE_KEY|SERVICE_ACCESS_DENIED/.test(message)) return new Error('기상청 키가 아직 등록되지 않았거나 올바르지 않습니다.');
  if (code === '22' || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(message)) return new Error('기상청 하루 호출 한도를 넘었습니다.');
  return new Error(`기상청 응답 오류${message ? ` (${message})` : ''}.`);
}
// The service answers JSON when asked, but key and quota errors can still come back as XML.
export function readKmaBody(text: string): KmaItem[] {
  let body: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: KmaItem[] } } } };
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
// data.go.kr gives an already-encoded key and a decoded one; either may be pasted into the environment variable.
export const serviceKeyParam = (key: string) => /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
