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
 function photosCloud(fail=false,usage={data:[{bytes:'108159008',files:'52'}],error:null},cloudOn=true){
  const source=records.map(r=>({id:r.id,metadata:{id:r.id,siteId:site.id,name:'original.png'}}));
  const supabase={rpc(name){assert.equal(name,'photo_storage_usage');const q={async abortSignal(){return usage;}};return q;},from(){const q={abortSignal(){return q;},select(){return q;},eq(){return q;},order(){return q;},async range(start){if(fail&&start>0)return {data:null,error:{message:'offline'}};return {data:source.slice(start,start+73),error:null};}};return q;}};
  return load('lib/site-photos-cloud.ts',{'./site-photos':{listPhotos:async()=>[]},'./supabase':{supabase},'./cloud-storage':{cloudStorageEnabled:()=>cloudOn},'./request-timeout':requestTimeout,'./floor':load('lib/floor.ts',{})});
 }
 await check('the photo storage total reads the shared bucket and is labelled against the 1GB plan limit',async()=>{
  const usage=await photosCloud().photoStorageUsage();assert.equal(usage.bytes,108159008);assert.equal(usage.files,52);
  const {storageUsageLabel}=photosCloud();
  const now=storageUsageLabel(108159008);assert.equal(now.text,'저장 공간 103MB / 1GB');assert.equal(now.percent,10);assert.equal(now.level,'ok');
  assert.equal(storageUsageLabel(5*1048576).text,'저장 공간 5.0MB / 1GB');
  assert.equal(storageUsageLabel(0.8*1024**3).level,'warn');assert.equal(storageUsageLabel(0.96*1024**3).level,'full');
  const over=storageUsageLabel(1.2*1024**3);assert.equal(over.text,'저장 공간 1.20GB / 1GB');assert.equal(over.percent,100);
  assert.equal(await photosCloud(false,undefined,false).photoStorageUsage(),null); // photos kept in this browser: no figure
  await assert.rejects(photosCloud(false,{data:null,error:{message:'permission denied'}}).photoStorageUsage(),/저장 공간을 불러오지 못했습니다/);
 });
 await check('photo listing handles a lower server cap without omitting original metadata',async()=>{const photos=await photosCloud().listPhotos(site.id);assert.equal(photos.length,1205);assert.equal(new Set(photos.map(p=>p.id)).size,1205);assert.equal(photos[1204].name,'original.png');});
 await check('a deleted photo is purged at the first hourly run once two full days have passed',()=>{
  const {photoPurgeTime}=photosCloud(),at=iso=>photoPurgeTime(Date.parse(iso)).toISOString();
  assert.equal(at('2026-11-02T06:19:47Z'),'2026-11-04T07:00:00.000Z');
  assert.equal(at('2026-11-02T20:00:00Z'),'2026-11-04T20:00:00.000Z');
  assert.equal(at('2026-11-02T20:00:00.001Z'),'2026-11-04T21:00:00.000Z');
 });
 await check('archived photos report where the original went, and a viewer opened before archiving reads the 2048px copy',async()=>{
  const sid=site.id,rows={a:{id:'a',site_id:sid,metadata:{id:'a',siteId:sid,name:'a.jpg'},original_path:`${sid}/a/original-1`,thumbnail_path:`${sid}/a/thumbnail-1`,original_hash:'1',archived_at:null,archive_name:null},
   b:{id:'b',site_id:sid,metadata:{id:'b',siteId:sid,name:'b.jpg'},original_path:`${sid}/b/reduced-2048-9`,thumbnail_path:`${sid}/b/thumbnail-2`,original_hash:'2',archived_at:'2026-11-09T10:00:00Z',archive_name:'D:\\이도형\\알폼핀 체결 사진\\현장\\2026-11-04\\101동 2F_b.jpg'}};
  const files=new Set([rows.a.original_path,rows.a.thumbnail_path,rows.b.original_path,rows.b.thumbnail_path]);
  const supabase={from(){let id;const q={select(){return q;},abortSignal(){return q;},order(){return q;},eq(k,v){if(k==='id')id=v;return q;},async range(start){return {data:start?[]:Object.values(rows).map(r=>({...r})),error:null};},async single(){return {data:{...rows[id]},error:null};}};return q;},
   storage:{from(){return {async download(path){return files.has(path)?{data:new Blob([path]),error:null}:{data:null,error:{message:'Object not found'}};}};}}};
  const api=load('lib/site-photos-cloud.ts',{'./site-photos':{listPhotos:async()=>[]},'./supabase':{supabase},'./cloud-storage':{cloudStorageEnabled:()=>true},'./request-timeout':requestTimeout,'./floor':load('lib/floor.ts',{})});
  const [a,b]=await api.listPhotos(sid);
  assert.equal(api.photoArchive(a),null);assert.equal(api.photoArchive(b).path,rows.b.archive_name);
  // The PC archives "a" while the page is open: its original file is gone and the row now points at the copy.
  files.delete(rows.a.original_path);rows.a={...rows.a,original_path:`${sid}/a/reduced-2048-7`,archived_at:'2026-11-09T10:05:00Z',archive_name:'D:\\x\\a.jpg'};files.add(rows.a.original_path);
  assert.equal(await (await api.photoBlob(a,true)).text(),rows.a.original_path);
  assert.equal(api.photoArchive(a).path,'D:\\x\\a.jpg');
  // A thumbnail that fails stays a failure; only the original re-reads the row.
  files.delete(rows.b.thumbnail_path);await assert.rejects(api.photoBlob(b),/서버 사진을 불러오지 못했습니다/);
  const browserOnly=load('lib/site-photos-cloud.ts',{'./site-photos':{listPhotos:async()=>[]},'./supabase':{supabase},'./cloud-storage':{cloudStorageEnabled:()=>false},'./request-timeout':requestTimeout,'./floor':load('lib/floor.ts',{})});
  assert.equal(browserOnly.photoArchive(a),undefined);
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
