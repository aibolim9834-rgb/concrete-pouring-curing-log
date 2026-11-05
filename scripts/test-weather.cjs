// 현장 주소 → 기상 위치 matching, 기상청 base times and replies, and the /api/weather route with a mocked fetch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, extras = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) { if (id in extras) return extras[id]; throw new Error(`Unexpected dependency ${id}`); }, Error, ...globals });
  return module.exports;
}
const area = load('lib/kma-area.ts'), weather = load('lib/kma-weather.ts'), data = (() => {
  const strip = { './pouring-progress': { validDate: v => /^\d{4}-\d{2}-\d{2}$/.test(v) }, './remicon': { remiconTrucks: () => 0 }, './daily-report': { validateReportOptions() {} } };
  return load('lib/log-data.ts', strip);
})();
const rows = JSON.parse(fs.readFileSync(path.join(root, 'lib/kma-regions.json'), 'utf8')).rows;
let count = 0;
// Values from the vm context have their own Object prototype, so compare them as JSON.
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }
const KST = (iso) => Date.parse(`${iso}+09:00`);

(async () => {
  await check('the region table is the official grid list with 시·도, 시·군·구 and 읍·면·동 rows', () => {
    assert(rows.length > 3800);
    for (const r of rows) assert(r.length === 6 && /^\d{10}$/.test(r[0]) && Number.isInteger(r[4]) && Number.isInteger(r[5]));
    assert(rows.some(r => r[1] === '서울특별시' && r[2] === '서초구' && r[3] === '반포1동'));
  });

  await check('a 지번 address with a 법정동 finds the 행정동 grid it shares', () => {
    const m = area.matchAddress('서울특별시 서초구 반포동 1-1', rows);
    assert.equal(m.status, 'ok'); assert.equal(m.area.label, '서울특별시 서초구 반포동'); same([m.area.nx, m.area.ny], [60, 125]);
    assert.equal(area.shortAreaLabel(m.area), '서초구 반포동');
  });

  await check('a road address uses the 동 written in parentheses, and short 시·도 names work', () => {
    const m = area.matchAddress('서울 서초구 신반포로 270 (반포동, 반포자이)', rows);
    assert.equal(m.status, 'ok'); same([m.area.nx, m.area.ny], [60, 125]);
  });

  await check('a road address without a 동 falls back to the 시·군·구 grid and offers its 동 list', () => {
    const m = area.matchAddress('대구광역시 수성구 달구벌대로 2450', rows);
    assert.equal(m.status, 'sgg'); assert.equal(m.area.label, '대구광역시 수성구'); same([m.area.nx, m.area.ny], [89, 90]);
    assert(m.choices.length > 10 && m.choices.every(r => r[2] === '수성구' && r[3]));
  });

  await check('a 법정동 split into 행정동 with different grids asks for one of them', () => {
    const m = area.matchAddress('대구 수성구 범어동 123', rows);
    assert.equal(m.status, 'pick'); assert.equal(m.place, '범어동');
    same(m.choices.map(r => r[3]), ['범어1동', '범어2동', '범어3동', '범어4동']);
  });

  await check('a city split into 구 without a 구 or 동 asks for a place across its 구', () => {
    const m = area.matchAddress('경기도 화성시 동탄대로 100', rows);
    assert.equal(m.status, 'pick');
    assert(new Set(m.choices.map(r => r[2])).size >= 2 && m.choices.every(r => r[2].startsWith('화성시') && r[3]));
  });

  await check('"수원시 장안구" is read as the table\'s one name and 101동 is not taken for a 동', () => {
    const m = area.matchAddress('경기도 수원시 장안구 정자로 1 101동', rows);
    assert.equal(m.status, 'sgg'); assert.equal(m.area.label, '경기도 수원시장안구');
  });

  await check('광주광역시 and 전라남도 addresses resolve in the merged 전남광주통합특별시', () => {
    for (const address of ['광주광역시 북구 용봉로 77', '전라남도 순천시 중앙로 1']) {
      const m = area.matchAddress(address, rows);
      assert.notEqual(m.status, 'none'); assert(m.area.label.startsWith('전남광주통합특별시'));
    }
  });

  await check('세종 has no 시·군·구 word and still finds its 읍', () => {
    const m = area.matchAddress('세종특별자치시 조치원읍 OO리 1', rows);
    assert.equal(m.status, 'ok'); same([m.area.nx, m.area.ny], [66, 106]); assert.equal(m.area.label, '세종특별자치시 조치원읍');
  });

  await check('without a 시·도 a 구 name found in several cities is not guessed', () => {
    assert.equal(area.matchAddress('중구 세종대로 110', rows).status, 'none');
    assert.equal(area.matchAddress('아무 데나', rows).status, 'none');
    assert.equal(area.matchAddress('   ', rows).status, 'none');
    assert.equal(area.matchAddress('성남시 분당구 정자동', rows).status !== 'none', true);
  });

  await check('the saved place is the hand pick, else what the address finds, else none', () => {
    const picked = { code: 'x', label: '직접 고른 곳', nx: 1, ny: 2 };
    assert.equal(area.resolveArea('', picked, rows), null);
    assert.equal(area.resolveArea('대구 수성구 범어동', picked, rows), picked);
    assert.equal(area.resolveArea('대구 수성구 범어동', null, rows), null);
    same(area.resolveArea('대구 수성구 달구벌대로', null, rows), { code: '2726000000', label: '대구광역시 수성구', nx: 89, ny: 90 });
  });

  await check('sites accept a well-formed 기상 위치 and reject a broken one', () => {
    const site = { id: 's', name: '현장', address: '대구 수성구', weather_area: { code: '2726000000', label: '대구광역시 수성구', nx: 89, ny: 90 } };
    data.validateSites([site]); data.validateSites([{ ...site, weather_area: null }]); data.validateSites([{ id: 's', name: '현장' }]);
    for (const bad of [{ ...site.weather_area, nx: 0 }, { ...site.weather_area, ny: 1.5 }, { ...site.weather_area, label: ' ' }, 'x'])
      assert.throws(() => data.validateSites([{ ...site, weather_area: bad }]), /기상 위치/);
  });

  await check('실황 uses the last served hour with margin and crosses midnight', () => {
    same(weather.nowcastBase(KST('2026-11-05T14:12:00')), { base_date: '20261105', base_time: '1300' });
    same(weather.nowcastBase(KST('2026-11-05T14:15:00')), { base_date: '20261105', base_time: '1400' });
    same(weather.nowcastBase(KST('2026-11-05T14:20:00'), 1), { base_date: '20261105', base_time: '1300' });
    same(weather.nowcastBase(KST('2026-11-01T00:05:00')), { base_date: '20261031', base_time: '2300' });
  });

  await check('today\'s 최저·최고 come from the 02시 issue, or the previous 23시 issue before it is served', () => {
    same(weather.forecastBase(KST('2026-11-05T02:14:00')), { base_date: '20261104', base_time: '2300' });
    same(weather.forecastBase(KST('2026-11-05T02:15:00')), { base_date: '20261105', base_time: '0200' });
    same(weather.forecastBase(KST('2026-11-05T23:59:00')), { base_date: '20261105', base_time: '0200' });
    same(weather.forecastBase(KST('2026-11-01T00:30:00')), { base_date: '20261031', base_time: '2300' });
    assert.equal(weather.kstDate(Date.parse('2026-11-04T15:30:00Z')), '2026-11-05');
  });

  await check('replies: values are read, NODATA is empty, key and quota errors say what is wrong', () => {
    const json = (code, items) => JSON.stringify({ response: { header: { resultCode: code, resultMsg: 'MSG' }, body: { items: { item: items } } } });
    const items = [{ category: 'TMN', fcstDate: '20261104', fcstValue: '1.0' }, { category: 'TMN', fcstDate: '20261105', fcstValue: '3.0' }, { category: 'TMX', fcstDate: '20261105', fcstValue: '13.0' }, { category: 'TMX', fcstDate: '20261106', fcstValue: '15.0' }];
    same(weather.todayRange(weather.readKmaBody(json('00', items)), '20261105'), { min: 3, max: 13 });
    same(weather.todayRange([], '20261105'), { min: null, max: null });
    assert.equal(weather.nowcastTemp([{ category: 'REH', obsrValue: '50' }, { category: 'T1H', obsrValue: '-2.4' }]), -2.4);
    assert.equal(weather.nowcastTemp([{ category: 'T1H', obsrValue: '' }]), null);
    same(weather.readKmaBody(json('03', undefined)), []);
    assert.throws(() => weather.readKmaBody('<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'), /키가 아직 등록되지 않았거나/);
    assert.throws(() => weather.readKmaBody(json('22')), /호출 한도/);
    assert.throws(() => weather.readKmaBody(json('10')), /응답 오류 \(MSG\)/);
  });

  await check('an already-encoded key is sent as is and a decoded one is encoded once', () => {
    assert.equal(weather.serviceKeyParam('abc%2Bdef%3D%3D'), 'abc%2Bdef%3D%3D');
    assert.equal(weather.serviceKeyParam('abc+def=='), 'abc%2Bdef%3D%3D');
  });

  // /api/weather with a fake 기상청: each test sets the clock, the key and what each request returns.
  const route = (key, reply, now) => {
    const calls = [];
    const RealDate = Date;
    class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
    const mod = load('app/api/weather/route.ts', { '@/lib/kma-weather': load('lib/kma-weather.ts', {}, { Date: FixedDate }) }, {
      Date: FixedDate, URL, URLSearchParams, Promise, process: { env: key ? { KMA_SERVICE_KEY: key } : {} },
      AbortSignal: { timeout: () => undefined },
      Response: { json: (body, init) => ({ body, status: init?.status ?? 200, headers: init?.headers }) },
      fetch: async (url, init) => { calls.push({ url: new URL(url), init }); const out = reply(new URL(url)); return { ok: out.status === undefined || out.status < 400, status: out.status ?? 200, text: async () => out.text }; },
    });
    return { calls, get: (query) => mod.GET({ url: `https://app.test/api/weather?${query}` }) };
  };
  const ok = items => ({ text: JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: items } } } }) });
  const now = KST('2026-11-05T14:40:00');

  await check('the route checks the grid and the key before calling 기상청', async () => {
    const r = route('', () => ok([]), now);
    assert.equal((await r.get('nx=60&ny=125')).status, 503);
    assert.equal((await route('k', () => ok([]), now).get('nx=0&ny=125')).status, 400);
    assert.equal((await route('k', () => ok([]), now).get('nx=60.5&ny=125')).status, 400);
    assert.equal((await route('k', () => ok([]), now).get('ny=125')).status, 400);
    assert.equal(r.calls.length, 0);
  });

  await check('the route combines 실황 and today\'s 최저·최고, caches each call 30 minutes and keeps the key off the reply', async () => {
    const r = route('raw+key==', url => url.pathname.endsWith('getUltraSrtNcst')
      ? ok([{ category: 'T1H', obsrValue: '12.3' }])
      : ok([{ category: 'TMN', fcstDate: '20261105', fcstValue: '3' }, { category: 'TMX', fcstDate: '20261105', fcstValue: '13' }]), now);
    const res = await r.get('nx=60&ny=125');
    assert.equal(res.status, 200); assert.equal(res.headers['Cache-Control'], 'no-store');
    same(res.body, { date: '2026-11-05', temp: 12.3, observedAt: '14:00', min: 3, max: 13 });
    const [nowcast, forecast] = [r.calls.find(c => c.url.pathname.endsWith('getUltraSrtNcst')), r.calls.find(c => c.url.pathname.endsWith('getVilageFcst'))];
    assert.equal(nowcast.url.searchParams.get('base_time'), '1400'); assert.equal(forecast.url.searchParams.get('base_time'), '0200');
    assert.equal(forecast.url.searchParams.get('base_date'), '20261105'); assert.equal(forecast.url.searchParams.get('nx'), '60');
    assert(nowcast.url.search.includes('serviceKey=raw%2Bkey%3D%3D'));
    assert(r.calls.every(c => c.init.next.revalidate === 1800));
    assert(!JSON.stringify(res.body).includes('key'));
  });

  await check('an hour not served yet falls back to the hour before, and one failing half still shows the other', async () => {
    let r = route('k', url => url.pathname.endsWith('getUltraSrtNcst')
      ? (url.searchParams.get('base_time') === '1400' ? { text: JSON.stringify({ response: { header: { resultCode: '03' } } }) } : ok([{ category: 'T1H', obsrValue: '11' }]))
      : { status: 500, text: '' }, now);
    let res = await r.get('nx=60&ny=125');
    assert.equal(res.status, 200); same(res.body, { date: '2026-11-05', temp: 11, observedAt: '13:00', min: null, max: null });
    r = route('k', () => ({ text: '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>' }), now);
    res = await r.get('nx=60&ny=125');
    assert.equal(res.status, 502); assert.match(res.body.error, /키가 아직 등록되지 않았거나/);
  });

  console.log(`${count} weather checks passed; no network calls.`);
})().catch(e => { console.error(e); process.exit(1); });
