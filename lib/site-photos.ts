export interface SitePhoto {
  id: string; siteId: string; date: string; building: string; floor: string;
  name: string; size: number; createdAt: number; deletedAt?: number; deletionBatchId?: string;
}
const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve,reject) => { r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
let connection: Promise<IDBDatabase> | undefined;
function database() {
  if (!connection) connection=new Promise<IDBDatabase>((resolve,reject)=>{
    const r=indexedDB.open('con1-site-photos-v1',1);
    r.onupgradeneeded=()=>{
      r.result.createObjectStore('metadata',{keyPath:'id'}).createIndex('siteId','siteId');
      r.result.createObjectStore('originals',{keyPath:'id'});
      r.result.createObjectStore('thumbnails',{keyPath:'id'});
    };
    r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=undefined;};resolve(r.result);};
    r.onerror=()=>{connection=undefined;reject(r.error);};
  });
  return connection;
}
export async function listPhotos(siteId: string) {
  const db=await database();
  return request<SitePhoto[]>(db.transaction('metadata').objectStore('metadata').index('siteId').getAll(siteId));
}
async function write(stores: string[], action: (tx: IDBTransaction)=>void) {
  const db=await database();
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);action(tx);});
}
export async function savePhoto(photo: SitePhoto, original: Blob, thumbnail: Blob) {
  if (!photo.siteId || !photo.id) throw Error('현장을 다시 선택해주세요.');
  await write(['metadata','originals','thumbnails'],tx=>{
    tx.objectStore('metadata').add(photo);
    tx.objectStore('originals').add({id:photo.id,siteId:photo.siteId,blob:original});
    tx.objectStore('thumbnails').add({id:photo.id,siteId:photo.siteId,blob:thumbnail});
  });
}
export async function photoBlob(photo: SitePhoto, original=false): Promise<Blob> {
  const db=await database(), store=original?'originals':'thumbnails';
  const row=await request(db.transaction(store).objectStore(store).get(photo.id));
  if (!row || row.siteId!==photo.siteId) throw Error('사진을 찾을 수 없습니다.');
  return row.blob;
}
export async function markPhotosDeleted(photos: SitePhoto[], deleted: boolean) {
  if(!photos.length||photos.some(p=>p.siteId!==photos[0].siteId))throw Error('같은 현장의 사진을 선택해주세요.');
  const deletionBatchId=crypto.randomUUID(),deletedAt=Date.now();
  await write(['metadata'],tx=>{
    const store=tx.objectStore('metadata');
    for(const photo of photos){const r=store.get(photo.id);
      r.onsuccess=()=>{
        const current:SitePhoto=r.result;
        if(!current||current.siteId!==photo.siteId||(deleted?!!current.deletedAt:!current.deletedAt||current.deletedAt!==photo.deletedAt||current.deletionBatchId!==photo.deletionBatchId)){tx.abort();return;}
        const next={...current};
        if(deleted){next.deletedAt=deletedAt;next.deletionBatchId=deletionBatchId;}
        else{delete next.deletedAt;delete next.deletionBatchId;}
        store.put(next);
      };
    }
  });
}
export function latestDeletedBatch(photos: SitePhoto[]) {
  const latest=photos.filter(p=>p.deletedAt).sort((a,b)=>b.deletedAt!-a.deletedAt!)[0];
  if(!latest)return [];
  return latest.deletionBatchId?photos.filter(p=>p.deletedAt&&p.siteId===latest.siteId&&p.deletionBatchId===latest.deletionBatchId):[latest];
}
export async function updatePhotoLocations(photos: SitePhoto[], building: string, floor: string) {
  building=building.trim();floor=floor.trim();
  if(!building||!floor)throw Error('동·구역과 층을 모두 입력해주세요.');
  if(!photos.length||photos.some(p=>p.siteId!==photos[0].siteId))throw Error('같은 현장의 사진을 선택해주세요.');
  await write(['metadata'],tx=>{
    const store=tx.objectStore('metadata');
    for(const photo of photos){const r=store.get(photo.id);
      r.onsuccess=()=>{const current=r.result;if(!current||current.siteId!==photo.siteId||current.deletedAt){tx.abort();return;}store.put({...current,building,floor});};
    }
  });
}
export async function makePhotoThumbnail(file: File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>20*1024*1024) throw Error('JPG·PNG·WebP, 한 장당 20MB 이하만 첨부할 수 있습니다.');
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height)), canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('미리보기 생성 실패')),'image/jpeg',.78));
  } finally {bitmap.close();}
}
