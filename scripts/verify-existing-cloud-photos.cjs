const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const env=Object.fromEntries(fs.readFileSync(require('node:path').join(__dirname,'../.env.local'),'utf8').split(/\r?\n/).filter(l=>/^NEXT_PUBLIC_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const client=require('@supabase/supabase-js').createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const sites=[...new Set(manifest.metadata.map(p=>p.siteId))];
 let checked=0;
 for(const site of sites){
  const {data,error}=await client.from('site_photos').select('*').eq('site_id',site);if(error)throw error;
  for(const local of manifest.metadata.filter(p=>p.siteId===site)){
   const row=data.find(r=>r.id===local.id);assert.ok(row);assert.deepEqual(row.metadata,local);
   const {data:blob,error:downloadError}=await client.storage.from('site-photos').download(row.original_path);if(downloadError)throw downloadError;
   const hash=crypto.createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
   assert.equal(hash,manifest.originals.find(p=>p.id===local.id).hash);assert.equal(hash,row.original_hash);checked++;
  }
 }
 console.log(JSON.stringify({checked,visible:manifest.metadata.filter(p=>!p.deletedAt).length,deletedPreserved:manifest.metadata.filter(p=>p.deletedAt).length,metadataAndOriginalsMatch:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
