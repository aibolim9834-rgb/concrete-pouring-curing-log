// Uses actual TS modules with in-memory storage and mocked React/DB only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function memory() {
  const entries = new Map();
  return { entries, get length() { return entries.size; }, key(i) { return [...entries.keys()][i] ?? null; }, getItem(k) { return entries.get(k) ?? null; }, setItem(k,v) { entries.set(k,v); }, removeItem(k) { entries.delete(k); } };
}
const storage = memory(), cache = {};
class TestNode {}
function load(file, extras = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id in extras) return extras[id];
    if (id.startsWith('.')) { const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file),id)) + '.ts'; return cache[resolved] ||= load(resolved); }
    throw new Error(`Unexpected dependency ${id}`);
  }, localStorage: storage, process:{env:{NEXT_PUBLIC_CON1_QA:'true'}}, TextEncoder, Error, crypto:require('node:crypto').webcrypto, structuredClone, ...globals });
  return module.exports;
}
const model = load('lib/pouring-progress.ts'), data = load('lib/log-data.ts'), backup = load('lib/app-backup.ts');
const site = { id:'site-a',name:'검증 현장' };
const log = { ...data.newLog(site.id), id:'log-a', building:'101동',floor:'1F',date:'2026-08-01',volume:10,remarks:'특이사항' };
const same = (a,b) => assert.equal(JSON.stringify(a),JSON.stringify(b));
let count=0;
async function check(name,run) { await run(); count++; console.log(`PASS ${name}`); }
function find(node,type) { if (!node || typeof node !== 'object') return null; if(Array.isArray(node)){for(const child of node){const match=find(child,type);if(match)return match;}return null;} if(node.type===type)return node;return find(node.props?.children,type); }
// 작업 기록 stub: records what the app reports, runs tracked work as is.
const events=[];
const eventLogStub={logEvent:e=>events.push(e),noteAction(){},startEventLog(){},describeError:e=>({message:e instanceof Error?e.message:String(e),unexpected:!(e instanceof Error&&e.name==='Error')}),
  tracked:async(info,run,okTarget)=>{try{const v=await run();events.push({...info,outcome:'ok',target:okTarget?okTarget(v)??info.target:info.target});return v;}catch(e){events.push({...info,outcome:'error',message:e&&e.message});throw e;}}};
