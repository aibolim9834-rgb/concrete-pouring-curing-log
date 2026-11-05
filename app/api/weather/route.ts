import { forecastBase, kstDate, nowcastBase, nowcastTemp, readKmaBody, serviceKeyParam, todayRange, TodayWeather } from '@/lib/kma-weather';

// 오늘 날씨 for one 단기예보 grid. The 기상청 key stays on the server (KMA_SERVICE_KEY in Vercel).
// Each 기상청 request is kept 30 minutes in the Next.js data cache, so every viewer of a site shares one call per half hour.
const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const CACHE_SECONDS = 1800;

async function kma(operation: string, key: string, params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries({ pageNo: 1, dataType: 'JSON', ...params }).map(([k, v]) => [k, String(v)]));
  const response = await fetch(`${BASE}/${operation}?serviceKey=${serviceKeyParam(key)}&${query}`, { next: { revalidate: CACHE_SECONDS }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`기상청 서버가 응답하지 않습니다 (${response.status}).`);
  return readKmaBody(await response.text());
}

const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, nx = Number(params.get('nx')), ny = Number(params.get('ny'));
  // The 단기예보 grid runs 1–149 east and 1–253 north.
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || nx > 149 || ny < 1 || ny > 253) return reply({ error: '기상 위치가 올바르지 않습니다.' }, 400);
  const key = process.env.KMA_SERVICE_KEY?.trim();
  if (!key) return reply({ error: '기상청 연결 키가 아직 설정되지 않았습니다.' }, 503);

  const now = Date.now(), grid = { nx, ny };
  try {
    const [nowcast, forecast] = await Promise.allSettled([
      (async () => {
        // The latest hour can still be empty right after it is served; the hour before is used then.
        for (const back of [0, 1]) {
          const base = nowcastBase(now, back), temp = nowcastTemp(await kma('getUltraSrtNcst', key, { numOfRows: 10, ...base, ...grid }));
          if (temp !== null) return { temp, observedAt: `${base.base_time.slice(0, 2)}:00` };
        }
        return { temp: null, observedAt: '' };
      })(),
      (async () => {
        const base = forecastBase(now);
        return todayRange(await kma('getVilageFcst', key, { numOfRows: 400, ...base, ...grid }), kstDate(now).replaceAll('-', ''));
      })(),
    ]);
    if (nowcast.status === 'rejected' && forecast.status === 'rejected') throw nowcast.reason;
    const weather: TodayWeather = {
      date: kstDate(now),
      ...(nowcast.status === 'fulfilled' ? nowcast.value : { temp: null, observedAt: '' }),
      ...(forecast.status === 'fulfilled' ? forecast.value : { min: null, max: null }),
    };
    return reply(weather);
  } catch (e) {
    return reply({ error: e instanceof Error && e.name !== 'TimeoutError' ? e.message : '기상청에서 값을 받아오지 못했습니다.' }, 502);
  }
}
