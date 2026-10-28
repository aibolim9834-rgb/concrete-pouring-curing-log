import * as local from './site-photos';
import { supabase } from './supabase';
import { blobHash, canonical, cloudStorageEnabled } from './cloud-storage';
import type { SitePhoto } from './site-photos';
export type { SitePhoto } from './site-photos';
export { makePhotoThumbnail, latestDeletedBatch } from './site-photos';

const bucket = () => supabase.storage.from('site-photos');
type PhotoRow = {id:string;site_id:string;metadata:SitePhoto;original_path:string;thumbnail_path:string;original_hash:string};
const rows = new Map<string,PhotoRow>();
const migrating = new Map<string,Promise<void>>();
async function serverRows(site:string):Promise<PhotoRow[]> {
 const result:PhotoRow[]=[],ids=new Set<string>();
 for(let start=0;;){
  const {data,error}=await supabase.from('site_photos').select('*').eq('site_id',site).order('id').range(start,start+499);
  if(error||!data)throw Error('사진 정보를 서버에서 불러오지 못했습니다. '+(error?.message||''));
  if(!data.length)break;
  for(const row of data){if(typeof row.id!=='string'||ids.has(row.id))throw Error('조회 중 서버 사진이 변경되었습니다. 새로고침해주세요.');ids.add(row.id);result.push(row);}
  start+=data.length;
 }
 result.forEach(row=>rows.set(row.id,row));return result;
}
async function download(path:string){
 const {data,error}=await bucket().download(path);
 if(error||!data)throw Error('서버 사진을 불러오지 못했습니다. '+(error?.message||''));
 return data;
}
async function uploadVerified(path:string,blob:Blob,hash:string){
 const {error}=await bucket().upload(path,blob,{upsert:false,contentType:blob.type});
 if(error && !['409','400'].includes(String(error.statusCode)))throw Error('사진 업로드 실패: '+error.message);
 // Verifies retries where the immutable object already exists too.
 if(await blobHash(await download(path))!==hash)throw Error('서버 사진과 원본이 일치하지 않습니다. 원본을 유지했습니다.');
}
async function cloudSave(photo:SitePhoto,original:Blob,thumbnail:Blob):Promise<void>{
 const hash=await blobHash(original),thumbHash=await blobHash(thumbnail);
 const {data:existing,error:readError}=await supabase.from('site_photos').select('*').eq('id',photo.id).maybeSingle();
 if(readError)throw Error(readError.message);
 if(existing){
  if(existing.site_id!==photo.siteId || existing.original_hash!==hash || canonical(existing.metadata)!==canonical(photo))throw Error('같은 사진 ID의 서버 정보가 다릅니다. 덮어쓰지 않았습니다.');
  if(await blobHash(await download(existing.original_path))!==hash)throw Error('서버 원본 검증에 실패했습니다.');
  rows.set(photo.id,existing);return;
 }
 const path=`${photo.siteId}/${photo.id}`;
 const row:PhotoRow={id:photo.id,site_id:photo.siteId,metadata:photo,original_path:`${path}/original-${hash}`,thumbnail_path:`${path}/thumbnail-${thumbHash}`,original_hash:hash};
 await uploadVerified(row.original_path,original,hash);
 await uploadVerified(row.thumbnail_path,thumbnail,thumbHash);
 const {error}=await supabase.from('site_photos').insert(row);
 if(error){if(error.code==='23505')return cloudSave(photo,original,thumbnail);throw Error('사진 정보 저장 실패: '+error.message);}
 rows.set(photo.id,row);
}
async function migrate(site:string){
 const source=await local.listPhotos(site),server=await serverRows(site),byId=new Map(server.map(r=>[r.id,r]));
 for(const photo of source){
  const key=`cp_photo_cloud_import:${photo.id}`,signature=canonical(photo),marker=localStorage.getItem(key),existing=byId.get(photo.id);
  if(marker && marker!==signature)throw Error('서버 이전 후 브라우저 사진 정보가 변경되었습니다. 양쪽 자료를 보존했습니다.');
  if(marker && existing)continue;
  await cloudSave(photo,await local.photoBlob(photo,true),await local.photoBlob(photo));
  localStorage.setItem(key,signature);
 }
}
export async function listPhotos(site:string){
 if(!cloudStorageEnabled())return local.listPhotos(site);
 let pending=migrating.get(site);
 if(!pending){pending=migrate(site);migrating.set(site,pending);pending.catch(()=>migrating.delete(site));}
 await pending;return (await serverRows(site)).map(r=>r.metadata);
}
export async function savePhoto(photo:SitePhoto,original:Blob,thumbnail:Blob){
 if(!cloudStorageEnabled())return local.savePhoto(photo,original,thumbnail);
 await cloudSave(photo,original,thumbnail);
}
export async function photoBlob(photo:SitePhoto,original=false){
 if(!cloudStorageEnabled())return local.photoBlob(photo,original);
 let row=rows.get(photo.id);
 if(!row){const {data,error}=await supabase.from('site_photos').select('*').eq('id',photo.id).eq('site_id',photo.siteId).single();if(error)throw Error(error.message);row=data as PhotoRow;rows.set(photo.id,row);}
 if(row.site_id!==photo.siteId)throw Error('사진 현장 정보가 일치하지 않습니다.');
 return download(original?row.original_path:row.thumbnail_path);
}
async function changePhotos(photos:SitePhoto[],transform:(photo:SitePhoto)=>SitePhoto){
 if(!photos.length||photos.length>1000||photos.some(p=>p.siteId!==photos[0].siteId))throw Error('같은 현장 사진을 1~1000장 선택해주세요.');
 const changes=photos.map(photo=>({id:photo.id,site_id:photo.siteId,expected:photo,next:transform(photo)}));
 const {error}=await supabase.rpc('update_site_photo_metadata',{changes});
 if(error)throw Error('사진 정보를 저장하지 못했습니다. 다른 화면에서 변경했는지 확인 후 새로고침해주세요. '+error.message);
 for(const c of changes){const row=rows.get(c.id);if(row)rows.set(c.id,{...row,metadata:c.next});}
}
export async function markPhotosDeleted(photos:SitePhoto[],deleted:boolean){
 if(!cloudStorageEnabled())return local.markPhotosDeleted(photos,deleted);
 const deletedAt=Date.now(),deletionBatchId=crypto.randomUUID();
 return changePhotos(photos,p=>{if(deleted?!!p.deletedAt:!p.deletedAt)throw Error('삭제 상태가 바뀌었습니다. 새로고침해주세요.');const next={...p};if(deleted){next.deletedAt=deletedAt;next.deletionBatchId=deletionBatchId;}else{delete next.deletedAt;delete next.deletionBatchId;}return next;});
}
export async function updatePhotoLocations(photos:SitePhoto[],building:string,floor:string){
 if(!cloudStorageEnabled())return local.updatePhotoLocations(photos,building,floor);
 building=building.trim().toUpperCase();floor=floor.trim();if(!building||!floor)throw Error('동·구역과 층을 모두 입력해주세요.');
 return changePhotos(photos,p=>{if(p.deletedAt)throw Error('삭제된 사진입니다.');return {...p,building,floor};});
}
export const updatePhotoLocation=(photo:SitePhoto,building:string,floor:string)=>updatePhotoLocations([photo],building,floor);
