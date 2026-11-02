// Actual modules, in-memory responses only. No credentials, network or user storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'..');
function load(file,deps={},globals={}) {
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require(id){if(id in deps)return deps[id];throw Error('Unexpected dependency '+id);},process:{env:{}},...globals});return module.exports;
}
const model=load('lib/pouring-progress.ts'),remicon=load('lib/remicon.ts'),report=load('lib/daily-report.ts',{'./remicon':remicon}),data=load('lib/log-data.ts',{'./pouring-progress':model,'./remicon':remicon,'./daily-report':report});
const logged=[],dbError=load('lib/db-error.ts',{},{console:{error:(...args)=>logged.push(args)}});
const requestTimeout=load('lib/request-timeout.ts',{},{AbortSignal,AbortController,setTimeout,clearTimeout});
// The same module with a 30 ms deadline, so stalled-request checks finish quickly.
const quickTimeout={...requestTimeout,timed:(request,message)=>requestTimeout.timed(request,message,30)};
const stalled=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));
// The Supabase module reads its mode through cloud-storage, so both see the same environment.
const loadSupabase=(client,env={})=>load('lib/supabase.ts',{'@supabase/supabase-js':client,'./cloud-storage':load('lib/cloud-storage.ts',{},{process:{env}}),'./db-error':dbError,'./request-timeout':requestTimeout},{process:{env}});
const site={id:'site-a',name:'검증 현장'};
const records=Array.from({length:1205},(_,i)=>({...data.newLog(site.id),id:'log-'+String(i).padStart(4,'0'),building:'101동',floor:'1층'}));
let count=0;
async function check(name,run){await run();console.log('PASS '+name);count++;}
function cloud({cap=500,fail=false,duplicate=false}={}){
 const requests=[];
 const supabase={from(table){const query={abortSignal(){return query;},select(){return query;},order(){return query;},async range(from,to){requests.push({table,from,to});if(fail&&table==='pouring_logs'&&from>0)return {error:{message:'offline'},data:null};const source=table==='sites'?[site]:records;return {error:null,data:duplicate&&table==='pouring_logs'&&from>0?[source[0]]:source.slice(from,Math.min(to+1,from+cap))};}};return query;}};
 return {requests,api:load('lib/cloud-log-data.ts',{'./supabase':{supabase},'./log-data':data,'./request-timeout':requestTimeout})};
}
(async()=>{
 await check('1205 logs load completely with stable IDs and no source mutation',async()=>{const before=JSON.stringify(records),c=cloud();const result=await c.api.loadCloudLogData();assert.equal(result.logs.length,1205);assert.equal(new Set(result.logs.map(r=>r.id)).size,1205);assert.equal(JSON.stringify(records),before);assert(c.requests.some(r=>r.from===1000));});
 await check('server cap below page size still loads every row',async()=>{const c=cloud({cap:73});assert.equal((await c.api.loadCloudLogData()).logs.length,1205);});
 await check('failed later page rejects entire load instead of returning partial records',async()=>{await assert.rejects(cloud({fail:true}).api.loadCloudLogData(),/DB/);});
 await check('shifting pages with duplicate IDs reject instead of silently dropping records',async()=>{await assert.rejects(cloud({duplicate:true}).api.loadCloudLogData(),/변경/);});
 await check('nullable legacy descriptions normalize without editing original responses',async()=>{const original=records[0].remicon_company;records[0].remicon_company=null;try{assert.equal((await cloud().api.loadCloudLogData()).logs[0].remicon_company,'');assert.equal(records[0].remicon_company,null);}finally{records[0].remicon_company=original;}});
 function photosCloud(fail=false){
  const source=records.map(r=>({id:r.id,metadata:{id:r.id,siteId:site.id,name:'original.png'}}));
  const supabase={from(){const q={abortSignal(){return q;},select(){return q;},eq(){return q;},order(){return q;},async range(start){if(fail&&start>0)return {data:null,error:{message:'offline'}};return {data:source.slice(start,start+73),error:null};}};return q;}};
  return load('lib/site-photos-cloud.ts',{'./site-photos':{listPhotos:async()=>[]},'./supabase':{supabase},'./cloud-storage':{cloudStorageEnabled:()=>true},'./request-timeout':requestTimeout});
 }
 await check('photo listing handles a lower server cap without omitting original metadata',async()=>{const photos=await photosCloud().listPhotos(site.id);assert.equal(photos.length,1205);assert.equal(new Set(photos.map(p=>p.id)).size,1205);assert.equal(photos[1204].name,'original.png');});
 await check('a deleted photo is purged at the first hourly run once two full days have passed',()=>{
  const {photoPurgeTime}=photosCloud(),at=iso=>photoPurgeTime(Date.parse(iso)).toISOString();
  assert.equal(at('2026-11-02T06:19:47Z'),'2026-11-04T07:00:00.000Z');
  assert.equal(at('2026-11-02T20:00:00Z'),'2026-11-04T20:00:00.000Z');
  assert.equal(at('2026-11-02T20:00:00.001Z'),'2026-11-04T21:00:00.000Z');
 });
 await check('photo listing rejects later-page errors instead of presenting a partial collection',async()=>{await assert.rejects(photosCloud(true).listPhotos(site.id),/사진 정보/);});
 for(const env of [{NEXT_PUBLIC_CON1_LOCAL_ONLY:'true'},{NEXT_PUBLIC_CON1_QA:'true'}]){
  await check('explicit isolated mode does not query Supabase '+Object.keys(env)[0],async()=>{let calls=0;const api=loadSupabase({createClient:()=>({from(){calls++;throw Error('network');}})},env);assert.equal(await api.checkSupabaseHealth(),false);assert.equal(calls,0);});
 }
 await check('cloud outage does not fall back to editable local data',async()=>{const query={select(){return query;},abortSignal(){return query;},limit:async()=>({error:{message:'offline'}})};const api=loadSupabase({createClient:()=>({from:()=>query})});await assert.rejects(api.checkSupabaseHealth(),/로컬 자료로 전환하지 않고/);});
 await check('cloud outage keeps the server error code and logs the original response',async()=>{const query={select(){return query;},abortSignal(){return query;},limit:async()=>({error:{message:'JWT expired',code:'PGRST301'}})};logged.length=0;await assert.rejects(loadSupabase({createClient:()=>({from:()=>query})}).checkSupabaseHealth(),/로컬 자료로 전환하지 않고.*\(오류 코드 PGRST301\)/);assert.equal(logged.length,1);});
 await check('DB errors keep the guidance, add the code only when one exists, and a missing row stays plain',()=>{logged.length=0;assert.equal(dbError.dbError('저장 실패',{code:'23503',message:'fk'}).message,'저장 실패 (오류 코드 23503)');assert.equal(dbError.dbError('저장 실패',new Error('network')).message,'저장 실패');assert.equal(dbError.dbError('저장 실패',null).message,'저장 실패');assert.equal(logged.length,2);});
 await check('a request past its deadline rejects with the timeout guidance, even when the client ignores the signal',async()=>{
  await assert.rejects(requestTimeout.timed(signal=>stalled(signal),'응답 없음',30),e=>e instanceof requestTimeout.RequestTimeoutError&&e.message==='응답 없음');
  await assert.rejects(requestTimeout.timed(()=>new Promise(()=>{}),'응답 없음',30),/응답 없음/);
  await assert.rejects(requestTimeout.timed(signal=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({data:null,error:{message:'AbortError'}}))),'응답 없음',30),/응답 없음/);
  const quick={data:[1],error:null};assert.equal(await requestTimeout.timed(async()=>quick,'응답 없음',30),quick);
 });
 await check('a stalled page fails the whole load with the read timeout instead of returning part of it',async()=>{
  const supabase={from(){const q={select(){return q;},order(){return q;},abortSignal(signal){q.signal=signal;return q;},range(){return stalled(q.signal);}};return q;}};
  const api=load('lib/cloud-log-data.ts',{'./supabase':{supabase},'./log-data':data,'./request-timeout':quickTimeout});
  await assert.rejects(api.loadCloudLogData(),new RegExp(requestTimeout.READ_TIMEOUT_MESSAGE.slice(0,12)));
 });
 await check('healthy cloud mode stays cloud',async()=>{const query={select(){return query;},abortSignal(){return query;},limit:async()=>({error:null})};const api=loadSupabase({createClient:()=>({from:()=>query})});assert.equal(await api.checkSupabaseHealth(),true);});
 await check('CSV formula text is exported as text; numbers, quotes and original input survive',()=>{
  const {csvCell}=load('lib/csv.ts');
  for(const value of ['=1+1','+SUM(A1)','-1+2','@SUM(A1)','  =1+1','＝1+1'])assert.equal(csvCell(value), '"\t'+value+'"');
  assert.equal(csvCell(-5),'"-5"');assert.equal(csvCell('가,나"다'),'"가,나""다"');assert.equal(csvCell('26.10.27'),'"26.10.27"');
 });
 console.log(count+' data safety checks passed; no network calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
