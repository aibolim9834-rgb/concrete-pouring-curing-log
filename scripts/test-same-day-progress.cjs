// Actual TS modules; no network and no user/browser data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const entries = new Map();
const storage = {get length(){return entries.size;},key(i){return [...entries.keys()][i]??null;},getItem(k){return entries.get(k)??null;},setItem(k,v){entries.set(k,v);},removeItem(k){entries.delete(k);}};
let networkCalls=0;
const cache={};
function load(file){
  if(cache[file])return cache[file];
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require(id){if(id==='./supabase')return {supabase:{from(){networkCalls++;throw new Error('No network permitted');}}};if(id.startsWith('.'))return load(path.posix.normalize(path.posix.join(path.posix.dirname(file),id))+'.ts');throw new Error(id);},localStorage:storage,process:{env:{NEXT_PUBLIC_PROGRESS_CLOUD:'true'}},crypto:require('node:crypto').webcrypto,TextEncoder,structuredClone});
  return cache[file]=module.exports;
}
const model=load('lib/pouring-progress.ts'), detail=load('lib/progress-entries.ts'), persistence=load('lib/progress-storage.ts'), backup=load('lib/progress-backup.ts'), appBackup=load('lib/app-backup.ts'), archive=load('lib/site-archive.ts');
const date='2026-10-23',color='#284654';
const draft=(zone,volume='10')=>({member:'슬라브',zone,volume,remarks:'비고, "확인"'});
const entry=(id,zone,volume='10')=>detail.entryFromDraft(draft(zone,volume),id);
const first=()=>detail.upsertProgressEntry(undefined,entry('e1','A구역'),date,color);
const doc=(record=first())=>({version:1,buildings:[{id:'building-a',name:'101동',stages:model.presetStages(3,1),records:{f1:record}}]});
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
let count=0;
async function check(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{
  await check('legacy v1 dates/colors remain valid with no entries',()=>{const r={date,status:'done',color};model.validateProgress(doc(r));assert.equal(r.entries,undefined);});
  await check('same-day areas share one date and automatically remain completed',()=>{const r=first(),next=detail.upsertProgressEntry(r,entry('e2','B구역','20'),date,color);assert.equal(next.date,date);assert.equal(next.entries.length,2);assert.equal(next.status,'done');assert.equal(next.entries[0].date,undefined);assert.equal(r.entries.length,1);});
  await check('different date cannot be appended to a populated stage',()=>{assert.throws(()=>detail.upsertProgressEntry(first(),entry('e2','B구역'),'2026-10-24',color),/공통 타설일/);});
  await check('empty date and non-calendar dates cannot create area records',()=>{for(const date of ['', '2026-02-30'])assert.throws(()=>detail.upsertProgressEntry(undefined,entry('e1','A구역'),date,color));});
  await check('edit replaces stable entry ID without duplicating or mutating source',()=>{const r=first(),next=detail.upsertProgressEntry(r,entry('e1','수정 구역','30'),date,color);assert.equal(next.entries.length,1);assert.equal(next.entries[0].zone,'수정 구역');assert.equal(r.entries[0].zone,'A구역');});
  await check('actual date sets completion and preserves area details',()=>{const r=first(),next=detail.updateProgressRecord(r,'2026-10-24','#543632');same(next.entries,r.entries);assert.equal(next.status,'done');assert.equal(next.date,'2026-10-24');assert.equal(next.color,'#543632');});
  await check('completed records allow area edits and deletion without reopening',()=>{const r={...first(),status:'done'},next=detail.upsertProgressEntry(r,entry('e2','B구역'),date,color),removed=detail.removeProgressEntry(next,'e1');assert.equal(next.status,'done');assert.equal(removed.status,'done');assert.equal(removed.date,date);assert.equal(removed.entries.length,1);assert.equal(removed.entries[0].id,'e2');assert.equal(r.entries.length,1);});
  await check('deleting one area preserves date color and other areas',()=>{const r=detail.upsertProgressEntry(first(),entry('e2','B구역'),date,color),next=detail.removeProgressEntry(r,'e1');assert.equal(next.entries.length,1);assert.equal(next.entries[0].id,'e2');assert.equal(next.date,date);assert.equal(next.color,color);assert.equal(r.entries.length,2);});
  await check('blank quantity remains null and zero is a valid quantity',()=>{assert.equal(entry('e1','A','').volume,null);assert.equal(entry('e1','A','0').volume,0);});
  await check('invalid measurements and required fields are rejected',()=>{for(const volume of ['-1','Infinity','abc'])assert.throws(()=>entry('e1','A',volume));assert.throws(()=>entry('e1','   '));assert.throws(()=>detail.entryFromDraft({...draft('A'),member:' '},'e1'));});
  await check('corrupt entries in backup reject rather than losing data',()=>{for(const entry of [{...first().entries[0],date:'2026-10-24'},{...first().entries[0],volume:-1},{...first().entries[0],id:'constructor'}])assert.throws(()=>model.validateProgress(doc({...first(),entries:[entry]})));assert.throws(()=>model.validateProgress(doc({...first(),entries:[...first().entries,...first().entries]})));assert.throws(()=>model.validateProgress(doc({date:'',status:'none',color,entries:first().entries})));});
  await check('entry count cap rejects without removing previous entries',()=>{const r=first();r.entries=Array.from({length:200},(_,i)=>entry('e'+i,'구역'+i));assert.throws(()=>detail.upsertProgressEntry(r,entry('overflow','추가'),date,color),/200/);assert.equal(r.entries.length,200);});
  await check('site IDs isolate areas and no cloud request occurs even when flag is enabled',async()=>{const a=await persistence.loadProgress('site-a',false),b=await persistence.loadProgress('site-b',false);await persistence.saveProgress('site-a',a,doc());same((await persistence.loadProgress('site-b',false)).document,b.document);assert.equal(networkCalls,0);});
  await check('reload preserves common date and areas, stale revision rejects',async()=>{const stale=await persistence.loadProgress('site-a',false);same(stale.document,doc());const next=doc(detail.upsertProgressEntry(first(),entry('e2','B'),date,color));await persistence.saveProgress('site-a',stale,next);await assert.rejects(()=>persistence.saveProgress('site-a',stale,doc()),/다른 탭/);});
  await check('silent local-storage write failure is not reported as success',async()=>{const state=await persistence.loadProgress('site-a',false),raw=storage.getItem('cp_pouring_progress_v1:site-a'),setter=storage.setItem;storage.setItem=()=>{};try{await assert.rejects(()=>persistence.saveProgress('site-a',state,doc()),/저장하지 못/);}finally{storage.setItem=setter;}assert.equal(storage.getItem('cp_pouring_progress_v1:site-a'),raw);});
  await check('per-site backup roundtrip includes every area and original fields',()=>{const d=doc(detail.upsertProgressEntry(first(),entry('e2','B'),date,color));same(backup.parseProgressBackup(backup.serializeProgressBackup('현장',d)).document,d);});
  await check('whole backup and site archive validation accept and preserve extended records',()=>{storage.setItem('cp_sites',JSON.stringify([{id:'site-a',name:'현장'}]));storage.setItem('cp_logs','[]');const raw=storage.getItem('cp_pouring_progress_v1:site-a');const b=appBackup.collectBackup(storage);appBackup.validateBackup(b);assert.equal(new Map(b.entries).get('cp_pouring_progress_v1:site-a'),raw);const a=archive.archiveSite(storage,{id:'site-a',name:'현장'},[],'local');assert.equal(a.progressRaw,raw);archive.validateArchive(a);});
  await check('CSV emits a row per area using the same date and quotes notes',()=>{const d=doc(detail.upsertProgressEntry(first(),entry('e2','B'),date,color)),csv=detail.progressCsv(d,'all',date);assert.equal(csv.split('\r\n').filter(l=>l.includes('"'+date+'"')).length,2);assert(csv.includes('"비고, ""확인"""'));assert(csv.includes('"A구역"'));assert(csv.includes('"B"'));});
  await check('CSV keeps the building filter and displays dates and areas beyond the basis date',()=>{const d=doc();d.buildings.push({id:'other',name:'102동',stages:model.presetStages(1,0),records:{f1:first()}});assert(!detail.progressCsv(d,'building-a',date).includes('102동'));const raw=JSON.stringify(d),csv=detail.progressCsv(d,'all','2026-10-22');assert(csv.includes('A구역'));assert(csv.includes('2026-10-23'));assert(!csv.includes('기준일 이후'));assert.equal(JSON.stringify(d),raw);});
  console.log(`${count} same-day checks passed; ${networkCalls} network calls.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
