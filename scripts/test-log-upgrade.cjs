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
function appHarness(result, local = false) {
  const states = [], refs = []; let cursor=0, refCursor=0, effects=[], csv='';const navigation=[],alerts=[];
  states[0]=[site];states[1]=site.id;states[2]=[log];states[5]=!local;states[6]=false;states[7]='';states[8]=true;
  const react = {useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useEffect(effect){effects.push(effect);},useRef(value){const i=refCursor++;return refs[i] ||= {current:value};}};
  const jsx=(type,props)=>({type,props});
  const supabase={from(){const q={update(){return q;},insert(){return q;},delete(){return q;},eq(){return q;},select(){return q;},single:async()=>result,maybeSingle:async()=>result};return q;}};
  const deps = {react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/supabase':{supabase,checkSupabaseHealth:async()=>false},'@/lib/log-data':data,'@/lib/site-archive':load('lib/site-archive.ts'),'@/lib/pouring-progress':model,'./BackupManager':{BackupManager:'BackupManager'}};
  deps['@/lib/site-code']=load('lib/site-code.ts');
  deps['@/lib/cloud-log-data']={loadCloudLogData:async()=>({sites:[site],logs:[log]})};
  deps['@/lib/csv']=load('lib/csv.ts');
  deps['@/lib/watering']=load('lib/watering.ts');
  deps['@/lib/strength']=load('lib/strength.ts');
  deps['@/lib/floor']=load('lib/floor.ts');
  deps['@/lib/date-only']=load('lib/date-only.ts');
  for(const name of ['Header','SummaryCards','RecordTable','SiteModal','PrintView','PouringProgress','SitePhotos'])deps[`@/components/${name}`]={[name]:name};
  const app=load('components/ConcreteApp.tsx',deps,{confirm:()=>true,alert:message=>alerts.push(message),window:{location:{search:'',assign:url=>navigation.push(url)},addEventListener(){},removeEventListener(){}},URLSearchParams,setTimeout:()=>{},Blob:class{constructor(parts){csv=parts.join('');}},URL:{createObjectURL:()=> 'blob:test'},document:{createElement:()=>({setAttribute(){},click(){}}),body:{appendChild(){},removeChild(){}}}});
  return {states,navigation,alerts,get csv(){return csv;},get effects(){return effects;},render(){cursor=0;refCursor=0;effects=[];return app.ConcreteApp({initialView:arguments[0]||'logs'});}};
}
function uiHarness(file, name, props) {
  let cursor=0,refCursor=0,effects=[];const states=[],refs=[];
  const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect(fn){effects.push(fn);},useCallback(fn){return fn;},useRef(value){return refs[refCursor++] ||= {current:value};}};
  const jsx=(type,props)=>({type,props});
  const events=new Map();
  const exports=load(file,{react,'react/jsx-runtime':{jsx,jsxs:jsx},'./Modal':{Modal:'Modal'},'./WateringSelect':{WateringSelect:'WateringSelect'},'./MobileLogSheet':{MobileLogSheet:'MobileLogSheet'},'./ShortDateInput':{ShortDateInput:'ShortDateInput'},'@/lib/progress-structure':load('lib/progress-structure.ts'),'@/lib/site-archive':load('lib/site-archive.ts'),'@/lib/site-code':load('lib/site-code.ts'),'@/lib/date-only':load('lib/date-only.ts'),'@/lib/pouring-progress':load('lib/pouring-progress.ts'),'@/lib/watering':load('lib/watering.ts'),'@/lib/strength':load('lib/strength.ts'),'@/lib/log-data':data,'lucide-react':new Proxy({}, {get:(_,name)=>name})},{Node:TestNode,requestAnimationFrame:fn=>fn(),document:{querySelector:()=>null,addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:(type)=>events.delete(type)},window:{addEventListener(){},removeEventListener(){}}});
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
    find(h.render(),'Header').props.onExportExcel();assert(h.csv.includes('33MPa'));assert(!h.csv.includes('MPaMPa'));
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
  await check('active log editing blocks route and site changes, completion restores navigation',()=>{
    const h=appHarness(null);let tree=h.render();find(tree,'RecordTable').props.onWorkPending(true);
    find(tree,'Header').props.onOpenPhotos();assert.equal(h.navigation.length,0);assert.equal(h.alerts.length,1);
    find(tree,'Header').props.onSelectSite('other');assert.equal(h.states[1],site.id);
    find(tree,'RecordTable').props.onWorkPending(false);find(tree,'Header').props.onOpenPhotos();assert.equal(h.navigation[0],'/photos?site='+site.id);
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
    const api=load('components/SitePhotos.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/date-only':load('lib/date-only.ts'),'@/lib/cloud-storage':{cloudStorageEnabled:()=>false},'@/lib/site-photos-cloud':{latestDeletedBatch:()=>[],updatePhotoLocation:()=>new Promise((yes,no)=>{resolveSave=yes;rejectSave=no;})}});
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
    resolveSave();await new Promise(setImmediate);assert.equal(parent.states[18],true);
    resolveRefresh();await promise;
    render(api.SitePhotos,{site,onWorkPending:value=>pending=value},parent);parent.effects[parent.effects.length-1]();assert.equal(pending,false);
    render(node.type,props,editor).props.onClick();
    const failed=find(render(node.type,props,editor),'form').props.onSubmit({preventDefault(){}});
    rejectSave(new Error('offline'));await failed;
    const retained=render(node.type,props,editor);assert(find(retained,'form'));assert(JSON.stringify(retained).includes('offline'));assert.equal(parent.states[18],false);assert.equal(editor.states[1],'101동');
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
  for(const result of [{data:null,error:{message:'failure'}},{data:null,error:null}])for(const action of ['insert','update','delete'])await check(`DB ${action} ${result.error?'error':'zero rows'} leaves screen unchanged`,async()=>{const h=appHarness(result),tree=h.render();if(action==='delete')await find(tree,'RecordTable').props.onDeleteLog(log.id);else await assert.rejects(()=>action==='update'?find(tree,'RecordTable').props.onQuickUpdateLog(log.id,{...log,floor:'2층'}):find(tree,'RecordTable').props.onQuickAddLog({...log,floor:'2층'}));same(h.states[2],[log]);});
  await check('successful DB response commits saved row',async()=>{const h=appHarness({data:{...log,floor:'saved'},error:null}),tree=h.render();await find(tree,'RecordTable').props.onQuickUpdateLog(log.id,{...log,floor:'2층'});assert.equal(h.states[2][0].floor,'saved');});
  await check('local submit failure leaves screen unchanged',async()=>{storage.entries.clear();storage.setItem('cp_sites','{broken');const h=appHarness(null,true),tree=h.render();await assert.rejects(()=>find(tree,'RecordTable').props.onQuickAddLog(log));same(h.states[2],[log]);assert.equal(storage.getItem('cp_sites'),'{broken');});
  await check('print scope uses the same filtered data as the table',()=>{const h=appHarness(null),second={...log,id:'b',date:'2026-09-01'};h.states[2]=[log,second];let tree=h.render();find(tree,'RecordTable').props.onFiltersChange({...data.emptyLogFilters(),from:'2026-09-01'});tree=h.render();find(tree,'Header').props.onOpenPrintView();tree=h.render();same(find(tree,'PrintView').props.logs.map(l=>l.id),['b']);});
  await check('whole-site print scope remains available after filtering',()=>{const h=appHarness(null);h.states[2]=[log,{...log,id:'b',date:'2026-09-01'}];let tree=h.render();find(tree,'RecordTable').props.onFiltersChange({...data.emptyLogFilters(),from:'2026-09-01'});tree=h.render();find(tree,'RecordTable').props.onOutputScopeChange('all');tree=h.render();find(tree,'Header').props.onOpenPrintView();assert.equal(find(h.render(),'PrintView').props.logs.length,2);});
  await check('actual initialization blocks corrupt data without an auto-save',async()=>{storage.entries.clear();storage.setItem('cp_sites','{broken');const h=appHarness(null,true);h.states[0]=[];h.states[1]='';h.states[2]=[];h.states[6]=true;h.states[8]=false;h.render();h.effects[0]();await Promise.resolve();h.render();h.effects[1]();assert.equal(storage.getItem('cp_sites'),'{broken');assert.equal(h.states[8],false);assert.match(h.states[7],/입력/);});
  await check('CSV follows filtered or whole-site scope and quotes remarks',()=>{const h=appHarness(null);h.states[2]=[{...log,remarks:'특이 "기록"'},{...log,id:'b',building:'102동',date:'2026-09-01'}];let tree=h.render();find(tree,'RecordTable').props.onFiltersChange({...data.emptyLogFilters(),building:'101동'});tree=h.render();find(tree,'Header').props.onExportExcel();assert(h.csv.includes('101동'));assert(!h.csv.includes('102동'));assert(h.csv.includes('특이 ""기록""'));find(tree,'RecordTable').props.onOutputScopeChange('all');tree=h.render();find(tree,'Header').props.onExportExcel();assert(h.csv.includes('102동'));});
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
  await check('sorting and filtering feed matching table print and sequential CSV output',()=>{
    const h=appHarness(null);const rows=[{...log,id:'ten',category:'49',volume:10},{...log,id:'two',category:'49',volume:2},{...log,id:'other',category:'1',building:'102동',volume:20}];h.states[2]=rows;const before=JSON.stringify(rows);
    let tree=h.render();find(tree,'RecordTable').props.onSortChange({key:'volume',direction:'asc'});tree=h.render();same(find(tree,'RecordTable').props.logs.map(l=>l.id),['two','ten','other']);
    find(tree,'RecordTable').props.onFiltersChange({...data.emptyLogFilters(),building:'101동'});tree=h.render();find(tree,'Header').props.onExportExcel();
    const csv=h.csv.split('\n').slice(1).map(line=>line.split(',').slice(0,3));same(csv.map(row=>row[0]),['"1"','"2"']);assert(!h.csv.includes('102동'));
    find(tree,'Header').props.onOpenPrintView();same(find(h.render(),'PrintView').props.logs.map(l=>l.id),['two','ten']);assert.equal(JSON.stringify(h.states[2]),before);
  });
  await check('display numbers ignore duplicate categories',()=>{
    const all=(node,type)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(n=>all(n,type)):[...(node.type===type?[node]:[]),...all(node.props?.children,type)];
    const rows=[{...log,id:'a',category:'49'},{...log,id:'b',category:'49'}];
    const table=uiHarness('components/RecordTable.tsx','RecordTable',{logs:rows,site,filters:data.emptyLogFilters(),sort:data.defaultLogSort,onSortChange(){},onFiltersChange(){},outputScope:'filtered',onOutputScopeChange(){}}).render();
    const body=find(table,'tbody');same(all(body,'tr').map(row=>all(row,'td')[0].props.children),['자동',1,2]);
    const print=uiHarness('components/PrintView.tsx','PrintView',{logs:rows,sites:[site],currentSite:site,onBack(){}}).render();same(all(find(print,'tbody'),'tr').slice(0,3).map(row=>all(row,'td')[0].props.children),[1,2,'']);
  });
  await check('temperature card shows the range without hot or cold alerts',()=>{
    const show=(min,max)=>JSON.stringify(uiHarness('components/SummaryCards.tsx','SummaryCards',{logs:[{...log,min_temp:min,max_temp:max}],site}).render());
    const both=show(-1,36);assert(both.includes('-1°C'));assert(both.includes('36°C'));assert(both.includes('온도 범위'));
    for(const text of [show(21,30),show(21,30.1),show(0,20),both])assert(!text.includes('확인 필요'));
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
    const one=(tree,pred)=>all(tree,pred)[0];const renamed=[];
    const props={isOpen:true,onClose(){},sites:[site],selectedSiteId:site.id,onSelectSite(){},onAddSite:async()=>{},onRenameSite:async(id,name)=>{renamed.push([id,name]);},onDeleteSite:async()=>{},archives:[],archiveError:'',canRestore:true,onRestoreSite:async()=>{}};
    const h=uiHarness('components/SiteModal.tsx','SiteModal',props);
    one(h.render(),n=>n.props?.['aria-label']===site.name+' 현장명 수정').props.onClick();
    let form=one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row'));assert(form);
    one(form,n=>n.type==='input').props.onChange({target:{value:'바뀐 현장'}});
    form=one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row'));
    form.props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
    assert.deepEqual(renamed,[[site.id,'바뀐 현장']]);assert(!one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row')));
    one(h.render(),n=>n.props?.['aria-label']===site.name+' 현장명 수정').props.onClick();
    let stopped=false;one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row')).props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){stopped=true;},nativeEvent:{isComposing:false}});
    assert(stopped);assert(!one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-rename-row')));assert.equal(renamed.length,1);
  });
  await check('log floors save as B2F and 21F while other floor text is kept',async()=>{
    const {normalizeFloor}=load('lib/floor.ts');
    for(const [input,expected] of [['지하 2층','B2F'],['지하2층','B2F'],['지하1F','B1F'],['B2층','B2F'],['21층','21F'],['21 층','21F'],['19층(옥상 파라펫)','19F(옥상 파라펫)'],['1~3층','1~3F'],['PH2','PH2'],['옥상','옥상'],['B1F','B1F'],['15','15'],['','']])assert.equal(normalizeFloor(input),expected);
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
    const one=(tree,pred)=>all(tree,pred)[0],closedSite={id:'c',name:'종료 현장',status:'closed',closed_at:'2026-10-15'},calls=[];
    const props={isOpen:true,onClose(){},sites:[site,closedSite],selectedSiteId:site.id,onSelectSite(){},onAddSite:async()=>{},onRenameSite:async()=>{},onDeleteSite:async()=>{},onSetSiteStatus:async(id,date)=>{calls.push([id,date]);},archives:[],archiveError:'',canRestore:true,onRestoreSite:async()=>{}};
    const h=uiHarness('components/SiteModal.tsx','SiteModal',props);
    const label=n=>n.props?.['aria-label']||'';
    let tree=h.render();assert(one(tree,n=>label(n)===site.name+' 종료 처리'));assert(!one(tree,n=>label(n)===closedSite.name+' 다시 진행'));
    one(tree,n=>label(n)===site.name+' 종료 처리').props.onClick();
    const form=one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-close-row'));assert(form);
    one(form,n=>n.type==='ShortDateInput').props.onChange('2026-10-20');
    one(h.render(),n=>n.type==='form'&&String(n.props.className).includes('site-close-row')).props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
    same(calls,[[site.id,'2026-10-20']]);
    one(h.render(),n=>n.props?.role==='tab'&&[].concat(n.props.children).includes('종료')).props.onClick();
    tree=h.render();assert(one(tree,n=>label(n)===closedSite.name+' 다시 진행'));assert(one(tree,n=>label(n)===closedSite.name+' 보기 (읽기 전용)'));assert(!one(tree,n=>label(n)===site.name+' 종료 처리'));
    one(tree,n=>label(n)===closedSite.name+' 다시 진행').props.onClick();await new Promise(r=>setImmediate(r));
    same(calls[1],['c',null]);
  });
  console.log(`${count} upgrade checks passed; no network or real browser storage writes.`);
})().catch(error=>{console.error(error);process.exitCode=1;});


