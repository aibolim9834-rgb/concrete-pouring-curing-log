// 기상특보: 현장 기상 위치 → 특보구역, the 특보현황 text (t6 발효 중, t7 예비특보) for one site, and /api/weather-warning with a mocked fetch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, extras = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) { if (id in extras) return extras[id]; throw new Error(`Unexpected dependency ${id}`); }, Error, ...globals });
  return module.exports;
}
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const regions = json('lib/kma-regions.json'), zoneTable = json('lib/kma-warning-zones.json');
const rows = regions.rows, zones = zoneTable.rows;
const warning = load('lib/kma-warning.ts'), weather = load('lib/kma-weather.ts');
let count = 0;
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }
const region = (sido, sgg, dong = '') => { const r = rows.find(x => x[1] === sido && x[2] === sgg && x[3] === dong); assert(r, `${sido} ${sgg} ${dong}`); return r; };
const site = (...a) => warning.siteZones(region(...a), zones);

// t6/t7 exactly as 기상청 returned them on 2026-11-05 07:00.
const T6 = 'o 강풍주의보 : 전라남도(흑산도.홍도), 제주도\r\no 풍랑주의보 : 서해남부북쪽바깥먼바다, 서해남부남쪽바깥먼바다, 남해동부안쪽먼바다, 남해동부바깥먼바다, 남해서부서쪽먼바다, 제주도전해상';
const T7 = '(1) 풍랑 예비특보\r\no 11월 05일 오전(06시~12시) : 서해남부남쪽안쪽먼바다\r\no 11월 05일 오후(12시~18시) : 남해서부동쪽먼바다\r\n(2) 강풍 예비특보\r\no 11월 05일 오후(12시~18시) : 전라남도(거문도.초도)\r\no 11월 06일 새벽(00시~06시) : 서해5도, 강원도(고성산지, 인제산지), 충청남도(보령도서), 인천(옹진, 인천영종), 울릉도.독도\r\no 11월 06일 오전(06시~12시) : 전라남도(신안(흑산면제외), 진도, 영광낙월면)';

