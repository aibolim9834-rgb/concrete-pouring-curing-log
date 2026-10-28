// Read-only export of the Supabase data: never inserts, updates or deletes server records.
// Usage: npm run backup:cloud            -> tables only
//        npm run backup:cloud -- --photos -> tables plus photo originals and thumbnails
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'../.env.local'),'utf8').split(/\r?\n/).filter(l=>/^NEXT_PUBLIC_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim()];}));
if(!env.NEXT_PUBLIC_SUPABASE_URL||!env.NEXT_PUBLIC_SUPABASE_ANON_KEY)throw Error('.env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY가 필요합니다.');
const client=require('@supabase/supabase-js').createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const tables={sites:'id',pouring_logs:'id',pouring_progress:'site_id',site_photos:'id'};
const withPhotos=process.argv.includes('--photos');

async function readTable(name,key){
  const head=await client.from(name).select('*',{count:'exact',head:true});if(head.error)throw head.error;
  const rows=[];
  for(let start=0;;start+=500){
    const {data,error}=await client.from(name).select('*').order(key).range(start,start+499);if(error)throw error;
    rows.push(...data);if(data.length<500)break;
  }
  // A row added or removed mid-export would make the snapshot inconsistent, so stop instead of saving it.
  if(rows.length!==head.count)throw Error(`${name} 건수가 맞지 않습니다(서버 ${head.count}, 받은 ${rows.length}). 다시 실행해주세요.`);
  return rows;
}

(async()=>{
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15);
  const dir=path.join(__dirname,'../backups',`cloud-${stamp}`);
  const data={};for(const [name,key] of Object.entries(tables))data[name]=await readTable(name,key);
  let photos=0;
  if(withPhotos)for(const row of data.site_photos)for(const [file,hash] of [[row.original_path,row.original_hash],[row.thumbnail_path,null]]){
    const {data:blob,error}=await client.storage.from('site-photos').download(file);if(error)throw error;
    const bytes=Buffer.from(await blob.arrayBuffer());
    if(hash&&crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error(`사진 원본 해시가 다릅니다: ${file}`);
    const target=path.join(dir,'photos',...file.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);photos++;
  }
  const counts=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length]));
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'data.json'),JSON.stringify({format:'con1-cloud-backup',version:1,createdAt:new Date().toISOString(),project:new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,counts,photoFiles:photos,tables:data},null,2));
  console.log(`백업 완료: ${dir}`);
  console.log(Object.entries(counts).map(([k,v])=>`${k} ${v}건`).join(' · ')+(withPhotos?` · 사진 파일 ${photos}개`:' · 사진 파일 제외(--photos로 포함)'));
})().catch(error=>{console.error(error.message||error);process.exitCode=1;});
