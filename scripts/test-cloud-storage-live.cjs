// Explicit live verification: creates a named QA site; never edits existing sites.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
if(!process.argv.includes('--live'))throw Error('Pass --live to create isolated server test records.');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'../.env.local'),'utf8').split(/\r?\n/).filter(l=>/^NEXT_PUBLIC_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const client=require('@supabase/supabase-js').createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const cache={},values=new Map(),localPhotos=[];
const original=new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7X8AAAAASUVORK5CYII=','base64')],{type:'image/png'});
const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
function load(file){
 if(cache[file])return cache[file];const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require(id){if(id==='./supabase')return {supabase:client};if(id==='./site-photos')return {listPhotos:async()=>localPhotos,photoBlob:async()=>original};if(id.startsWith('.'))return load(path.posix.normalize(path.posix.join(path.posix.dirname(file),id))+'.ts');throw Error(id)},process:{env:{}},localStorage:storage,crypto:require('node:crypto').webcrypto,Blob,structuredClone,console});
 return cache[file]=module.exports;
}
(async()=>{
 const savedReport='C:/Users/user/Downloads/Codex작업/2026-10-22/c-app/output/cloud-live-report.json';
 const siteId=fs.existsSync(savedReport)?JSON.parse(fs.readFileSync(savedReport)).siteId:require('node:crypto').randomUUID();
 const {error}=await client.from('sites').upsert({id:siteId,name:'[Codex 검증] 클라우드 저장 '+siteId.slice(0,8),code:'QA'},{onConflict:'id',ignoreDuplicates:true});if(error)throw error;
 const report={siteId,photoIds:[],checks:[]};
 const save=()=>fs.writeFileSync('C:/Users/user/Downloads/Codex작업/2026-10-22/c-app/output/cloud-live-report.json',JSON.stringify(report,null,2));save();
 const model=load('lib/pouring-progress.ts'),progress=load('lib/progress-storage.ts'),photos=load('lib/site-photos-cloud.ts'),hash=load('lib/cloud-storage.ts').blobHash;
 const doc={version:1,buildings:[{id:'qa-building',name:'101동',stages:model.presetStages(2,1),records:{f1:{date:'2026-10-26',plannedDate:'2026-10-25',status:'done',color:'#FF0000',entries:[{id:'qa-area',member:'슬라브',zone:'A',volume:10,remarks:'보존 검증'}]}}}]};
 const reset=await client.from('pouring_progress').update({document:doc,revision:1}).eq('site_id',siteId);if(reset.error)throw reset.error;
 const raw=JSON.stringify({revision:3,document:doc});values.set('cp_pouring_progress_v1:'+siteId,raw);
 let snapshot=await progress.loadProgress(siteId,true);assert.equal(load('lib/cloud-storage.ts').canonical(snapshot.document),load('lib/cloud-storage.ts').canonical(doc));assert.equal(storage.getItem('cp_pouring_progress_v1:'+siteId),raw);
 const next=structuredClone(doc);next.buildings[0].records.f1.plannedDate='2026-10-24';await progress.saveProgress(siteId,snapshot,next);
 await assert.rejects(()=>progress.saveProgress(siteId,snapshot,doc));assert.equal((await progress.loadProgress(siteId,true)).document.buildings[0].records.f1.color,'#FF0000');report.checks.push('progress migration, unchanged local source, dates, color, areas, stale-write rejection');save();
 for(let i=0;i<2;i++){const photo={id:require('node:crypto').randomUUID(),siteId,date:'2026-10-26',building:'101동',floor:'5층',name:'cloud-verification.png',size:original.size,createdAt:Date.now()+i};localPhotos.push(photo);report.photoIds.push(photo.id);}save();
 let list=await photos.listPhotos(siteId);assert.equal(list.length,2);for(const p of list)assert.equal(await hash(await photos.photoBlob(p,true)),await hash(original));
 await photos.updatePhotoLocations(list,'102동','6층');list=await photos.listPhotos(siteId);assert.ok(list.every(p=>p.building==='102동'&&p.floor==='6층'));
 await photos.markPhotosDeleted(list,true);list=await photos.listPhotos(siteId);assert.ok(list.every(p=>p.deletedAt));assert.equal(list[0].deletionBatchId,list[1].deletionBatchId);
 await photos.markPhotosDeleted(list,false);list=await photos.listPhotos(siteId);assert.ok(list.every(p=>!p.deletedAt));for(const p of list)assert.equal(await hash(await photos.photoBlob(p,true)),await hash(original));
 assert.ok(localPhotos.every(p=>p.building==='101동'&&p.floor==='5층'&&!p.deletedAt));
 const {data:server}=await client.from('site_photos').select('*').eq('site_id',siteId);report.paths=server.flatMap(r=>[r.original_path,r.thumbnail_path]);
 const stale=structuredClone(list);await photos.updatePhotoLocation(list[1],'103동','7층');await assert.rejects(()=>photos.updatePhotoLocations(stale,'104동','8층'));
 list=await photos.listPhotos(siteId);assert.ok(list.some(p=>p.building==='102동'));assert.ok(list.every(p=>p.building!=='104동'));
 report.checks.push('photo migration, original SHA-256, batch edit/delete/undo, local originals unchanged, atomic stale-batch rollback');save();
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