(async () => {
  await check('the zone table is the guide\'s land 특보구역 list with a parent for every zone but 전국', () => {
    assert.equal(zones.length, 301);
    const codes = new Set(zones.map(z => z[0]));
    for (const z of zones) { assert.match(z[0], /^L1\d{6}$/); assert(z[3] === '' ? z[0] === 'L1000000' : codes.has(z[3])); }
    assert(zones.some(z => z[1] === '서울서남권') && zones.some(z => z[1] === '용인남부'));
  });

  await check('a 시·군 with its own zone gets that zone, its 권역 and the 시·도 above it', () => {
    const yongin = site('경기도', '용인시처인구');
    for (const c of ['L1013800', 'L1013810', 'L1013820', 'L1013830', 'L1010000', 'L1000000']) assert(yongin.has(c), c);
    assert(!yongin.has('L1013700')); // 파주
    assert(site('강원특별자치도', '고성군').has('L1022200') && !site('강원특별자치도', '고성군').has('L1082300')); // not 경남 고성
    assert(site('경기도', '광주시').has('L1013400') && !site('경기도', '광주시').has('L1130000'));
    assert(site('인천광역시', '강화군').has('L1010900'));
    assert(site('전남광주통합특별시', '신안군').has('L1052200'));
    const jeju = site('제주특별자치도', '제주시');
    assert(jeju.has('L1091300') && jeju.has('L1091320') && jeju.has('L1090000') && !jeju.has('L1091400'));
  });

  await check('a 구 of a 특별·광역시 gets the city and all of its 권역', () => {
    const seoul = site('서울특별시', '동작구', '노량진제1동');
    for (const c of ['L1100000', 'L1100100', 'L1100200', 'L1100300', 'L1100400']) assert(seoul.has(c), c);
    assert(!seoul.has('L1010000'));
    assert(site('전남광주통합특별시', '광산구').has('L1130110') && !site('전남광주통합특별시', '광산구').has('L1050000'));
    assert(site('세종특별자치시', '세종특별자치시').has('L1170110'));
  });

  await check('t6 gives only the 특보 that touch the site, 경보 first, with the zone names as written', () => {
    same(warning.warningsFor(T6, site('제주특별자치도', '제주시'), zones), [{ kind: '강풍', level: '주의보', zones: ['제주도'] }]);
    same(warning.warningsFor(T6, site('서울특별시', '동작구'), zones), []);
    same(warning.warningsFor(T6, site('전남광주통합특별시', '신안군'), zones), []); // 흑산도.홍도 is apart from 신안(흑산면제외)
    const t6 = 'o 대설주의보 : 서울\r\no 한파경보 : 서울(서울동남권), 경기도(용인남부, 파주서북부)\r\no 폭염주의보 : 광주';
    same(warning.warningsFor(t6, site('서울특별시', '동작구'), zones), [{ kind: '한파', level: '경보', zones: ['서울동남권'] }, { kind: '대설', level: '주의보', zones: ['서울'] }]);
    same(warning.warningsFor(t6, site('경기도', '용인시수지구'), zones), [{ kind: '한파', level: '경보', zones: ['용인남부'] }]);
    same(warning.warningsFor(t6, site('경기도', '광주시'), zones), []); // the bare 광주 is 광주광역시
    same(warning.warningsFor(t6, site('전남광주통합특별시', '북구'), zones), [{ kind: '폭염', level: '주의보', zones: ['광주'] }]);
    same(warning.warningsFor('o 없음', site('서울특별시', '동작구'), zones), []);
  });

  await check('건조·황사·폭풍해일·풍랑 are left off, in force or ahead', () => {
    const t6 = 'o 건조주의보 : 서울\r\no 황사경보 : 서울\r\no 폭풍해일주의보 : 인천(인천영종)\r\no 호우주의보 : 서울(서울서남권)';
    same(warning.warningsFor(t6, site('서울특별시', '동작구'), zones), [{ kind: '호우', level: '주의보', zones: ['서울서남권'] }]);
    same(warning.warningsFor(t6, site('인천광역시', '연수구'), zones), []);
    const t7 = '(1) 건조 예비특보\r\no 11월 06일 오전(06시~12시) : 서울\r\n(2) 한파 예비특보\r\no 11월 07일 아침(06시~09시) : 서울';
    same(warning.previewsFor(t7, site('서울특별시', '동작구'), zones), [{ kind: '한파', when: '11/7 아침(06시~09시)', zones: ['서울'] }]);
  });

  await check('t7 gives the 예비특보 by time, nested names included', () => {
    same(warning.previewsFor(T7, site('강원특별자치도', '고성군'), zones), [{ kind: '강풍', when: '11/6 새벽(00시~06시)', zones: ['고성산지'] }]);
    same(warning.previewsFor(T7, site('인천광역시', '연수구'), zones), [{ kind: '강풍', when: '11/6 새벽(00시~06시)', zones: ['옹진', '인천영종'] }]);
    same(warning.previewsFor(T7, site('전남광주통합특별시', '신안군'), zones), [{ kind: '강풍', when: '11/6 오전(06시~12시)', zones: ['신안(흑산면제외)'] }]);
    same(warning.previewsFor(T7, site('서울특별시', '동작구'), zones), []);
    // Today (KST) shows the time alone; any other day carries its date. 2026-11-05 00:30 KST is still 11-04 in UTC.
    assert.equal(warning.issuedClock(202611050700, Date.UTC(2026, 10, 5, 3)), '07:00');
    assert.equal(warning.issuedClock(202611050000, Date.UTC(2026, 10, 4, 15, 30)), '00:00');
    assert.equal(warning.issuedClock(202611041500, Date.UTC(2026, 10, 4, 23, 20)), '11.04 15:00');
    assert.equal(warning.issuedClock('x'), '');
  });

  // /api/weather-warning with a fake 기상청.
  const route = (key, reply) => {
    const calls = [];
    const mod = load('app/api/weather-warning/route.ts', {
      '@/lib/kma-weather': weather, '@/lib/kma-warning': warning, '@/lib/kma-regions.json': regions, '@/lib/kma-warning-zones.json': zoneTable,
    }, {
      URL, Promise, process: { env: key ? { KMA_SERVICE_KEY: key } : {} }, AbortSignal: { timeout: () => undefined },
      Response: { json: (body, init) => ({ body, status: init?.status ?? 200, headers: init?.headers }) },
      fetch: async (url, init) => { calls.push({ url: new URL(url), init }); const out = reply(new URL(url), init); return { ok: (out.status ?? 200) < 400, status: out.status ?? 200, headers: { get: name => name === 'date' ? out.date ?? null : null }, text: async () => out.text }; },
    });
    return { calls, get: query => mod.GET({ url: `https://app.test/api/weather-warning?${query}` }) };
  };
  const status = item => ({ text: JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [item] } } } }) });
  const jejuCode = region('제주특별자치도', '제주시')[0];

  await check('the route checks the place and the key before calling 기상청', async () => {
    const r = route('', () => status({}));
    assert.equal((await r.get(`code=${jejuCode}`)).status, 503);
    assert.equal((await route('k', () => status({})).get('code=12345')).status, 400);
    assert.equal((await route('k', () => status({})).get('code=9999999999')).status, 400);
    assert.equal(r.calls.length, 0);
  });

  await check('the route reads the nationwide 특보현황 once, caches it 10 minutes and keeps the key off the reply', async () => {
    const r = route('raw+key==', () => status({ t6: T6, t7: T7, tmFc: 202611050700 }));
    const res = await r.get(`code=${jejuCode}`);
    assert.equal(res.status, 200);
    same(res.body, { issuedAt: '11.05 07:00', warnings: [{ kind: '강풍', level: '주의보', zones: ['제주도'] }], previews: [] });
    assert.equal(r.calls.length, 1); assert(r.calls[0].url.pathname.endsWith('/WthrWrnInfoService/getPwnStatus'));
    assert.equal(r.calls[0].init.next.revalidate, 600);
    assert.equal(r.calls[0].url.searchParams.get('serviceKey'), 'raw+key==');
    assert(!JSON.stringify(res.body).includes('raw'));
  });

  await check('a kept copy over 20 minutes old is asked for again uncached; a recent one is used as it is', async () => {
    const ago = minutes => new Date(Date.now() - minutes * 60000).toUTCString();
    const old = route('k', (url, init) => init.cache === 'no-store' ? status({ t6: T6, tmFc: 202611050700 }) : { ...status({ tmFc: 202611041500 }), date: ago(900) });
    const res = await old.get(`code=${jejuCode}`);
    assert.equal(old.calls.length, 2); assert.equal(old.calls[1].init.cache, 'no-store');
    assert.equal(res.body.issuedAt, '11.05 07:00'); assert.equal(res.body.warnings.length, 1);
    const recent = route('k', () => ({ ...status({ tmFc: 202611050700 }), date: ago(15) }));
    await recent.get(`code=${jejuCode}`);
    assert.equal(recent.calls.length, 1);
  });

  await check('a key 기상청 has not registered for 특보 comes back as a readable error', async () => {
    const res = await route('k', () => ({ status: 403, text: '' })).get(`code=${jejuCode}`);
    assert.equal(res.status, 502); assert.match(res.body.error, /응답하지 않습니다/);
    const res2 = await route('k', () => ({ text: '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>' })).get(`code=${jejuCode}`);
    assert.equal(res2.status, 502); assert.match(res2.body.error, /키가 아직 등록되지 않았거나/);
  });

  console.log(`${count} weather warning checks passed; no network calls.`);
})().catch(e => { console.error(e); process.exit(1); });