function appHarness(result, local = false, overrides = {}) {
  const states = [], refs = []; let cursor=0, refCursor=0, effects=[], csv='';const navigation=[],alerts=[];
  states[0]=[site];states[1]=site.id;states[2]=[log];states[5]=!local;states[6]=false;states[7]='';states[8]=true;
  const react = {useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useEffect(effect){effects.push(effect);},useRef(value){const i=refCursor++;return refs[i] ||= {current:value};}};
  const jsx=(type,props)=>({type,props});
  const supabase={from(){const q={update(){return q;},insert(){return q;},delete(){return q;},eq(){return q;},select(){return q;},abortSignal(){return q;},single:async()=>result,maybeSingle:async()=>result,then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};return q;}};
  const deps = {react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/supabase':{supabase,checkSupabaseHealth:async()=>false},'@/lib/log-data':data,'@/lib/site-archive':load('lib/site-archive.ts'),'@/lib/pouring-progress':model,'./BackupManager':{BackupManager:'BackupManager'}};
  deps['@/lib/site-code']=load('lib/site-code.ts');
  deps['@/lib/cloud-log-data']={loadCloudLogData:async()=>({sites:[site],logs:[log]})};
  deps['@/lib/xlsx']=load('lib/xlsx.ts',{},{TextEncoder});deps['@/lib/log-export']=load('lib/log-export.ts',{'./xlsx':deps['@/lib/xlsx'],'./strength':load('lib/strength.ts'),'./watering':load('lib/watering.ts')});deps['@/lib/pouring-progress']={...model,downloadFile:(name,content)=>{assert(name.endsWith('.xlsx'));csv=Buffer.from(content).toString('utf8');}};
  deps['@/lib/watering']=load('lib/watering.ts');
  deps['@/lib/strength']=load('lib/strength.ts');
  deps['@/lib/floor']=load('lib/floor.ts');
  deps['@/lib/date-only']=load('lib/date-only.ts');
  deps['@/lib/site-photos-cloud']={listPhotos:async()=>[],markPhotosDeleted:async()=>{}};
  deps['@/lib/cloud-storage']={cloudStorageEnabled:()=>false};
  deps['@/lib/event-log']=eventLogStub;
  deps['@/components/ConfirmDialog']={askConfirm:async()=>true,ConfirmHost:'ConfirmHost'};
  deps['@/lib/db-error']=load('lib/db-error.ts',{},{console:{error(){}}});
  deps['@/lib/request-timeout']=load('lib/request-timeout.ts',{},{AbortSignal,AbortController,setTimeout,clearTimeout});
  Object.assign(deps,overrides);
  for(const name of ['Header','SummaryCards','RecordTable','SiteModal','PrintView','PouringProgress','SitePhotos'])deps[`@/components/${name}`]={[name]:name};
  const app=load('components/ConcreteApp.tsx',deps,{confirm:()=>true,alert:message=>alerts.push(message),window:{location:{search:'',assign:url=>navigation.push(url)},addEventListener(){},removeEventListener(){}},URLSearchParams,setTimeout:()=>{},Blob:class{constructor(parts){csv=parts.join('');}},URL:{createObjectURL:()=> 'blob:test'},document:{createElement:()=>({setAttribute(){},click(){}}),body:{appendChild(){},removeChild(){}}}});
  return {states,navigation,alerts,get csv(){return csv;},get effects(){return effects;},render(){cursor=0;refCursor=0;effects=[];return app.ConcreteApp({initialView:arguments[0]||'logs'});}};
}
function uiHarness(file, name, props, extra = {}) {
  let cursor=0,refCursor=0,effects=[];const states=[],refs=[];
  const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect(fn){effects.push(fn);},useCallback(fn){return fn;},useRef(value){return refs[refCursor++] ||= {current:value};}};
  const jsx=(type,props)=>({type,props});
  const events=new Map();
  const exports=load(file,{react,'react/jsx-runtime':{jsx,jsxs:jsx},'./Modal':{Modal:'Modal'},'./ConfirmDialog':{askConfirm:async()=>true},'./WateringSelect':{WateringSelect:'WateringSelect'},'./MobileLogSheet':{MobileLogSheet:'MobileLogSheet'},'./ShortDateInput':{ShortDateInput:'ShortDateInput'},'./DailyReportDialog':{DailyReportDialog:'DailyReportDialog'},'./SiteAddressFields':{SiteAddressFields:'SiteAddressFields'},'@/lib/smooth-wheel':{smoothWheel(){}},'@/lib/event-log':eventLogStub,'@/lib/kma-area':load('lib/kma-area.ts'),'@/lib/site-photos-cloud':{photoArchive:()=>undefined,pendingArchive:async()=>null,archiveDelay:()=>null,listPhotos:async()=>[]},'@/lib/progress-structure':load('lib/progress-structure.ts'),'@/lib/site-archive':load('lib/site-archive.ts'),'@/lib/site-code':load('lib/site-code.ts'),'@/lib/date-only':load('lib/date-only.ts'),'@/lib/pouring-progress':load('lib/pouring-progress.ts'),'@/lib/watering':load('lib/watering.ts'),'@/lib/strength':load('lib/strength.ts'),'@/lib/log-data':data,'lucide-react':new Proxy({}, {get:(_,name)=>name}),...extra},{Node:TestNode,CSS:{escape:value=>value},requestAnimationFrame:fn=>fn(),document:{querySelector:()=>null,addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:(type)=>events.delete(type)},window:{addEventListener(){},removeEventListener(){}}});
  return {states,events,get effects(){return effects;},render(){cursor=0;refCursor=0;effects=[];return exports[name](props);}};
}
(async()=>{
  await check('standalone strengths gain one MPa while empty and mixed specifications survive',()=>{
    const {normalizeStrength:format}=load('lib/strength.ts');
    for(const [input,expected] of [['30','30MPa'],[' 30 ','30MPa'],['30 MPa','30MPa'],['30mpa','30MPa'],['30MPaMPa','30MPa'],['30.5','30.5MPa'],['0','0MPa'],['',''],['  ',''],[null,''],[undefined,''],['40-210','40-210'],['25-24-150','25-24-150'],['27, 30MPa','27, 30MPa'],['27MPa(기둥 40MPa 12M3)','27MPa(기둥 40MPa 12M3)']]){
      assert.equal(format(input),expected);assert.equal(format(format(input)),expected);
    }
  });
  await check('strength typing stays raw until blur in quick add and inline edit',()=>{
    const all=(n,type)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(x=>all(x,type)):[...(n.type===type?[n]:[]),...all(n.props?.children,type)];
    const h=uiHarness('components/RecordTable.tsx','RecordTable',{logs:[log],site,filters:data.emptyLogFilters(),sort:data.defaultLogSort});
    let input=all(h.render(),'input').find(n=>n.props['aria-label']==='새 일지 타설강도');
    input.props.onChange({target:{value:'30'}});input=all(h.render(),'input').find(n=>n.props['aria-label']==='새 일지 타설강도');assert.equal(input.props.value,'30');
    input.props.onBlur({target:{value:'30'}});assert.equal(all(h.render(),'input').find(n=>n.props['aria-label']==='새 일지 타설강도').props.value,'30MPa');
    h.states[2]=log.id;h.states[3]={...log,strength:'35 MPa'};input=all(h.render(),'input').find(n=>n.props['aria-label']==='수정 일지 타설강도');input.props.onBlur({target:{value:'35 MPa'}});assert.equal(h.states[3].strength,'35MPa');
  });
  await check('strength submission normalizes even without blur and CSV matches saved strength',async()=>{
    const h=appHarness(null,true);storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));
    const before={...log,strength:'33',curing_protection:'원본 보양'};
    await find(h.render(),'RecordTable').props.onQuickUpdateLog(log.id,before);
    same(JSON.parse(storage.getItem('cp_logs'))[0],{...before,strength:'33MPa'});
    find(h.render(),'RecordTable').props.onExportExcel();assert(h.csv.includes('33MPa'));assert(!h.csv.includes('MPaMPa'));
  });
  await check('watering dropdown offers four choices and retains nonstandard existing content',()=>{
    const props={value:'1일 2회 살수 실시',onChange(){},'aria-label':'살수'};
    const show=value=>uiHarness('components/WateringSelect.tsx','WateringSelect',{...props,value}).render();
    const tree=show(props.value);
    assert.equal(tree.type,'select');assert.equal(tree.props.value,'1일 2회 살수');
    assert.equal(JSON.stringify(tree).includes('실시'),false);
    for(let i=1;i<=4;i++)assert(JSON.stringify(tree).includes(`1일 ${i}회 살수`));
    assert.equal(show('1일 0회 살수 실시').props.value,'1일 0회 살수');
    assert(JSON.stringify(show('1일 0회 살수 실시')).includes('(기존 내용)'));
    assert.equal(show('').props.value,'');
    const watering=load('lib/watering.ts');
    for(const value of ['','살수 없음','1일 4회 살수'])assert.equal(watering.normalizeWatering(value),value);
    assert.equal(watering.normalizeWatering('\t 1일 3회 살수 실시'),'1일 3회 살수');
  });
  await check('watering save strips only 실시 while other journal fields remain intact',async()=>{
    const input={...log,curing_watering:'1일 2회 살수 실시',curing_protection:'보양 실시',remarks:'실시일 확인'};
    const h=appHarness(null,true);storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));
    await find(h.render(),'RecordTable').props.onQuickUpdateLog(log.id,input);
    const saved=JSON.parse(storage.getItem('cp_logs'))[0];
    same(saved,{...input,curing_watering:'1일 2회 살수'});
  });
  await check('inline row saves only on leaving row, prevents duplicate saves and retains failed draft',async()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    let calls=0,resolve,reject;
    const h=uiHarness('components/RecordTable.tsx','RecordTable',{logs:[log],site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onQuickUpdateLog:(id,draft)=>{assert.equal(id,log.id);assert.equal(draft.floor,'2층');calls++;return new Promise((yes,no)=>{resolve=yes;reject=no;});}});
    h.render();h.states[2]=log.id;h.states[3]={...log,floor:'2층'};
    let row=all(h.render(),'tr').find(n=>n.props.onBlur);
    row.props.onBlur({currentTarget:{contains:()=>true},relatedTarget:{}});assert.equal(calls,0);
    row.props.onBlur({currentTarget:{contains:()=>false},relatedTarget:null});assert.equal(calls,0);
    row.props.ref.current={contains:node=>!!node.inside};h.effects.forEach(effect=>effect());
    const inside=new TestNode();inside.inside=true;h.events.get('pointerdown')({target:inside});assert.equal(calls,0);
    h.events.get('pointerdown')({target:new TestNode()});
    h.events.get('pointerdown')({target:new TestNode()});assert.equal(calls,1);
    reject(new Error('save failed'));await new Promise(setImmediate);
    assert.equal(h.states[2],log.id);assert.equal(h.states[3].floor,'2층');assert.match(h.states[1],/save failed/);
    row=all(h.render(),'tr').find(n=>n.props.onBlur);row.props.onBlur({currentTarget:{contains:()=>false},relatedTarget:{}});
    resolve();await new Promise(setImmediate);assert.equal(calls,2);assert.equal(h.states[2],null);
  });
  await check('inline row Enter saves, but not while Korean input is composing or on a button',async()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    let calls=0;
    const h=uiHarness('components/RecordTable.tsx','RecordTable',{logs:[log],site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onQuickUpdateLog:(id,draft)=>{assert.equal(draft.floor,'2층');calls++;return Promise.resolve();}});
    h.render();h.states[2]=log.id;h.states[3]={...log,floor:'2층'};
    const row=all(h.render(),'tr').find(n=>n.props.onKeyDown&&n.props.onBlur);let prevented=0;
    const key=(target,extra={})=>row.props.onKeyDown({key:'Enter',repeat:false,target:{matches:()=>target==='field'},nativeEvent:{isComposing:false,keyCode:13,...extra},preventDefault:()=>prevented++});
    key('field',{isComposing:true});key('field',{keyCode:229});key('button');assert.equal(calls,0);assert.equal(prevented,2);
    key('field');await new Promise(setImmediate);assert.equal(calls,1);assert.equal(h.states[2],null);
  });
  await check('PC log keys: Enter adds from any field, Esc cancels an edit, and the cursor lands where the next step starts',async()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    let added=0,updated=0,focused='';
    const h=uiHarness('components/RecordTable.tsx','RecordTable',{logs:[log],site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onQuickAddLog:()=>{added++;return Promise.resolve();},onQuickUpdateLog:()=>{updated++;return Promise.resolve();}});
    const settle=async()=>{await new Promise(setImmediate);const tree=h.render();h.effects.forEach(effect=>effect());return tree;};
    const key=(row,name,target,extra={})=>row.props.onKeyDown({key:name,repeat:false,target:{matches:()=>target==='field'},nativeEvent:{isComposing:false,keyCode:name==='Enter'?13:27,...extra},preventDefault(){}});
    const focusAs=name=>({querySelector:()=>({focus:()=>{focused=name;}})});
    let tree=h.render();
    all(tree,'input').find(n=>n.props['aria-label']==='새 일지 동·구역').props.ref.current={focus:()=>{focused='building';}};
    all(tree,'table')[0].props.ref.current={querySelector:selector=>selector.includes(log.id)?{focus:()=>{focused='edit button';}}:null};
    // The entry row: Enter in any field (date, temperature and select boxes included) adds, then the cursor waits in 동(구역).
    const addRow=all(tree,'tr').find(n=>String(n.props.className).includes('log-quick-add-row'));
    key(addRow,'Enter','field',{isComposing:true});key(addRow,'Enter','field',{keyCode:229});key(addRow,'Enter','button');key(addRow,'Escape','field');assert.equal(added,0);
    key(addRow,'Enter','field');tree=await settle();assert.equal(added,1);assert.equal(focused,'building');
    // Double-clicking a cell starts the edit with the cursor in that column.
    all(tree,'tr').find(n=>n.props.onDoubleClick).props.onDoubleClick({target:{closest:()=>({cellIndex:3})}});
    tree=h.render();let editRow=all(tree,'tr').find(n=>n.props.onBlur);
    editRow.props.ref.current={cells:{3:focusAs('floor')}};h.effects.forEach(effect=>effect());assert.equal(focused,'floor');
    // Esc cancels without saving and puts the cursor back on the row's edit button; Esc that ends Korean input does not.
    key(editRow,'Escape','field',{isComposing:true});assert.equal(h.states[2],log.id);
    key(editRow,'Escape','field');assert.equal(h.states[2],null);assert.equal(updated,0);
    h.render();h.effects.forEach(effect=>effect());assert.equal(focused,'edit button');
    // The edit button starts at 일자; Enter saves and the cursor returns to the edit button.
    all(h.render(),'button').find(n=>n.props['data-log-edit']===log.id).props.onClick();
    tree=h.render();editRow=all(tree,'tr').find(n=>n.props.onBlur);
    editRow.props.ref.current={cells:{1:focusAs('date')}};h.effects.forEach(effect=>effect());assert.equal(focused,'date');
    h.states[3]={...h.states[3],floor:'2F'};editRow=all(h.render(),'tr').find(n=>n.props.onBlur);
    key(editRow,'Enter','field');await settle();assert.equal(updated,1);assert.equal(h.states[2],null);assert.equal(focused,'edit button');
  });
  await check('phones list one tappable card per log with date, weekday, place and pour summary, plus a sort select',async()=>{    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    const logs=[{...log,id:'c1',date:'2026-11-05',building:'주차장#4',floor:'B1F, RF',member_type:'슬라브',strength:'30',volume:228},{...log,id:'c2',date:'2026-11-02',building:'101동',floor:'2F',strength:'',volume:null}];
    let sorted=null;
    const show=(props={})=>uiHarness('components/RecordTable.tsx','RecordTable',{logs,site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onSortChange:s=>{sorted=s;},...props});
    const cardsOf=tree=>all(tree,'ul').find(n=>n.props.className==='log-card-list');
    const h=show();let tree=h.render();const cards=all(cardsOf(tree),'button');
    assert.equal(cards.length,2);
    const first=JSON.stringify(cards[0]);for(const text of ['26.11.05(목)','주차장#4','B1F, RF','슬라브','30MPa','228 m³'])assert(first.includes(text),text);
    const second=JSON.stringify(cards[1]);assert(second.includes('26.11.02(월)'));assert(!second.includes('MPa'));assert(!second.includes('m³'));
    cards[1].props.onClick();assert.equal(h.states[6].id,'c2');
    const sortSelect=all(tree,'select').find(n=>n.props['aria-label']==='정렬');
    assert.equal(sortSelect.props.value,'date:desc');assert.equal(all(sortSelect,'option').length,4);
    sortSelect.props.onChange({target:{value:'volume:desc'}});same(sorted,{key:'volume',direction:'desc'});
    // An order picked from the PC headers shows as its own entry instead of a wrong one.
    const custom=all(show({sort:{key:'min_temp',direction:'asc'}}).render(),'select').find(n=>n.props['aria-label']==='정렬');
    assert.equal(all(custom,'option').length,5);assert.equal(all(custom,'option')[0].props.children.join(''),'최저온도 오름차순');
    // A 종료 site lists cards that do not open the edit sheet; an empty site says how to start.
    const closed=cardsOf(show({readOnly:true}).render());assert.equal(all(closed,'button').length,0);assert.equal(all(closed,'div').length,2);
    assert(JSON.stringify(cardsOf(show({logs:[]}).render())).includes('아직 일지가 없습니다'));
  });
  await check('an inline edit with nothing changed closes without writing the log again',async()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    const saved={...log,strength:'',volume:null,remarks:null,min_temp:5};let calls=0,focused='';
    const h=uiHarness('components/RecordTable.tsx','RecordTable',{logs:[saved],site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onQuickUpdateLog:()=>{calls++;return Promise.resolve();}});
    const start=()=>{all(h.render(),'tr').find(n=>n.props.onDoubleClick).props.onDoubleClick({target:{closest:()=>({cellIndex:2})}});return all(h.render(),'tr').find(n=>n.props.onBlur);};
    all(h.render(),'table')[0].props.ref.current={querySelector:()=>({focus:()=>{focused='edit button';}})};
    // Clicking outside an untouched row closes it.
    let row=start();row.props.ref.current={contains:()=>false,cells:[]};h.effects.forEach(effect=>effect());
    h.events.get('pointerdown')({target:new TestNode()});await new Promise(setImmediate);assert.equal(calls,0);assert.equal(h.states[2],null);
    // Enter on an untouched row closes it and returns the cursor to the edit button.
    row=start();row.props.onKeyDown({key:'Enter',repeat:false,target:{matches:()=>true},nativeEvent:{isComposing:false,keyCode:13},preventDefault(){}});
    await new Promise(setImmediate);h.render();h.effects.forEach(effect=>effect());assert.equal(calls,0);assert.equal(h.states[2],null);assert.equal(focused,'edit button');
    // Typing the same value back is still nothing changed; a real change saves.
    start();h.states[3]={...h.states[3],building:'101동'};all(h.render(),'button').find(n=>n.props['aria-label']==='저장').props.onClick();await new Promise(setImmediate);assert.equal(calls,0);
    start();h.states[3]={...h.states[3],min_temp:6};all(h.render(),'button').find(n=>n.props['aria-label']==='저장').props.onClick();await new Promise(setImmediate);assert.equal(calls,1);
  });
  await check('active log editing blocks route and site changes, completion restores navigation',()=>{
    const h=appHarness(null);let tree=h.render();find(tree,'RecordTable').props.onWorkPending(true);
    find(tree,'Header').props.onNavigate('photos');assert.equal(h.navigation.length,0);assert.equal(h.alerts.length,1);
    find(tree,'Header').props.onSelectSite('other');assert.equal(h.states[1],site.id);
    find(tree,'RecordTable').props.onWorkPending(false);find(tree,'Header').props.onNavigate('photos');assert.equal(h.navigation[0],'/photos?site='+site.id);
  });
  await check('progress edit or save blocks home and site changes until completion',()=>{
    const h=appHarness(null);const tree=h.render('progress');find(tree,'PouringProgress').props.onWorkPending(true);
    find(tree,'Header').props.onOpenHome();assert.equal(h.navigation.length,0);find(tree,'Header').props.onSelectSite('other');assert.equal(h.states[1],site.id);
    find(tree,'PouringProgress').props.onWorkPending(false);find(tree,'Header').props.onOpenHome();assert.equal(h.navigation[0],'/?site='+site.id);
  });
  await check('photo work still blocks home and navigation',()=>{
    const h=appHarness(null);const tree=h.render('photos');find(tree,'SitePhotos').props.onWorkPending(true);find(tree,'Header').props.onOpenHome();assert.equal(h.navigation.length,0);
    find(tree,'SitePhotos').props.onWorkPending(false);find(tree,'Header').props.onOpenHome();assert.equal(h.navigation[0],'/?site='+site.id);
  });
  await check('individual photo edits report pending through save and refresh, retaining failures',async()=>{
    let bucket,cursor=0,refCursor=0,resolveSave,rejectSave,resolveRefresh;
    const react={useState(initial){const i=cursor++;if(!(i in bucket.states))bucket.states[i]=typeof initial==='function'?initial():initial;const current=bucket;return [current.states[i],v=>{current.states[i]=typeof v==='function'?v(current.states[i]):v;}];},useRef(value){return bucket.refs[refCursor++] ||= {current:value};},useEffect(fn){bucket.effects.push(fn);}};
    react.default=react;react.Fragment='Fragment';
    const jsx=(type,props)=>({type,props});
    const photo={id:'photo-a',siteId:site.id,date:'2026-10-26',building:'101동',floor:'5층',name:'original.png',createdAt:1};
    const api=load('components/SitePhotos.tsx',{react,'@/lib/event-log':eventLogStub,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/date-only':load('lib/date-only.ts'),'@/lib/floor':load('lib/floor.ts'),'@/lib/cloud-storage':{cloudStorageEnabled:()=>false},'./ConfirmDialog':{askConfirm:async()=>true},'@/lib/site-photos-cloud':{photoArchive:()=>undefined,pendingArchive:async()=>null,archiveDelay:()=>null,latestDeletedBatch:()=>[],updatePhotoLocation:()=>new Promise((yes,no)=>{resolveSave=yes;rejectSave=no;})}});
    function render(fn,props,target){bucket=target;cursor=0;refCursor=0;target.effects=[];return fn(props);}
    function editorNode(node){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const n of node){const result=editorNode(n);if(result)return result;}return null;}if(node.type?.name==='PhotoLocationEditor')return node;return editorNode(node.props?.children);}
    const parent={states:[[photo],true,'',false,'26.10.26','','','2026-10','','2026-10-26'],refs:[],effects:[]};
    let pending=false;
    const tree=render(api.SitePhotos,{site,onWorkPending:value=>pending=value},parent),node=editorNode(tree);
    assert(node);const editor={states:[],refs:[],effects:[]};
    const props={...node.props,onSaved:()=>new Promise(done=>{resolveRefresh=done;})};
    render(node.type,props,editor).props.onClick();
    const promise=find(render(node.type,props,editor),'form').props.onSubmit({preventDefault(){}});
    let parentTree=render(api.SitePhotos,{site,onWorkPending:value=>pending=value},parent);
    parent.effects[parent.effects.length-1]();assert.equal(pending,true);assert.equal(editorNode(parentTree).props.blocked,true);
    resolveSave();await new Promise(setImmediate);assert.equal(parent.states[17],true);
    resolveRefresh();await promise;
    render(api.SitePhotos,{site,onWorkPending:value=>pending=value},parent);parent.effects[parent.effects.length-1]();assert.equal(pending,false);
    render(node.type,props,editor).props.onClick();
    const failed=find(render(node.type,props,editor),'form').props.onSubmit({preventDefault(){}});
    rejectSave(new Error('offline'));await failed;
    const retained=render(node.type,props,editor);assert(find(retained,'form'));assert(JSON.stringify(retained).includes('offline'));assert.equal(parent.states[17],false);assert.equal(editor.states[1],'101동');
  });
  await check('photo title shows the archive delay only once an original has waited over 2 days',()=>{
    let bucket,cursor=0,refCursor=0;
    const react={useState(initial){const i=cursor++;if(!(i in bucket.states))bucket.states[i]=typeof initial==='function'?initial():initial;return [bucket.states[i],()=>{}];},useRef(value){return bucket.refs[refCursor++] ||= {current:value};},useEffect(){}};
    react.default=react;react.Fragment='Fragment';
    const jsx=(type,props)=>({type,props});
    // The real delay rule, with the network parts stubbed out.
    const {archiveDelay}=load('lib/site-photos-cloud.ts',{'./site-photos':{},'./supabase':{supabase:{}},'./cloud-storage':{cloudStorageEnabled:()=>true},'./request-timeout':{},'./floor':load('lib/floor.ts')});
    const api=load('components/SitePhotos.tsx',{react,'@/lib/event-log':eventLogStub,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/date-only':load('lib/date-only.ts'),'@/lib/floor':load('lib/floor.ts'),'@/lib/cloud-storage':{cloudStorageEnabled:()=>true},'./ConfirmDialog':{askConfirm:async()=>true},'@/lib/site-photos-cloud':{photoArchive:()=>null,pendingArchive:async()=>null,archiveDelay,latestDeletedBatch:()=>[]}},{Date});
    const render=wait=>{const states=[[],true];states[21]=wait;bucket={states,refs:[]};cursor=0;refCursor=0;return JSON.stringify(api.SitePhotos({site,onWorkPending(){}}));};
    const h=3600000;
    const late=render({count:18,oldest:Date.now()-49*h});
    assert(late.includes('"원본 보관 ",2,"일째 밀림 · ",18,"장 대기"'),'원본 보관 2일째 밀림 · 18장 대기');assert(late.includes(' · 사무실 PC·SSD 확인'));
    assert(late.includes('보관은 매일 저녁 7시와 사무실 PC에 로그인할 때 실행됩니다.'));
    const fresh=render({count:3,oldest:Date.now()-5*h});
    assert(!fresh.includes('일째 밀림'));
    assert(!render(null).includes('일째 밀림'));
  });
  await check('photo page opens on 전체 기간 and lists photos from earlier months',()=>{
    let bucket,cursor=0,refCursor=0;
    const react={useState(initial){const i=cursor++;if(!(i in bucket.states))bucket.states[i]=typeof initial==='function'?initial():initial;return [bucket.states[i],()=>{}];},useRef(value){return bucket.refs[refCursor++] ||= {current:value};},useEffect(){}};
    react.default=react;react.Fragment='Fragment';
    const jsx=(type,props)=>({type,props});
    const api=load('components/SitePhotos.tsx',{react,'@/lib/event-log':eventLogStub,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/date-only':load('lib/date-only.ts'),'@/lib/floor':load('lib/floor.ts'),'@/lib/cloud-storage':{cloudStorageEnabled:()=>false},'./ConfirmDialog':{askConfirm:async()=>true},'@/lib/site-photos-cloud':{photoArchive:()=>undefined,pendingArchive:async()=>null,archiveDelay:()=>null,latestDeletedBatch:()=>[]}});
    const photo={id:'photo-old',siteId:site.id,date:'2025-03-14',building:'101동',floor:'5F',name:'old.png',createdAt:1};
    bucket={states:[[photo],true],refs:[]};
    const page=JSON.stringify(api.SitePhotos({site,onWorkPending(){}}));
    assert.equal(bucket.states[7],'');assert(page.includes('전체 기간'));assert(page.includes('25.03.14'));
    // A 타설 사진 tied to a log row stays off the 알폼핀 체결 사진 page.
    bucket={states:[[photo,{...photo,id:'photo-log',logId:'log-a',date:'2025-04-20'}],true],refs:[]};cursor=0;refCursor=0;
    const mixed=JSON.stringify(api.SitePhotos({site,onWorkPending(){}}));
    assert(mixed.includes('25.03.14'));assert(!mixed.includes('25.04.20'));
  });
  await check('photo upload names the missing 촬영일·동·층 on the page instead of a browser alert',()=>{
    let bucket={states:[[],true],refs:[]},cursor=0,refCursor=0;
    const react={useState(initial){const i=cursor++;if(!(i in bucket.states))bucket.states[i]=typeof initial==='function'?initial():initial;return [bucket.states[i],v=>{bucket.states[i]=typeof v==='function'?v(bucket.states[i]):v;}];},useRef(value){return bucket.refs[refCursor++] ||= {current:value};},useEffect(){}};
    react.default=react;react.Fragment='Fragment';
    const jsx=(type,props)=>({type,props});
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    // No alert global is given, so any alert() call would fail this check.
    const api=load('components/SitePhotos.tsx',{react,'@/lib/event-log':eventLogStub,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/date-only':load('lib/date-only.ts'),'@/lib/floor':load('lib/floor.ts'),'@/lib/cloud-storage':{cloudStorageEnabled:()=>false},'./ConfirmDialog':{askConfirm:async()=>true},'@/lib/site-photos-cloud':{photoArchive:()=>undefined,pendingArchive:async()=>null,archiveDelay:()=>null,latestDeletedBatch:()=>[]}});
    const page=()=>{cursor=0;refCursor=0;return api.SitePhotos({site,onWorkPending(){}});};
    const input=(tree,label)=>all(tree,'input').find(n=>n.props['aria-label']===label);
    let tree=page();let focused='';input(tree,'동·구역').props.ref.current={focus:()=>{focused='building';}};
    all(tree,'button').find(n=>n.props.children==='사진 선택').props.onClick();
    tree=page();assert(JSON.stringify(tree).includes('동·구역을 먼저 입력한 뒤 사진을 넣어주세요.'));assert.equal(focused,'building');
    assert.equal(input(tree,'동·구역').props['aria-invalid'],true);assert.equal(input(tree,'층').props['aria-invalid'],undefined);
    // Typing in a field clears the notice.
    input(tree,'동·구역').props.onChange({target:{value:'101동'}});tree=page();assert(!JSON.stringify(tree).includes('photo-upload-error'));
  });
  await check('corrupt JSON blocks reads without rewriting source',()=>{for(const key of ['cp_sites','cp_logs']){storage.entries.clear();storage.setItem(key,'{broken');assert.throws(()=>data.readLocalData(storage));assert.equal(storage.getItem(key),'{broken');}});
  await check('invalid arrays and fields are rejected',()=>{storage.entries.clear();storage.setItem('cp_sites','{}');assert.throws(()=>data.readLocalData(storage));assert.throws(()=>data.validateLogs([{...log,building:null}]));});
  await check('defaults contain no unconfirmed temperature volume weather or curing claims',()=>{const input=data.newLog(site.id);same([input.min_temp,input.max_temp,input.volume,input.weather,input.curing_watering,input.curing_protection],[null,null,'','','','']);});
  await check('shared input validation covers location date temperatures and quantity',()=>{data.validateLogInput(log);for(const change of [{floor:''},{building:''},{date:'2026-02-30'},{min_temp:30,max_temp:20},{volume:-1}])assert.throws(()=>data.validateLogInput({...log,...change}));});
  await check('local save persists before screen update and stale lists are rejected',()=>{storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));const before=data.readLocalData(storage);data.writeLocalData(storage,before,{sites:[site],logs:[{...log,floor:'2층'}]});assert.throws(()=>data.writeLocalData(storage,before,before),/다른 화면/);});
  await check('partial write failure rolls back original lists',()=>{const before=data.readLocalData(storage);const raw=storage.getItem('cp_sites');const set=storage.setItem.bind(storage);storage.setItem=(k,v)=>{if(k==='cp_logs')throw new Error('QuotaExceeded');set(k,v);};try{assert.throws(()=>data.writeLocalData(storage,before,{sites:[...before.sites,{id:'new',name:'다른 현장'}],logs:[log]}),/QuotaExceeded/);}finally{storage.setItem=set;}assert.equal(storage.getItem('cp_sites'),raw);same(data.readLocalData(storage),before);});
  await check('filters combine date building floor member weather and remarks',()=>{const logs=[log,{...log,id:'b',date:'2026-09-01',building:'102동',volume:20}];same(data.filterLogs(logs,{...data.emptyLogFilters(),from:'2026-08-01',to:'2026-08-31',building:'101동',floor:'1F',member:'슬라브',search:'특이사항'}).map(l=>l.id),['log-a']);assert.equal(data.filterLogs(logs,{...data.emptyLogFilters(),from:'2026-10-01',to:'2026-08-01'}).length,0);});
  await check('whole backup roundtrip preserves exact data and unrelated storage',()=>{storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));storage.setItem('cp_pouring_progress_v1:'+site.id,JSON.stringify({document:model.emptyProgress(),revision:2}));storage.setItem('cp_site_archive_v1:site-a:sample',JSON.stringify({version:1,key:'cp_site_archive_v1:site-a:sample',archivedAt:new Date().toISOString(),mode:'local',site,logs:[log],progressRaw:storage.getItem('cp_pouring_progress_v1:'+site.id)}));storage.setItem('unrelated','keep');const original=backup.parseBackup(JSON.stringify(backup.collectBackup(storage)));const other=memory();other.setItem('unrelated','keep');backup.restoreBackup(other,original,backup.collectBackup(other));same(backup.collectBackup(other).entries,original.entries);assert.equal(other.getItem('unrelated'),'keep');assert(other.getItem('cp_restore_recovery_v1'));});
  await check('legacy site archive files can be imported',()=>{const archive={version:1,site,logs:[log],mode:'local',archivedAt:new Date().toISOString(),progressRaw:null};const parsed=backup.parseBackup(JSON.stringify(archive));assert.equal(backup.backupCounts(parsed).logs,1);assert.throws(()=>backup.parseBackup(JSON.stringify({...archive,mode:'cloud'})),/DB/);});
  await check('invalid backup rejected without writes',()=>{const before=[...storage.entries];assert.throws(()=>backup.parseBackup('{'));assert.throws(()=>backup.parseBackup(JSON.stringify({format:'con1-backup',version:1,createdAt:'now',entries:[['unrelated','bad']]})));same([...storage.entries],before);});
  await check('changed preview blocks restore',()=>{const before=backup.collectBackup(storage);storage.setItem('cp_logs','[]');assert.throws(()=>backup.restoreBackup(storage,before,before),/미리보기/);});
  await check('corrupt source can be recovered while preserving the raw original',()=>{const other=memory();other.setItem('cp_sites','{broken');const before=backup.collectBackup(other,false),valid=backup.collectBackup(storage);backup.restoreBackup(other,valid,before);assert.equal(JSON.parse(other.getItem('cp_restore_recovery_v1')).entries.find(([k])=>k==='cp_sites')[1],'{broken');});
  await check('restore quota failure keeps source data and recovery copy',()=>{const before=backup.collectBackup(storage),other=memory();const expected=backup.collectBackup(other);const set=other.setItem.bind(other);other.setItem=(k,v)=>{if(k==='cp_logs')throw new Error('QuotaExceeded');set(k,v);};assert.throws(()=>backup.restoreBackup(other,before,expected),/QuotaExceeded/);same(backup.collectBackup(other).entries,expected.entries);assert(other.getItem('cp_restore_recovery_v1'));});
  for(const result of [{data:null,error:{message:'failure',code:'XX000'}},{data:null,error:null}])for(const action of ['insert','update','delete'])await check(`DB ${action} ${result.error?'error':'zero rows'} leaves screen unchanged`,async()=>{const h=appHarness(result),tree=h.render();if(action==='delete')await find(tree,'RecordTable').props.onDeleteLog(log.id);else await assert.rejects(()=>action==='update'?find(tree,'RecordTable').props.onQuickUpdateLog(log.id,{...log,floor:'2층'}):find(tree,'RecordTable').props.onQuickAddLog({...log,floor:'2층'}),result.error?/일지 저장에 실패.*\(오류 코드 XX000\)/:/^Error: 일지 저장에 실패[^(]*$/);same(h.states[2],[log]);});
  await check('DB site delete blocked by 타설현황 or photos says why and keeps the list',async()=>{const h=appHarness({data:null,error:{code:'23503',message:'violates foreign key constraint'}}),tree=h.render();await assert.rejects(find(tree,'SiteModal').props.onDeleteSite(site.id),/타설현황·사진이 남아 있는 현장은 DB에서 삭제할 수 없습니다.*\(오류 코드 23503\)/);same(h.states[0],[site]);same(h.states[2],[log]);});
  await check('a log insert past its deadline frees the screen, and pressing 추가 again reuses the id so only one row is kept',async()=>{
    const real=load('lib/request-timeout.ts',{},{AbortSignal,AbortController,setTimeout,clearTimeout}),inserted=[];let attempt=0;
    const supabase={from(table){const q={insert(row){q.row=row;inserted.push(row.id);return q;},select(){return q;},eq(){return q;},abortSignal(signal){q.signal=signal;return q;},
      single(){attempt++;return attempt===1?new Promise(resolve=>q.signal.addEventListener('abort',()=>resolve({data:null,error:{message:'AbortError'}}))):Promise.resolve({data:null,error:{code:'23505',message:'duplicate key'}});},
      maybeSingle:async()=>({data:{...log,...q.row,id:inserted[0]},error:null})};return q;}};
    const h=appHarness(null,false,{'@/lib/supabase':{supabase,checkSupabaseHealth:async()=>true},'@/lib/request-timeout':{...real,timed:(request,message)=>real.timed(request,message,30)}});
    const draft={...log,id:undefined,floor:'7F'};delete draft.id;
    await assert.rejects(find(h.render(),'RecordTable').props.onQuickAddLog(draft),new RegExp(real.WRITE_TIMEOUT_MESSAGE.slice(0,10)));
    same(h.states[2],[log]);
    await find(h.render(),'RecordTable').props.onQuickAddLog(draft);
    assert.equal(inserted.length,2);assert.equal(inserted[0],inserted[1]);assert.match(inserted[0],/^[0-9a-f-]{36}$/);
    assert.equal(h.states[2].length,2);assert.equal(h.states[2].filter(row=>row.id===inserted[0]).length,1);
  });
  await check('successful DB response commits saved row',async()=>{const h=appHarness({data:{...log,floor:'saved'},error:null}),tree=h.render();await find(tree,'RecordTable').props.onQuickUpdateLog(log.id,{...log,floor:'2층'});assert.equal(h.states[2][0].floor,'saved');});
  await check('saving a log records the outcome with its ID, 일자, 동·층 and 부위, never the values typed in',async()=>{
    storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));events.length=0;
    const h=appHarness(null,true);
    await find(h.render(),'RecordTable').props.onQuickAddLog({...data.newLog(site.id,'2'),date:'2026-11-05',building:'103동',floor:'5F',member_type:'슬라브',volume:4217.5,remicon_company:'성진'});
    const ok=events.find(e=>e.action==='일지 추가');assert.equal(ok.outcome,'ok');assert.equal(ok.page,'일지');assert.equal(ok.siteId,site.id);
    assert.match(ok.target,/^log-.+ · 2026-11-05 103동 5F 슬라브$/);assert(!JSON.stringify(ok).includes('성진'));assert(!JSON.stringify(ok).includes('4217.5'));
    events.length=0;
    await assert.rejects(find(h.render(),'RecordTable').props.onQuickAddLog({...data.newLog(site.id,'3'),date:'',building:'103동',floor:'5F'}));
    const failed=events.find(e=>e.action==='일지 추가');assert.equal(failed.outcome,'error');assert(failed.message);assert.match(failed.target,/^새 일지 · /);
  });
  await check('local submit failure leaves screen unchanged',async()=>{storage.entries.clear();storage.setItem('cp_sites','{broken');const h=appHarness(null,true),tree=h.render();await assert.rejects(()=>find(tree,'RecordTable').props.onQuickAddLog(log));same(h.states[2],[log]);assert.equal(storage.getItem('cp_sites'),'{broken');});
  await check('print scope uses the same filtered data as the table',()=>{const h=appHarness(null),second={...log,id:'b',date:'2026-09-01'};h.states[2]=[log,second];let tree=h.render();find(tree,'RecordTable').props.onFiltersChange({...data.emptyLogFilters(),from:'2026-09-01'});tree=h.render();find(tree,'RecordTable').props.onPrint();tree=h.render();same(find(tree,'PrintView').props.logs.map(l=>l.id),['b']);});
  await check('whole-site print scope remains available after filtering',()=>{const h=appHarness(null);h.states[2]=[log,{...log,id:'b',date:'2026-09-01'}];let tree=h.render();find(tree,'RecordTable').props.onFiltersChange({...data.emptyLogFilters(),from:'2026-09-01'});tree=h.render();find(tree,'RecordTable').props.onOutputScopeChange('all');tree=h.render();find(tree,'RecordTable').props.onPrint();assert.equal(find(h.render(),'PrintView').props.logs.length,2);});
  await check('actual initialization blocks corrupt data without an auto-save',async()=>{storage.entries.clear();storage.setItem('cp_sites','{broken');const h=appHarness(null,true);h.states[0]=[];h.states[1]='';h.states[2]=[];h.states[6]=true;h.states[8]=false;h.render();h.effects[0]();await new Promise(r=>setImmediate(r));h.render();h.effects[1]();assert.equal(storage.getItem('cp_sites'),'{broken');assert.equal(h.states[8],false);assert.match(h.states[7],/입력/);});
  await check('Excel export follows filtered or whole-site scope and keeps remarks',()=>{const h=appHarness(null);h.states[2]=[{...log,remarks:'특이 "기록"'},{...log,id:'b',building:'102동',date:'2026-09-01'}];let tree=h.render();find(tree,'RecordTable').props.onFiltersChange({...data.emptyLogFilters(),building:'101동'});tree=h.render();find(tree,'RecordTable').props.onExportExcel();assert(h.csv.includes('101동'));assert(!h.csv.includes('102동'));assert(h.csv.includes('특이 "기록"'));assert(h.csv.includes(' 콘크리트 타설·양생 일지</t>'));assert(/기간 \d\d\.\d\d\.\d\d\(.\) ~ \d\d\.\d\d\.\d\d\(.\) · 1건/.test(h.csv));assert(h.csv.includes('<f>SUBTOTAL(109,K4:K4)</f>'));find(tree,'RecordTable').props.onOutputScopeChange('all');tree=h.render();find(tree,'RecordTable').props.onExportExcel();assert(h.csv.includes('102동'));});
  await check('empty summary shows dashes without alert or success boxes',()=>{const h=uiHarness('components/SummaryCards.tsx','SummaryCards',{logs:[],site});const text=JSON.stringify(h.render());assert(!text.includes('확인 필요'));assert(!text.includes('경고 없음'));assert(text.includes('"-"'));});
  await check('automatic site codes avoid existing codes without changing them',()=>{const {nextSiteCode}=load('lib/site-code.ts');const existing=[{code:'a0001'},{code:' A0002 '},{code:'LEGACY'},{code:undefined}];const original=JSON.stringify(existing);assert.equal(nextSiteCode([]),'A0001');assert.equal(nextSiteCode(existing),'A0003');assert.equal(JSON.stringify(existing),original);assert.equal(nextSiteCode([{code:'A0001'},{code:'A0003'}]),'A0004');assert.equal(nextSiteCode([{code:'A9998'}]),'A9999');assert.equal(nextSiteCode([{code:'A9999'}]),'');assert.equal(nextSiteCode(Array.from({length:1000},(_,i)=>({code:`A${String(i+1).padStart(4,'0')}`}))),'A1001');});
  await check('site registration generates codes and reserves archived codes while preserving logs',async()=>{storage.entries.clear();const originalSite={...site,code:'A0001'};storage.setItem('cp_sites',JSON.stringify([originalSite]));storage.setItem('cp_logs',JSON.stringify([log]));const archived=load('lib/site-archive.ts').archiveSite(storage,{id:'archived-site',name:'보관 현장',code:'A0002'},[],'local');const archivedRaw=storage.getItem(archived.key);const h=appHarness(null,true);h.states[0]=[originalSite];await find(h.render(),'SiteModal').props.onAddSite('자동 등록 현장');assert.equal(h.states[0].find(s=>s.name==='자동 등록 현장').code,'A0003');same(h.states[0].find(s=>s.id===originalSite.id),originalSite);same(JSON.parse(storage.getItem('cp_logs')),[log]);await find(h.render(),'SiteModal').props.onAddSite('다음 현장');const added=h.states[0].find(s=>s.name==='다음 현장');assert.equal(added.code,'A0004');assert.equal(JSON.stringify(h.states[0].map(s=>s.name)),JSON.stringify(['검증 현장','다음 현장','자동 등록 현장']));assert.equal(storage.getItem(archived.key),archivedRaw);assert.equal(h.states[1],added.id);});
  await check('date sorting works both ways without rewriting stored categories',()=>{
    const rows=[{...log,id:'older',date:'2026-08-01',category:'49'},{...log,id:'newer',date:'2026-09-01',category:'49'}],before=JSON.stringify(rows);
    same(data.sortLogs(rows,{key:'date',direction:'desc'}).map(l=>l.id),['newer','older']);
    same(data.sortLogs(rows,{key:'date',direction:'asc'}).map(l=>l.id),['older','newer']);assert.equal(JSON.stringify(rows),before);
  });
  await check('numeric sorting handles strings zero negatives and missing values',()=>{
    const rows=[{...log,id:'ten',volume:'10',min_temp:10},{...log,id:'two',volume:'2',min_temp:2},{...log,id:'zero',volume:0,min_temp:0},{...log,id:'blank',volume:'',min_temp:null},{...log,id:'negative',volume:3,min_temp:-2}];
    same(data.sortLogs(rows,{key:'volume',direction:'asc'}).map(l=>l.id),['zero','two','negative','ten','blank']);
    same(data.sortLogs(rows,{key:'volume',direction:'desc'}).map(l=>l.id),['ten','negative','two','zero','blank']);
    same(data.sortLogs(rows,{key:'min_temp',direction:'asc'}).map(l=>l.id),['negative','zero','two','ten','blank']);
    same(data.sortLogs(rows,{key:'min_temp',direction:'desc'}).map(l=>l.id),['ten','two','zero','negative','blank']);
  });
  await check('text sorting uses natural numeric order and keeps equal rows stable',()=>{
    const rows=[{...log,id:'ten',building:'110동'},{...log,id:'two-a',building:'102동'},{...log,id:'one',building:'101동'},{...log,id:'two-b',building:'102동'}];
    same(data.sortLogs(rows,{key:'building',direction:'asc'}).map(l=>l.id),['one','two-a','two-b','ten']);
  });
  await check('sorting and filtering feed matching table print and sequential Excel output',()=>{
    const h=appHarness(null);const rows=[{...log,id:'ten',category:'49',volume:10},{...log,id:'two',category:'49',volume:2},{...log,id:'other',category:'1',building:'102동',volume:20}];h.states[2]=rows;const before=JSON.stringify(rows);
    let tree=h.render();find(tree,'RecordTable').props.onSortChange({key:'volume',direction:'asc'});tree=h.render();same(find(tree,'RecordTable').props.logs.map(l=>l.id),['two','ten','other']);
    find(tree,'RecordTable').props.onFiltersChange({...data.emptyLogFilters(),building:'101동'});tree=h.render();find(tree,'RecordTable').props.onExportExcel();
    same([...h.csv.matchAll(/<c r="A(\d+)" s="3"><v>(\d+)<\/v>/g)].map(m=>m[1]+':'+m[2]),['4:1','5:2']);assert(!h.csv.includes('102동'));
    find(tree,'RecordTable').props.onPrint();same(find(h.render(),'PrintView').props.logs.map(l=>l.id),['two','ten']);assert.equal(JSON.stringify(h.states[2]),before);
  });
  await check('display numbers ignore duplicate categories',()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    const rows=[{...log,id:'a',category:'49'},{...log,id:'b',category:'49'}];
    const table=uiHarness('components/RecordTable.tsx','RecordTable',{logs:rows,site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onSortChange(){},onFiltersChange(){},outputScope:'filtered',onOutputScopeChange(){}}).render();
    const body=find(table,'tbody');same(all(body,'tr').map(row=>all(row,'td')[0].props.children),['자동',1,2]);
    const print=uiHarness('components/PrintView.tsx','PrintView',{logs:rows,sites:[site],currentSite:site,onBack(){}}).render();same(all(find(print,'tbody'),'tr').slice(0,3).map(row=>all(row,'td')[0].props.children),[1,2,'']);
  });
  await check('volume cell adds ready-mix trucks at 6 m3 each, rounding a part load up',()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    const rows=[12,7,12.5,0,null].map((volume,i)=>({...log,id:'v'+i,volume}));
    const table=uiHarness('components/RecordTable.tsx','RecordTable',{logs:rows,site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onSortChange(){},onFiltersChange(){},outputScope:'filtered',onOutputScopeChange(){}}).render();
    same(all(find(table,'tbody'),'tr').slice(1).map(row=>all(row,'td')[10].props.children),['12 m³ (2대)','7 m³ (2대)','12.5 m³ (3대)','0 m³','-']);
  });
  await check('an empty weather cell shows - like the other empty cells, and a set one keeps its icon',()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    const rows=[{...log,id:'w1',weather:''},{...log,id:'w2',weather:'흐림'}];
    const table=uiHarness('components/RecordTable.tsx','RecordTable',{logs:rows,site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onSortChange(){},onFiltersChange(){},outputScope:'filtered',onOutputScopeChange(){}}).render();
    const cells=all(find(table,'tbody'),'tr').slice(1).map(row=>all(row,'td')[7].props.children);
    assert.equal(cells[0],'-');
    same(cells[1].props.children.map(c=>typeof c==='string'?c:c.type),['Cloud','흐림']);
  });
  // 타설일지 사진 was removed on 2026-11-06: the table has no photo column and deleting a log never touches the photo store.
  await check('the 타설일지 table has no photo column and each row ends with 관리',()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    const h=uiHarness('components/RecordTable.tsx','RecordTable',{logs:[{...log,id:'p1'}],site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onSortChange(){},onFiltersChange(){},outputScope:'filtered',onOutputScopeChange(){}});
    const table=h.render();
    assert(!JSON.stringify(find(table,'thead')).includes('사진'));
    assert.equal(all(find(table,'colgroup'),'col').length,14);
    const display=all(find(table,'tbody'),'tr').filter(row=>String(row.props.className).includes('record-display-row'));
    for(const row of [all(find(table,'tbody'),'tr')[0],display[0]])assert.equal(all(row,'td').length,14);
  });
  await check('deleting a log does not read or change photos',async()=>{
    const h=appHarness(null,true,{'@/lib/site-photos-cloud':{photoArchive:()=>undefined,pendingArchive:async()=>null,archiveDelay:()=>null,listPhotos:async()=>{throw new Error('photos must not be read');},markPhotosDeleted:async()=>{throw new Error('photos must not be changed');}}});
    storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));
    await find(h.render(),'RecordTable').props.onDeleteLog(log.id);
    same(JSON.parse(storage.getItem('cp_logs')),[]);
  });
  await check('the record card shows the logged temperature range without hot or cold alerts',()=>{
    const show=(min,max)=>JSON.stringify(uiHarness('components/SummaryCards.tsx','SummaryCards',{logs:[{...log,min_temp:min,max_temp:max}],site}).render());
    const both=show(-1,36);assert(both.includes('-1°C'));assert(both.includes('36°C'));assert(both.includes('기록 온도'));assert(both.includes('기록 -1~36°'));
    for(const text of [show(21,30),show(21,30.1),show(0,20),both])assert(!text.includes('확인 필요'));
  });
  await check('the weather card asks for an address, shows today and keeps the last values when a refresh fails',()=>{
    const text=(state,weatherArea)=>{const h=uiHarness('components/SummaryCards.tsx','SummaryCards',{logs:[log],site:{...site,weather_area:weatherArea}});if(state)h.states[0]=state;return JSON.stringify(h.render());};
    const banpo={code:'1165056000',label:'서울특별시 서초구 반포동',nx:60,ny:125};
    const none=text(null,null);assert(none.includes('현장 관리에서 현장 주소를 넣으면 표시됩니다.'));assert(none.includes('주소 미등록'));
    const unpicked=JSON.stringify(uiHarness('components/SummaryCards.tsx','SummaryCards',{logs:[log],site:{...site,address:'OO산업단지',weather_area:null}}).render());assert(unpicked.includes('⋯ › 주소 수정으로 기상 위치를 고르면 표시됩니다.'));assert(unpicked.includes('위치 선택 필요'));
    assert(text(null,banpo).includes('오늘 날씨를 불러오는 중입니다.'));
    const at=new Date(2026,10,5,14,30).getTime(),weather={date:'2026-11-05',temp:12.3,observedAt:'14:00',min:3,max:13,pop:60,rain:{hours:'15~17시',kind:'비',amount:'약 6mm'},popTomorrow:20,rainTomorrow:null};
    const shown=text({grid:'60,125',weather,at,error:''},banpo);
    for(const part of ['오늘 날씨 · 서초구 반포동','12.3°','3°','13°','(14:00 관측)','오늘 최저 / 최고 (예보)','현재 기온','예보 3~13°','기상특보 확인 중','오늘 강수확률','"60%"','today-weather-grid has-rain','today-weather-divider','today-weather-cell is-right','오늘 15~17시 비 예보 · 약 6mm','"children":"약 6mm"','내일 강수확률','"20%"','강수 60%','비 15~17시','내일 강수 20%'])assert(shown.includes(part),part);
    assert(!shown.includes('내일 null'));const dry=text({grid:'60,125',weather:{...weather,pop:null,rain:null,popTomorrow:null},at,error:''},banpo);assert(!dry.includes('강수'));assert(!dry.includes('today-weather-divider'));assert(!dry.includes('has-rain'));
    assert(shown.includes('{"className":"summary-compact-alert is-advisory","children":"강수 60%"}'));assert(shown.includes('{"className":"text-slate-400","children":"내일 강수 20%"}'));assert(shown.includes('today-weather-pop summary-compact-alert is-advisory'));assert(shown.includes('today-weather-pop text-slate-100'));
    const noAmount=text({grid:'60,125',weather:{...weather,rain:{hours:'15~17시',kind:'비',amount:''}},at,error:''},banpo);assert(noAmount.includes('"오늘 15~17시 비 예보"'));assert(!noAmount.includes(' · "'));
    const edge=text({grid:'60,125',weather:{...weather,pop:59,popTomorrow:60},at,error:''},banpo);assert(edge.includes('{"className":"text-slate-400","children":"강수 59%"}'));assert(edge.includes('{"className":"summary-compact-alert is-advisory","children":"내일 강수 60%"}'));
    assert(!shown.includes('오늘 예보'));assert(!shown.includes('현재 12.3°'));
    assert(!shown.includes('30분마다'));
    const stale=text({grid:'60,125',weather,at,error:'기상청 하루 호출 한도를 넘었습니다.'},banpo);assert(stale.includes('14:30 값 · 새로 불러오지 못해 이전 값을 보여 줍니다. 기상청 하루 호출 한도를 넘었습니다.'));assert(stale.includes('12.3°'));assert(stale.includes('14:30 값'));
    assert(text({grid:'60,125',weather:null,at:0,error:'기상청 연결 키가 아직 설정되지 않았습니다.'},banpo).includes('기상청 연결 키가 아직 설정되지 않았습니다.'));
    // Values of another site's grid are not shown while the new site loads.
    assert(text({grid:'89,90',weather,at,error:''},banpo).includes('오늘 날씨를 불러오는 중입니다.'));
  });
  await check('the weather card puts the site\'s 기상특보 on one line where the refresh note was, and the phone card names the first 특보',()=>{
    const banpo={code:'1165056000',label:'서울특별시 서초구 반포동',nx:60,ny:125};
    const text=(alerts)=>{const h=uiHarness('components/SummaryCards.tsx','SummaryCards',{logs:[log],site:{...site,weather_area:banpo}});h.states[0]={grid:'60,125',weather:{date:'2026-11-05',temp:-3,observedAt:'14:00',min:-9,max:1},at:0,error:''};h.states[1]=alerts;return JSON.stringify(h.render());};
    const data={issuedAt:'07:00',warnings:[{kind:'한파',level:'경보',zones:['서울동남권']},{kind:'건조',level:'주의보',zones:['서울']}],previews:[{kind:'강풍',when:'11/6 새벽(00시~06시)',zones:['서울']}]};
    const shown=text({code:'1165056000',data,error:''});
    for(const part of ['한파경보','서울동남권','건조주의보','강풍 예비특보','11/6 새벽(00시~06시) · 서울','기상청 07:00 발표','한파경보 외 1','is-warning','is-advisory','is-preview'])assert(shown.includes(part),part);
    assert(text({code:'1165056000',data:{issuedAt:'07:00',warnings:[],previews:[]},error:''}).includes('기상특보 없음 · 기상청 07:00 발표 기준'));
    assert(text({code:'1165056000',data,error:'기상청 서버가 응답하지 않습니다 (502).'}).includes('새로 불러오지 못해 이전 특보입니다'));
    assert(text({code:'1165056000',data:null,error:'기상청 연결 키가 아직 설정되지 않았습니다.'}).includes('기상청 연결 키가 아직 설정되지 않았습니다.'));
    // 특보 of another site's 위치 are not shown while the new site loads.
    assert(!text({code:'4113500000',data,error:''}).includes('한파경보'));
  });
  await check('site address and 기상 위치 save with the site in browser storage and DB, and an empty address clears both',async()=>{
    const banpo={code:'1165056000',label:'서울특별시 서초구 반포동',nx:60,ny:125};
    storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));
    const h=appHarness(null,true);
    await find(h.render(),'SiteModal').props.onSaveSiteAddress(site.id,'  서울 서초구 반포동 1-1 ',banpo);
    same(JSON.parse(storage.getItem('cp_sites')),[{...site,address:'서울 서초구 반포동 1-1',weather_area:banpo}]);same(h.states[0],[{...site,address:'서울 서초구 반포동 1-1',weather_area:banpo}]);
    await find(h.render(),'SiteModal').props.onSaveSiteAddress(site.id,'  ',banpo);
    same(JSON.parse(storage.getItem('cp_sites')),[{...site,address:'',weather_area:null}]);
    await find(h.render(),'SiteModal').props.onAddSite('주소 있는 현장','대구 수성구 범어동',null);
    const added=JSON.parse(storage.getItem('cp_sites')).find(s=>s.name==='주소 있는 현장');assert.equal(added.address,'대구 수성구 범어동');assert.equal(added.weather_area,null);
    same(JSON.parse(storage.getItem('cp_logs')),[log]);
    const failed=appHarness({data:null,error:{message:'column does not exist'}});
    await assert.rejects(find(failed.render(),'SiteModal').props.onSaveSiteAddress(site.id,'서울 서초구',banpo),/현장 주소 저장에 실패/);same(failed.states[0],[site]);
    const saved=appHarness({data:{id:site.id},error:null});await find(saved.render(),'SiteModal').props.onSaveSiteAddress(site.id,'서울 서초구 반포동',banpo);same(saved.states[0],[{...site,address:'서울 서초구 반포동',weather_area:banpo}]);
  });
  await check('a new site that sorts before the others does not block the next browser-storage save',async()=>{
    storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));
    const h=appHarness(null,true);
    await find(h.render(),'SiteModal').props.onAddSite('가나다 현장');
    assert.equal(h.states[0][0].name,'가나다 현장');assert.equal(JSON.parse(storage.getItem('cp_sites'))[0].name,'검증 현장');
    await find(h.render(),'SiteModal').props.onSaveSiteAddress(site.id,'대구 수성구',null);
    await find(h.render(),'SiteModal').props.onRenameSite(site.id,'검증 현장 2');
    same(JSON.parse(storage.getItem('cp_sites')).find(s=>s.id===site.id),{...site,name:'검증 현장 2',address:'대구 수성구',weather_area:null});
    // A real change made elsewhere is still caught.
    storage.setItem('cp_sites',JSON.stringify([...JSON.parse(storage.getItem('cp_sites')),{id:'other',name:'다른 화면 현장'}]));
    await assert.rejects(find(h.render(),'SiteModal').props.onSaveSiteAddress(site.id,'서울',null),/다른 화면에서 현장 또는 일지를 변경/);
  });
  await check('custom member names cannot collide with Object prototype in summary counts',()=>{
    const tree=uiHarness('components/SummaryCards.tsx','SummaryCards',{logs:[{...log,id:'a',member_type:'constructor'},{...log,id:'b',member_type:'constructor'}],site}).render();
    const all=(n,type)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(x=>all(x,type)):[...(n.type===type?[n]:[]),...all(n.props?.children,type)];
    assert(all(tree,'strong').some(n=>n.props.children===2));
  });
  await check('phone log sheet blocks missing fields, normalizes on save and keeps basics for the next entry',async()=>{
    const all=(n,type)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(x=>all(x,type)):[...(n.type===type?[n]:[]),...all(n.props?.children,type)];
    const added=[];const h=uiHarness('components/MobileLogSheet.tsx','MobileLogSheet',{log:null,logs:[log],site,onAdd:async d=>{added.push(d);},onUpdate:async()=>{throw new Error('no update');},onDelete(){},onClose(){}});
    const byId=(id)=>all(h.render(),'input').find(n=>n.props.id===id);
    const submit=()=>all(h.render(),'form')[0].props.onSubmit({preventDefault(){}});
    await submit();assert.equal(added.length,0);assert(JSON.stringify(h.render()).includes('동(구역)을 입력해주세요.'));
    byId('mobile-log-building').props.onChange({target:{value:'102동'}});byId('mobile-log-floor').props.onChange({target:{value:'3층'}});
    byId('mobile-log-strength').props.onChange({target:{value:'30'}});byId('mobile-log-volume').props.onChange({target:{value:'12.5'}});
    byId('mobile-log-min').props.onChange({target:{value:'-3'}});byId('mobile-log-remicon_company').props.onChange({target:{value:'아주'}});
    const next=all(h.render(),'button').find(n=>n.props.children==='이어서 입력');next.props.onClick();await new Promise(r=>setImmediate(r));
    assert.equal(added.length,1);const saved=added[0];
    assert.equal(saved.strength,'30MPa');assert.equal(saved.volume,12.5);assert.equal(saved.min_temp,-3);assert.equal(saved.max_temp,null);assert.equal(saved.site_id,site.id);assert.equal(saved.member_type,'슬라브');
    assert.equal(byId('mobile-log-building').props.value,'102동');assert.equal(byId('mobile-log-remicon_company').props.value,'아주');
    assert.equal(byId('mobile-log-strength').props.value,'');assert.equal(byId('mobile-log-volume').props.value,'');assert.equal(byId('mobile-log-min').props.value,'-3');
  });
  await check('phone log sheet edits the chosen log and rejects a non-numeric volume',async()=>{
    const all=(n,type)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(x=>all(x,type)):[...(n.type===type?[n]:[]),...all(n.props?.children,type)];
    const updates=[];const h=uiHarness('components/MobileLogSheet.tsx','MobileLogSheet',{log,logs:[log],site,onAdd:async()=>{throw new Error('no add');},onUpdate:async(id,d)=>{updates.push([id,d]);},onDelete(){},onClose(){}});
    const byId=(id)=>all(h.render(),'input').find(n=>n.props.id===id);
    const submit=()=>all(h.render(),'form')[0].props.onSubmit({preventDefault(){}});
    assert(JSON.stringify(h.render()).includes('일지 수정'));
    await submit();assert.equal(updates.length,0);
    byId('mobile-log-volume').props.onChange({target:{value:'12a'}});await submit();assert.equal(updates.length,0);assert(JSON.stringify(h.render()).includes('타설물량은 숫자로 입력해주세요.'));
    byId('mobile-log-volume').props.onChange({target:{value:'20'}});byId('mobile-log-floor').props.onChange({target:{value:'2층'}});await submit();
    assert.equal(updates.length,1);assert.equal(updates[0][0],log.id);assert.equal(updates[0][1].floor,'2층');assert.equal(updates[0][1].volume,20);assert.equal(updates[0][1].building,'101동');
  });
  await check('stage 수정 renames inside its own list row and Esc cancels',async()=>{
    const all=(node,pred)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,pred)):[...(pred(node)?[node]:[]),...all(node.props?.children,pred)];
    const one=(tree,pred)=>all(tree,pred)[0];
    const progressModel=load('lib/pouring-progress.ts'),doc={version:1,buildings:[{id:'b1',name:'101동',stages:progressModel.presetStages(3,1),records:{}}]};
    let saved=null;const props={document:doc,buildingId:'b1',stageId:'f2',disabled:false,adding:false,onAdding(){},onClose(){},onSelect(next,bid,sid){props.document=next;props.stageId=sid;},commit:async next=>{saved=next;return true;},canUndo:false,onUndo:async()=>{}};
    const h=uiHarness('components/ProgressStructure.tsx','ProgressStructure',props);
    one(h.render(),n=>n.props?.['aria-label']==='2F 수정').props.onClick();
    let tree=h.render();
    assert(!one(tree,n=>n.props?.className==='structure-form'));
    const row=one(tree,n=>n.props?.className==='structure-stage-row'&&n.props['aria-current']===true);
    const form=one(row,n=>n.type==='form');assert.equal(form.props.className,'structure-stage-edit');
    one(form,n=>n.type==='input').props.onChange({target:{value:'기준층'}});
    tree=h.render();await one(tree,n=>n.props?.className==='structure-stage-edit').props.onSubmit({preventDefault(){}});
    assert.equal(saved.buildings[0].stages.find(s=>s.id==='f2').name,'기준층');
    assert(!one(h.render(),n=>n.props?.className==='structure-stage-edit'));
    one(h.render(),n=>n.props?.['aria-label']==='3F 수정').props.onClick();saved=null;
    one(h.render(),n=>n.props?.className==='structure-stage-edit').props.onKeyDown({key:'Escape',preventDefault(){},nativeEvent:{isComposing:false}});
    assert(!one(h.render(),n=>n.props?.className==='structure-stage-edit'));assert.equal(saved,null);
  });
  await check('site rename saves the trimmed name, keeps the id and rejects failures and duplicates',async()=>{
    const ok=appHarness({data:{id:site.id},error:null});await find(ok.render(),'SiteModal').props.onRenameSite(site.id,'  새 현장명 ');
    assert.equal(JSON.stringify(ok.states[0]),JSON.stringify([{...site,name:'새 현장명'}]));
    const failed=appHarness({data:null,error:{message:'offline'}});
    await assert.rejects(find(failed.render(),'SiteModal').props.onRenameSite(site.id,'다른 이름'),/현장명 변경에 실패/);assert.deepEqual(failed.states[0],[site]);
    const dup=appHarness({data:{id:site.id},error:null});dup.states[0]=[site,{id:'site-b',name:'다른 현장'}];
    await assert.rejects(find(dup.render(),'SiteModal').props.onRenameSite(site.id,' 다른  현장 '),/같은 이름/);assert.equal(dup.states[0][0].name,site.name);
  });
  await check('site list 수정 edits the name in its own row and Esc cancels',async()=>{
    const all=(node,pred)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,pred)):[...(pred(node)?[node]:[]),...all(node.props?.children,pred)];
    const one=(tree,pred)=>all(tree,pred)[0];const renamed=[];const item=(tree,label)=>{const a=all(tree,n=>Array.isArray(n.props?.actions)).flatMap(n=>n.props.actions).find(x=>x[0]===label);return a&&{props:{onClick:a[2]}};};
    const props={isOpen:true,onClose(){},sites:[site],selectedSiteId:site.id,onSelectSite(){},onAddSite:async()=>{},onRenameSite:async(id,name)=>{renamed.push([id,name]);},onDeleteSite:async()=>{},archives:[],archiveError:'',canRestore:true,onRestoreSite:async()=>{}};
    const h=uiHarness('components/SiteModal.tsx','SiteModal',props);
    item(h.render(),site.name+' 현장명 수정').props.onClick();
    let form=one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row'));assert(form);
    one(form,n=>n.type==='input').props.onChange({target:{value:'바뀐 현장'}});
    form=one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row'));
    form.props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
    assert.deepEqual(renamed,[[site.id,'바뀐 현장']]);assert(!one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row')));
    item(h.render(),site.name+' 현장명 수정').props.onClick();
    let stopped=false;one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row')).props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){stopped=true;},nativeEvent:{isComposing:false}});
    assert(stopped);assert(!one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row')));assert.equal(renamed.length,1);
  });
  await check('a site row keeps 선택 on the row and puts 현장명 수정, 주소 and 종료 처리 behind ⋯',()=>{
    const all=(node,pred)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,pred)):[...(pred(node)?[node]:[]),...all(node.props?.children,pred)];
    const other={id:'site-b',name:'다른 현장',address:'대구 수성구'},picked=[];let closed=0;
    const props={isOpen:true,onClose(){closed++;},sites:[site,other],selectedSiteId:site.id,onSelectSite(id){picked.push(id);},onAddSite:async()=>{},onRenameSite:async()=>{},onSaveSiteAddress:async()=>{},onDeleteSite:async()=>{},onSetSiteStatus:async()=>{},archives:[],archiveError:'',canRestore:true,onRestoreSite:async()=>{}};
    const h=uiHarness('components/SiteModal.tsx','SiteModal',props),tree=h.render();
    const menus=all(tree,n=>Array.isArray(n.props?.actions));assert.equal(menus.length,2);
    same(menus.map(n=>n.props.actions.map(a=>a[1])),[['현장명 수정','주소 입력','종료 처리'],['현장명 수정','주소 수정','종료 처리']]);
    same(menus[1].props.actions.map(a=>a[0]),['다른 현장 현장명 수정','다른 현장 주소 수정','다른 현장 종료 처리']);
    assert(JSON.stringify(tree).includes('현재 현장'));assert(!all(tree,n=>n.props?.['aria-label']===site.name+' 선택').length);
    all(tree,n=>n.props?.['aria-label']==='다른 현장 선택')[0].props.onClick();same(picked,['site-b']);assert.equal(closed,1);
    menus[1].props.actions[1][2]();assert(all(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-address-row')).length===1);
  });
  await check('log floors save as B2F and 21F while other floor text is kept',async()=>{
    const {normalizeFloor,normalizePhotoFloor,normalizePhotoBuilding}=load('lib/floor.ts');
    for(const [input,expected] of [['101','101동'],[' 101 ','101동'],['101동','101동'],['a동','A동'],['A구역','A구역'],['101,102','101,102'],['1공구','1공구'],['','']])assert.equal(normalizePhotoBuilding(input),expected);
    for(const [input,expected] of [['35','35F'],[' 35 ','35F'],['6층','6F'],['3F','3F'],['3f','3F'],['b2','B2F'],['B2F','B2F'],['지하 1층','B1F'],['PH2','PH2'],['옥상','옥상'],['1~3층','1~3F'],['','']])assert.equal(normalizePhotoFloor(input),expected);
    for(const [input,expected] of [['지하 2층','B2F'],['지하2층','B2F'],['지하1F','B1F'],['B2층','B2F'],['21층','21F'],['21 층','21F'],['19층(옥상 파라펫)','19F(옥상 파라펫)'],['1~3층','1~3F'],['B1층~1F층','B1F~1F'],['3층, 5층','3F, 5F'],['PH2','PH2'],['옥상','옥상'],['B1F','B1F'],['15','15'],['','']])assert.equal(normalizeFloor(input),expected);
    const h=appHarness(null,true);storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site]));storage.setItem('cp_logs',JSON.stringify([log]));
    await find(h.render(),'RecordTable').props.onQuickAddLog({...data.newLog(site.id,'2'),date:'2026-08-02',building:'101동',floor:'지하 2층',member_type:'슬라브'});
    assert.equal(JSON.parse(storage.getItem('cp_logs')).find(l=>l.id!==log.id).floor,'B2F');
  });
  await check('site status is 진행 or 종료 with a 종료일 only while closed',()=>{
    data.validateSites([site,{id:'b',name:'진행',status:'active',closed_at:null},{id:'c',name:'종료',status:'closed',closed_at:'2026-10-15'}]);
    for(const bad of [{status:'closed'},{status:'closed',closed_at:'2026-13-01'},{status:'active',closed_at:'2026-10-15'},{status:'paused'}])assert.throws(()=>data.validateSites([{id:'x',name:'x',...bad}]),/진행·종료/);
    const archive=load('lib/site-archive.ts'),sites=[site,{id:'c',name:'종료 현장',status:'closed',closed_at:'2026-10-15'}];
    same(archive.pickerSites(sites,site.id).map(s=>s.id),[site.id]);same(archive.pickerSites(sites,'c').map(s=>s.id),[site.id,'c']);
  });
  await check('closing a site keeps its logs, hides it from the picker and makes it read-only until 다시 진행',async()=>{
    const other={id:'site-b',name:'다른 현장'};
    const h=appHarness(null,true);storage.entries.clear();storage.setItem('cp_sites',JSON.stringify([site,other]));storage.setItem('cp_logs',JSON.stringify([log]));h.states[0]=[site,other];
    await find(h.render(),'SiteModal').props.onSetSiteStatus(site.id,'2026-10-15');
    const stored=JSON.parse(storage.getItem('cp_sites')).find(s=>s.id===site.id);assert.equal(stored.status,'closed');assert.equal(stored.closed_at,'2026-10-15');
    same(JSON.parse(storage.getItem('cp_logs')),[log]);assert.equal(h.states[1],other.id);
    same(find(h.render(),'Header').props.sites.map(s=>s.id),[other.id]);
    h.states[1]=site.id;let tree=h.render();
    same(find(tree,'Header').props.sites.map(s=>s.id),[other.id,site.id]);assert.equal(find(tree,'RecordTable').props.readOnly,true);assert.equal(find(tree,'RecordTable').props.blocked,false);
    await assert.rejects(find(tree,'RecordTable').props.onQuickAddLog({...data.newLog(site.id,'2'),date:'2026-08-02',building:'101동',floor:'2F'}),/읽기 전용/);
    same(JSON.parse(storage.getItem('cp_logs')),[log]);
    await assert.rejects(find(tree,'SiteModal').props.onSetSiteStatus(site.id,'2026-13-40'),/종료일/);
    await find(tree,'SiteModal').props.onSetSiteStatus(site.id,null);
    const reopened=JSON.parse(storage.getItem('cp_sites')).find(s=>s.id===site.id);assert.equal(reopened.status,'active');assert.equal(reopened.closed_at,null);
    assert.equal(find(h.render(),'RecordTable').props.readOnly,false);
  });
  await check('현장 관리 tabs split 진행 and 종료, and 종료 처리 sends the chosen date',async()=>{
    const all=(node,pred)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,pred)):[...(pred(node)?[node]:[]),...all(node.props?.children,pred)];
    const item=(tree,label)=>{const a=all(tree,n=>Array.isArray(n.props?.actions)).flatMap(n=>n.props.actions).find(x=>x[0]===label);return a&&{props:{onClick:a[2]}};};
    const one=(tree,pred)=>all(tree,pred)[0],closedSite={id:'c',name:'종료 현장',status:'closed',closed_at:'2026-10-15'},calls=[];
    const props={isOpen:true,onClose(){},sites:[site,closedSite],selectedSiteId:site.id,onSelectSite(){},onAddSite:async()=>{},onRenameSite:async()=>{},onDeleteSite:async()=>{},onSetSiteStatus:async(id,date)=>{calls.push([id,date]);},archives:[],archiveError:'',canRestore:true,onRestoreSite:async()=>{}};
    const h=uiHarness('components/SiteModal.tsx','SiteModal',props);
    const label=n=>n.props?.['aria-label']||'';
    let tree=h.render();assert(item(tree,site.name+' 종료 처리'));assert(!one(tree,n=>label(n)===closedSite.name+' 다시 진행'));
    item(tree,site.name+' 종료 처리').props.onClick();
    const form=one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-close-row'));assert(form);
    one(form,n=>n.type==='ShortDateInput').props.onChange('2026-10-20');
    one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-close-row')).props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
    same(calls,[[site.id,'2026-10-20']]);
    one(h.render(),n=>n.props?.role==='tab'&&[].concat(n.props.children).includes('종료')).props.onClick();
    tree=h.render();assert(one(tree,n=>label(n)===closedSite.name+' 다시 진행'));assert(one(tree,n=>label(n)===closedSite.name+' 보기 (읽기 전용)'));assert(!item(tree,site.name+' 종료 처리'));
    one(tree,n=>label(n)===closedSite.name+' 다시 진행').props.onClick();await new Promise(r=>setImmediate(r));
    same(calls[1],['c',null]);
  });
  await check('popups put the action left and 취소 or the second choice right',()=>{
    const all=(node,pred)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,pred)):[...(pred(node)?[node]:[]),...all(node.props?.children,pred)];
    const text=node=>typeof node==='string'?node:!node||typeof node!=='object'?'':Array.isArray(node)?node.map(text).join(''):text(node.props?.children);
    for(const [entry,expected] of [[null,['저장','이어서 입력']],[log,['저장','취소']]]){
      const sheet=uiHarness('components/MobileLogSheet.tsx','MobileLogSheet',{log:entry,logs:[log],site,onAdd:async()=>{},onUpdate:async()=>{},onDelete(){},onClose(){}});
      same(all(all(sheet.render(),n=>n.type==='footer')[0],n=>n.type==='button').map(text),expected);
    }
    const progressModel=load('lib/pouring-progress.ts'),doc={version:1,buildings:[{id:'b1',name:'101동',stages:progressModel.presetStages(3,1),records:{}},{id:'b2',name:'102동',stages:progressModel.presetStages(3,1),records:{}}]};
    const h=uiHarness('components/ProgressStructure.tsx','ProgressStructure',{document:doc,buildingId:'b1',stageId:'f2',disabled:false,adding:false,onAdding(){},onClose(){},onSelect(){},commit:async()=>true,canUndo:false,onUndo:async()=>{}});
    all(h.render(),n=>n.type==='button'&&text(n)==='동 삭제')[0].props.onClick();
    const modal=all(h.render(),n=>n.type==='Modal')[0];
    same(all(modal,n=>n.type==='button').map(text),['삭제','취소']);
  });
  await check('a 동 이동 button tells the page which building was picked so 동·층 관리 can follow',()=>{
    const all=(n,type)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(x=>all(x,type)):[...(n.type===type?[n]:[]),...all(n.props?.children,type)];
    const picked=[],h=uiHarness('components/ProgressBuildingNav.tsx','ProgressBuildingNav',{wrapRef:{current:null},buildings:[{id:'b1',label:'101동',summary:''},{id:'b2',label:'102동',summary:''}],onPick:id=>picked.push(id)});
    h.render();h.states[0]={...h.states[0],overflow:true};
    all(h.render(),'button').find(b=>b.props.title==='102동').props.onClick();
    same(picked,['b2']);
  });
  await check('a mouse wheel notch glides when reduced motion is set, and touchpads, edges and normal settings are left alone',()=>{
    const run=(reduce)=>{
      let frames=[],now=0;
      const box={scrollTop:0,scrollHeight:1000,clientHeight:400,listener:null,addEventListener(type,fn,opts){assert.equal(type,'wheel');assert.equal(opts.passive,false);this.listener=fn;},removeEventListener(){this.listener=null;}};
      const {smoothWheel}=load('lib/smooth-wheel.ts',{},{window:{matchMedia:()=>({matches:reduce})},WheelEvent:{DOM_DELTA_PIXEL:0,DOM_DELTA_LINE:1,DOM_DELTA_PAGE:2},Element:class{},performance:{now:()=>now},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},getComputedStyle:()=>({overflowY:'visible'})});
      const cleanup=smoothWheel(box);
      const wheel=(deltaY,extra={})=>{const e={deltaY,deltaX:0,deltaMode:0,ctrlKey:false,shiftKey:false,defaultPrevented:false,target:null,prevented:false,preventDefault(){this.prevented=true;},...extra};box.listener(e);return e.prevented;};
      const flush=()=>{while(frames.length){const fn=frames.shift();now+=16;fn(now);}};
      return {box,wheel,flush,cleanup,get frames(){return frames;}};
    };
    const off=run(false);
    assert.equal(off.wheel(100),false);
    const on=run(true);
    assert.equal(on.wheel(10),false,'touchpad step stays native');
    assert.equal(on.wheel(100,{ctrlKey:true}),false,'ctrl+wheel zoom stays native');
    assert.equal(on.wheel(-100),false,'already at the top');
    assert.equal(on.wheel(100),true);
    assert.equal(on.box.scrollTop,0,'does not jump in the event itself');
    on.frames.shift()(1);
    assert.ok(on.box.scrollTop>=0&&on.box.scrollTop<100,'first frame is not past the target');
    on.wheel(100);on.flush();
    assert.equal(on.box.scrollTop,200,'two quick notches add up');
    on.wheel(1000);on.flush();
    assert.equal(on.box.scrollTop,600,'stops at the bottom');
    assert.equal(on.wheel(100),false,'already at the bottom');
    on.cleanup();assert.equal(on.box.listener,null);
  });
  console.log(`${count} upgrade checks passed; no network or real browser storage writes.`);
})().catch(error=>{console.error(error);process.exitCode=1;});


