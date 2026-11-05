import { readKmaBody, serviceKeyParam } from '@/lib/kma-weather';
import { issuedClock, previewsFor, siteZones, warningsFor, type SiteWarnings, type WarningZone } from '@/lib/kma-warning';
import type { KmaRegion } from '@/lib/kma-area';
import regions from '@/lib/kma-regions.json';
import warningZones from '@/lib/kma-warning-zones.json';

// 기상특보 for one site's 기상 위치 (its 행정구역코드). The nationwide 특보현황 is one 기상청 call kept 10 minutes in the
// Next.js data cache, so every site and viewer shares it; only the matching to the site happens per request.
const URL_STATUS = 'https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus';
const CACHE_SECONDS = 600;
const rows = regions.rows as KmaRegion[], zones = warningZones.rows as WarningZone[];

const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code') ?? '';
  const region = /^\d{10}$/.test(code) ? rows.find(r => r[0] === code) : undefined;
  if (!region) return reply({ error: '기상 위치가 올바르지 않습니다.' }, 400);
  const key = process.env.KMA_SERVICE_KEY?.trim();
  if (!key) return reply({ error: '기상청 연결 키가 아직 설정되지 않았습니다.' }, 503);

  try {
    const response = await fetch(`${URL_STATUS}?serviceKey=${serviceKeyParam(key)}&pageNo=1&numOfRows=1&dataType=JSON`, { next: { revalidate: CACHE_SECONDS }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`기상청 서버가 응답하지 않습니다 (${response.status}).`);
    const [status] = readKmaBody<{ t6?: string; t7?: string; tmFc?: string | number }>(await response.text());
    const site = siteZones(region, zones);
    const body: SiteWarnings = {
      issuedAt: status?.tmFc ? issuedClock(status.tmFc) : '',
      warnings: status?.t6 ? warningsFor(status.t6, site, zones) : [],
      previews: status?.t7 ? previewsFor(status.t7, site, zones) : [],
    };
    return reply(body);
  } catch (e) {
    return reply({ error: e instanceof Error && e.name !== 'TimeoutError' ? e.message : '기상특보를 받아오지 못했습니다.' }, 502);
  }
}
