'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Site } from '@/lib/types';
import { normalizePhotoBuilding, normalizePhotoFloor } from '@/lib/floor';
import { normalizeShortDate, shortDate } from '@/lib/date-only';
import { listPhotos, makePhotoThumbnail, markPhotosDeleted, latestDeletedBatch, photoBlob, photoPurgeLabel, archiveDelay, pendingArchive, PendingArchive, photoArchive, photoStorageUsage, savePhoto, storageUsageLabel, updatePhotoLocation, updatePhotoLocations, SitePhoto, StorageUsage } from '@/lib/site-photos-cloud';
import { cloudStorageEnabled } from '@/lib/cloud-storage';
import { describeError, logEvent, tracked } from '@/lib/event-log';
import { askConfirm } from './ConfirmDialog';

function today() {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
// Server mode only: whether the office PC has already moved this photo's original to its archive drive.
function archiveChip(photo: SitePhoto) {const a=photoArchive(photo);return a===undefined?null:<span className={`photo-archive ${a?'is-archived':'is-pending'}`}>{a?'원본 보관됨':'원본 서버에 있음'}</span>;}
// "11.07(토) 08:30" for the 원본 보관 지연 tooltip.
function uploadedAt(ms: number) {const d=new Date(ms),p=(n:number)=>String(n).padStart(2,'0');return `${d.getMonth()+1}.${p(d.getDate())}(${'일월화수목금토'[d.getDay()]}) ${p(d.getHours())}:${p(d.getMinutes())}`;}
function photoLocation(photo: SitePhoto) {const b=photo.building.trim(),f=photo.floor.trim();return `${/^\d+$/.test(b)?b+'동':b} · ${/^\d+$/.test(f)?f+'층':f}`;}
// Each photo is saved as its own file under its original name; a short gap keeps browsers from dropping the later ones.
// Returns the names that could not be saved.
async function downloadPhotoFiles(targets:SitePhoto[],onProgress:(index:number)=>void){
  const failed:string[]=[];
  for(let i=0;i<targets.length;i++){
    onProgress(i);
    try{const url=URL.createObjectURL(await photoBlob(targets[i],true)),a=document.createElement('a');a.href=url;a.download=targets[i].name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch{failed.push(targets[i].name);}
    if(i<targets.length-1)await new Promise(resolve=>setTimeout(resolve,400));
  }
  return failed;
}
export function PhotoImage({photo,original=false}:{photo:SitePhoto;original?:boolean}) {
  const [url,setUrl]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{let active=true,objectUrl='';setUrl('');setFailed(false);photoBlob(photo,original).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[photo.id,photo.siteId,original]);
  return failed?<span role="alert">사진을 불러오지 못했습니다.</span>:url?<img src={url} alt={photo.name} loading={original?'eager':'lazy'} decoding="async"/>:<span>불러오는 중…</span>;
}
function PhotoLocationEditor({photo,blocked,onSaved,onSaving}:{photo:SitePhoto;blocked:boolean;onSaved:()=>Promise<void>;onSaving:(saving:boolean)=>void}) {
  const [open,setOpen]=useState(false),[building,setBuilding]=useState(photo.building),[floor,setFloor]=useState(photo.floor),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const lock=useRef(false);
  async function submit(e:React.FormEvent) {e.preventDefault();if(lock.current||blocked)return;lock.current=true;setSaving(true);onSaving(true);setError('');try{await tracked({page:'사진',action:'사진 동·층 수정',siteId:photo.siteId,target:`${photo.id} · ${photo.date}`},()=>updatePhotoLocation(photo,building,floor));await onSaved();setOpen(false);}catch(e){setError(e instanceof Error?e.message:'수정하지 못했습니다. 입력은 유지됩니다.');}finally{lock.current=false;setSaving(false);onSaving(false);}}
  return open?<form className="photo-location-editor" onSubmit={submit}><label>동·구역<input aria-label="수정할 동·구역" autoFocus required value={building} disabled={saving} onChange={e=>setBuilding(e.target.value)}/></label><label>층<input aria-label="수정할 층" required value={floor} disabled={saving} onChange={e=>setFloor(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<div><button className="ui-button ui-primary" disabled={saving||blocked} type="submit">{saving?'저장 중':'저장'}</button><button className="ui-button" disabled={saving} type="button" onClick={()=>setOpen(false)}>취소</button></div></form>:<button className="ui-button photo-edit-location" disabled={blocked} onClick={()=>{setBuilding(photo.building);setFloor(photo.floor);setError('');setOpen(true);}}>동·층 수정</button>;
}
export function SitePhotos({site,blocked=false,onWorkPending}:{site:Site;blocked?:boolean;onWorkPending?:(pending:boolean)=>void}) {
  const [photos,setPhotos]=useState<SitePhoto[]>([]),[ready,setReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [date,setDate]=useState(()=>shortDate(today(),'.')),[building,setBuilding]=useState(''),[floor,setFloor]=useState('');
  const [month,setMonth]=useState(''),[filter,setFilter]=useState(''),[day,setDay]=useState(''),[over,setOver]=useState(false);
  const [selected,setSelected]=useState<string[]>([]),[bulkBuilding,setBulkBuilding]=useState(''),[bulkFloor,setBulkFloor]=useState(''),[bulkError,setBulkError]=useState('');
  const [viewId,setViewId]=useState(''),[zoom,setZoom]=useState(false);
  const [locationSaving,setLocationSaving]=useState(false),[downloading,setDownloading]=useState(false);
  const [usage,setUsage]=useState<StorageUsage|null>(null);
  // A missing 촬영일·동·층 (or adding while the store is not ready) is told under the fields, next to the field to fix.
  const [uploadError,setUploadError]=useState<{field:'date'|'building'|'floor'|'';text:string}|null>(null);
  // Originals of every site still waiting for the office PC; shown next to the title once the oldest waits over 2 days.
  const [archiveWait,setArchiveWait]=useState<PendingArchive|null>(null);
  const photoBusy=busy||locationSaving||downloading;
  const alive=useRef(true),lock=useRef(false),input=useRef<HTMLInputElement>(null),cameraInput=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDialogElement>(null),outsideDown=useRef(false);
  const fieldRefs={date:useRef<HTMLInputElement>(null),building:useRef<HTMLInputElement>(null),floor:useRef<HTMLInputElement>(null)};
  useEffect(()=>{alive.current=true;setBusy(true);setMessage(cloudStorageEnabled()?'서버 사진 확인 중입니다. 기존 브라우저 사진이 있으면 원본을 보존하며 이전합니다.':'사진을 불러오는 중입니다.');listPhotos(site.id).then(rows=>{if(alive.current){setPhotos(rows);setReady(true);setMessage('');}}).catch(e=>{const d=describeError(e);logEvent({page:'사진',action:'사진 불러오기',outcome:'error',siteId:site.id,message:d.message,code:d.code,detail:d.detail});if(alive.current)setMessage(e instanceof Error?e.message:'사진 저장소를 열지 못했습니다. 기존 자료는 유지됩니다.');}).finally(()=>{if(alive.current)setBusy(false);});return()=>{alive.current=false;};},[site.id]);
  useEffect(()=>{if(!photoBusy)return;const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[photoBusy]);
  useEffect(()=>{if(viewId&&!dialog.current?.open)dialog.current?.showModal();},[viewId]);
  // 저장 공간 of the shared photo storage: read on open and again whenever a photo is added (deletes only free space at the purge).
  // A failed read just leaves the figure off; it is not needed to work with photos.
  useEffect(()=>{let active=true;photoStorageUsage().then(u=>{if(active)setUsage(u);}).catch(()=>{if(active)setUsage(null);});return()=>{active=false;};},[photos.length]);
  useEffect(()=>{let active=true;pendingArchive().then(p=>{if(active)setArchiveWait(p);}).catch(()=>{if(active)setArchiveWait(null);});return()=>{active=false;};},[photos.length]);
  useEffect(()=>{onWorkPending?.(photoBusy);return()=>onWorkPending?.(false);},[photoBusy,onWorkPending]);
  // 타설 사진 (logId) belong to 타설일지 rows and stay off this page.
  const own=photos.filter(p=>!p.logId), live=own.filter(p=>!p.deletedAt), filtered=live.filter(p=>(!month||p.date.startsWith(month))&&(!filter||p.building===filter));
  const days=Array.from(new Set(filtered.map(p=>p.date))).sort().reverse();
  const dayPhotos=filtered.filter(p=>p.date===day).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
  const selectedPhotos=dayPhotos.filter(p=>selected.includes(p.id));
  const allDisplayedSelected=dayPhotos.length>0&&dayPhotos.every(p=>selected.includes(p.id));
  const viewIndex=dayPhotos.findIndex(p=>p.id===viewId),view=dayPhotos[viewIndex],viewArchive=view?photoArchive(view):undefined;
  const months=Array.from(new Set([month,today().slice(0,7),...live.map(p=>p.date.slice(0,7)),...Array.from({length:12},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;})])).filter(Boolean).sort().reverse();
  const deleted=latestDeletedBatch(own);
  const late=archiveDelay(archiveWait,Date.now());
  function uploadInputsValid() {
    const missing=!normalizeShortDate(date)?{field:'date' as const,text:'올바른 촬영일을 먼저 입력한 뒤 사진을 넣어주세요. (예: 26.11.06)'}
      :!building.trim()?{field:'building' as const,text:'동·구역을 먼저 입력한 뒤 사진을 넣어주세요.'}
      :!floor.trim()?{field:'floor' as const,text:'층을 먼저 입력한 뒤 사진을 넣어주세요.'}:null;
    setUploadError(missing);
    if(missing)fieldRefs[missing.field].current?.focus();
    return !missing;
  }
  const fieldError=(field:'date'|'building'|'floor')=>uploadError?.field===field?{'aria-invalid':true,'aria-describedby':'photo-upload-error'}:{};
  async function attach(files: File[]) {
    if(input.current)input.current.value='';
    if(cameraInput.current)cameraInput.current.value='';
    if(!files.length)return;
    if(lock.current||locationSaving||!ready||blocked){setUploadError({field:'',text:'사진 저장 준비가 끝나지 않았습니다. 잠시 뒤 다시 넣어주세요.'});return;}
    if(!uploadInputsValid()){logEvent({page:'사진',action:'사진 올리기',outcome:'warn',siteId:site.id,message:'촬영일·동·층 입력 확인에 막힘',target:`${files.length}장`});return;}
    const iso=normalizeShortDate(date)!;
    lock.current=true;setBusy(true);let saved=0;const errors:string[]=[];
    try {for(let i=0;i<files.length;i++) {
      if(!alive.current)break;
      setMessage(`${i+1} / ${files.length}장 처리 중`);
      try {const file=files[i],id=crypto.randomUUID(),place=`${iso} ${normalizePhotoBuilding(building)} ${normalizePhotoFloor(floor)}`;await tracked({page:'사진',action:'사진 올리기',siteId:site.id,target:`${id} · ${place} · ${Math.round(file.size/1024)}KB ${file.type||'형식 모름'} · ${i+1}/${files.length}`},async()=>{const thumbnail=await makePhotoThumbnail(file);const photo:SitePhoto={id,siteId:site.id,date:iso,building:normalizePhotoBuilding(building),floor:normalizePhotoFloor(floor),name:file.name,size:file.size,createdAt:Date.now()};await savePhoto(photo,file,thumbnail);saved++;if(alive.current)setPhotos(rows=>[...rows,photo]);});}
      catch(e){errors.push(`${files[i].name}: ${e instanceof Error?e.message:'저장 실패'}`);}
    }
    if(alive.current){setMonth(m=>m&&iso.slice(0,7));setFilter('');setDay(iso);setMessage(`${saved}장 저장 완료${errors.length?' · '+errors.join(' / '):''}`);}
    } finally {lock.current=false;if(alive.current){setBusy(false);if(input.current)input.current.value='';}}
  }
  async function remove(targets:SitePhoto[], deleting:boolean) {
    if(lock.current||locationSaving||blocked||!targets.length)return;
    if(deleting&&!await askConfirm({title:'사진 삭제',message:`선택한 사진 ${targets.length}장을 삭제하시겠습니까?\n${cloudStorageEnabled()?'삭제 후 2일 동안은 ‘최근 삭제 취소’로 한 번에 복원할 수 있고, 그 뒤에는 완전히 삭제됩니다.':'삭제 후 ‘최근 삭제 취소’로 한 번에 복원할 수 있습니다.'}`,confirmLabel:'삭제',danger:true}))return;
    if(lock.current)return;
    lock.current=true;setBusy(true);
    try{await tracked({page:'사진',action:deleting?'사진 삭제':'사진 삭제 취소',siteId:site.id,target:`${targets.length}장 · ${targets.slice(0,5).map(p=>p.id).join(',')}${targets.length>5?' …':''}`},()=>markPhotosDeleted(targets,deleting));const rows=await listPhotos(site.id);if(alive.current){setPhotos(rows);setSelected([]);setMessage(deleting?`${targets.length}장을 삭제했습니다. ${cloudStorageEnabled()?'2일 동안은 ':''}최근 삭제 취소로 한 번에 복원할 수 있습니다.`:`${targets.length}장을 복원했습니다.`);if(!deleting){setMonth(m=>m&&targets[0].date.slice(0,7));setFilter('');setDay(targets[0].date);}}}
    catch{if(alive.current)setMessage('처리하지 못했습니다. 다른 화면의 변경 여부를 확인하고 다시 시도해주세요.');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function saveSelected(e:React.FormEvent) {
    e.preventDefault();if(lock.current||locationSaving||blocked||!selectedPhotos.length)return;
    lock.current=true;setBusy(true);setBulkError('');
    try{await tracked({page:'사진',action:'사진 동·층 일괄 수정',siteId:site.id,target:`${selectedPhotos.length}장 → ${bulkBuilding.trim()} ${bulkFloor.trim()}`},()=>updatePhotoLocations(selectedPhotos,bulkBuilding,bulkFloor));const rows=await listPhotos(site.id);if(alive.current){setPhotos(rows);setSelected([]);setFilter('');setMessage(`${selectedPhotos.length}장의 동·층 정보를 수정했습니다.`);}}
    catch(e){if(alive.current)setBulkError(e instanceof Error?e.message:'수정하지 못했습니다. 선택과 입력은 유지됩니다.');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  function changeMonth(value:string){setSelected([]);setBulkError('');setMonth(value);setDay('');}
  function outside(e:React.PointerEvent<HTMLDialogElement>|React.MouseEvent<HTMLDialogElement>){const r=e.currentTarget.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
  async function download(){if(!view)return;if((await downloadPhotoFiles([view],()=>{})).length)setMessage('사진을 내려받지 못했습니다.');}
  async function downloadSelected(){
    const targets=selectedPhotos;if(!targets.length||lock.current)return;
    lock.current=true;setDownloading(true);
    try{const failed=await downloadPhotoFiles(targets,i=>setMessage(`${i+1} / ${targets.length}장 내려받는 중`));if(alive.current)setMessage(failed.length?`${targets.length-failed.length}장 받음 · 받지 못한 사진: ${failed.join(', ')}`:`${targets.length}장을 내려받았습니다.`);}
    finally{lock.current=false;if(alive.current)setDownloading(false);}
  }
  return <div className="site-photos">
    <section className="photo-panel photo-upload">
      <div><div className="photo-title-row"><h2 className="ui-page-title">알폼핀 체결 사진</h2>{late&&<span className="photo-archive-late" role="status" title={`가장 오래된 사진 ${uploadedAt(late.oldest)}에 올림. 보관은 매일 저녁 7시와 사무실 PC에 로그인할 때 실행됩니다.`}>원본 보관 {late.days}일째 밀림 · {late.count}장 대기<span className="photo-archive-late-hint"> · 사무실 PC·SSD 확인</span></span>}</div><p className="ui-note">{site.name} · 촬영일과 위치를 입력한 뒤 사진을 추가하세요. * 표시는 꼭 입력하세요.</p>
        <div className="photo-fields"><label><span>촬영일<span className="photo-required" aria-hidden="true">*</span></span><input ref={fieldRefs.date} aria-label="촬영일" aria-required="true" value={date} onChange={e=>{setDate(e.target.value);setUploadError(null);}} placeholder="26.10.26" disabled={photoBusy} {...fieldError('date')}/></label><label><span>동·구역<span className="photo-required" aria-hidden="true">*</span></span><input ref={fieldRefs.building} aria-label="동·구역" aria-required="true" value={building} onChange={e=>{setBuilding(e.target.value);setUploadError(null);}} placeholder="예: 101동" disabled={photoBusy} list="photo-buildings" {...fieldError('building')}/></label><label><span>층<span className="photo-required" aria-hidden="true">*</span></span><input ref={fieldRefs.floor} aria-label="층" aria-required="true" value={floor} onChange={e=>{setFloor(e.target.value);setUploadError(null);}} placeholder="예: 5F" disabled={photoBusy} {...fieldError('floor')}/></label></div>
        {uploadError&&<p id="photo-upload-error" className="photo-upload-error" role="alert">{uploadError.text}</p>}
        <datalist id="photo-buildings">{Array.from(new Set(live.map(p=>p.building))).map(b=><option key={b} value={b}/>)}</datalist>
      </div>
      <div className={`photo-drop ${over?'is-over':''}`} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);void attach(Array.from(e.dataTransfer.files));}}>
        <strong><span className="photo-drop-pointer">사진을 여기로 끌어다 놓으세요</span><span className="photo-drop-touch">사진을 찍거나 골라서 올리세요</span></strong><p className="ui-note">하루 장수 제한 없이 여러 장을 첨부할 수 있습니다.</p>
        <input ref={input} id="site-photo-files" className="photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photoBusy||!ready||blocked} onChange={e=>void attach(Array.from(e.target.files||[]))}/>
        <input ref={cameraInput} id="site-photo-camera" className="photo-file-input" type="file" accept="image/*" capture="environment" disabled={photoBusy||!ready||blocked} onChange={e=>void attach(Array.from(e.target.files||[]))}/>
        <div className="photo-upload-actions">
          <button type="button" className="ui-button ui-primary photo-camera-button" disabled={photoBusy||!ready||blocked} onClick={()=>{if(uploadInputsValid())cameraInput.current?.click();}}>사진 촬영</button>
          <button type="button" className="ui-button ui-primary" disabled={photoBusy||!ready||blocked} onClick={()=>{if(uploadInputsValid())input.current?.click();}}>사진 선택</button>
        </div><p className="ui-note">JPG · PNG · WebP / 한 장당 20MB 이하</p>
      </div>

      <p className="photo-status ui-note" role="status">{message||(cloudStorageEnabled()?'원본은 사무실 PC가 매일 저녁 7시와 켤 때 보관 폴더로 옮기고, 서버에는 2048px 사진을 남깁니다.':'사진은 이 브라우저에 저장됩니다. 기존 자료 백업에는 사진이 포함되지 않습니다.')}</p>
      {!ready&&!busy&&<button type="button" className="ui-button" onClick={()=>window.location.reload()}>다시 불러오기</button>}
    </section>
    <section className="photo-panel"><div className="photo-list-header"><div className="photo-list-summary"><div className="photo-heading"><h2 className="ui-section-title">등록한 사진 <span className="ui-note font-normal">{live.length}장</span></h2>{usage&&(()=>{const u=storageUsageLabel(usage.bytes);return <span className={`photo-storage is-${u.level}`} title="모든 현장 사진을 합친 값입니다. Supabase Free 요금제 저장소 한도 1GB 기준이며, 한도는 한 달 평균 사용량으로 계산됩니다."><span>{u.text}</span><span className="photo-storage-bar" aria-hidden="true"><i style={{width:`${u.percent}%`}}/></span><span>{u.percent}%</span></span>;})()}</div>
      {deleted.length>0&&<button className="ui-button" disabled={blocked||photoBusy} onClick={()=>void remove(deleted,false)}>최근 삭제 취소 ({deleted.length}장{cloudStorageEnabled()&&deleted[0].deletedAt?` · ${photoPurgeLabel(deleted[0].deletedAt)} 완전 삭제`:''})</button>}</div>
      <div className="photo-filters"><label>조회 월<select value={month} onChange={e=>changeMonth(e.target.value)}><option value="">전체 기간</option>{months.map(m=><option key={m} value={m}>{m.slice(2,4)}년 {Number(m.slice(5))}월</option>)}</select></label><label>동·구역<select value={filter} onChange={e=>{setFilter(e.target.value);setDay('');setSelected([]);}}><option value="">전체 동·구역</option>{Array.from(new Set(live.map(p=>p.building))).sort().map(b=><option key={b}>{b}</option>)}</select></label><span className="ui-note">{days.length}일 · {filtered.length}장</span></div></div>
      {!days.length&&<p className="ui-note">등록한 사진이 없습니다.</p>}{days.map(d=><React.Fragment key={d}><div className="photo-date-row"><strong>{shortDate(d,'.')}</strong><span>{Array.from(new Set(filtered.filter(p=>p.date===d).map(photoLocation))).join(' · ')}</span><span>{filtered.filter(p=>p.date===d).length}장</span><button className="ui-button" aria-label={`${shortDate(d,'.')} 사진 보기`} aria-expanded={day===d} onClick={()=>{setDay(day===d?'':d);setSelected([]);setBulkError('');}}>{day===d?'접기':'보기'}</button></div>{day===d&&<><form className="photo-bulk-tools" onSubmit={saveSelected}><div className="photo-bulk-selection"><strong>{selectedPhotos.length}장 선택</strong><button type="button" className="ui-button" disabled={photoBusy||blocked} aria-pressed={allDisplayedSelected} onClick={()=>setSelected(allDisplayedSelected?[]:dayPhotos.map(p=>p.id))}>모두 선택</button><button type="button" className="ui-button ui-primary" disabled={photoBusy||blocked||!selectedPhotos.length} onClick={()=>void downloadSelected()}>내려받기</button><button type="button" className="ui-button photo-delete" disabled={photoBusy||blocked||!selectedPhotos.length} onClick={()=>void remove(selectedPhotos,true)}>삭제</button></div>{selectedPhotos.length>0&&<><label>변경할 동·구역<input aria-label="일괄 수정할 동·구역" required value={bulkBuilding} disabled={photoBusy} onChange={e=>setBulkBuilding(e.target.value)} placeholder="예: 101동"/></label><label>변경할 층<input aria-label="일괄 수정할 층" required value={bulkFloor} disabled={photoBusy} onChange={e=>setBulkFloor(e.target.value)} placeholder="예: 5F"/></label><button type="submit" className="ui-button ui-primary" disabled={photoBusy||blocked}>{busy?'저장 중':'수정'}</button></>}{bulkError&&<p role="alert">{bulkError}</p>}<p className="photo-bulk-hint">사진마다 파일 하나씩 내려받습니다. 처음 한 번은 브라우저가 여러 파일 다운로드를 허용할지 물을 수 있습니다.</p></form><div className="photo-grid">{dayPhotos.map(p=><article className={`photo-card ${selected.includes(p.id)?'is-selected':''}`} key={p.id}><label className="photo-select"><input type="checkbox" aria-label={`${p.name} 선택`} checked={selected.includes(p.id)} disabled={photoBusy||blocked} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>선택</label><button className="photo-thumb" aria-label={`${p.name} 크게 보기`} onClick={()=>{setZoom(false);setViewId(p.id);}}><PhotoImage photo={p}/></button><div className="photo-info"><strong>{photoLocation(p)}</strong><p>{p.name}</p>{archiveChip(p)}<PhotoLocationEditor photo={p} blocked={blocked||photoBusy} onSaving={setLocationSaving} onSaved={async()=>{const rows=await listPhotos(site.id);if(alive.current){setPhotos(rows);setFilter('');setMessage('동·층 정보를 수정했습니다.');}}}/><div><button className="ui-button" onClick={()=>{setZoom(false);setViewId(p.id);}}>보기</button><button className="ui-button photo-delete" disabled={blocked||photoBusy} aria-label={`${p.name} 삭제`} onClick={()=>void remove([p],true)}>삭제</button></div></div></article>)}</div></>}</React.Fragment>)}
    </section>
    <dialog className="photo-viewer" aria-labelledby="photo-viewer-title" ref={dialog} onClose={()=>{setViewId('');setZoom(false);}} onPointerDown={e=>{outsideDown.current=e.button===0&&e.target===e.currentTarget&&outside(e);}} onPointerCancel={()=>{outsideDown.current=false;}} onClick={e=>{if(outsideDown.current&&e.target===e.currentTarget&&outside(e))dialog.current?.close();outsideDown.current=false;}}>
      {view&&<><div className="photo-viewer-heading"><div><h2 id="photo-viewer-title">{view.name}</h2><p>{shortDate(view.date,'.')} · {photoLocation(view)}</p>{viewArchive&&<p className="photo-archive-path">원본: {viewArchive.path}</p>}</div><button className="ui-button" autoFocus onClick={()=>dialog.current?.close()}>닫기</button></div><div className={`photo-well ${zoom?'is-zoom':''}`}><PhotoImage key={view.id} photo={view} original/></div><div className="photo-viewer-footer"><span>{viewIndex+1} / {dayPhotos.length}</span><div><button className="ui-button" disabled={viewIndex===0} onClick={()=>setViewId(dayPhotos[viewIndex-1].id)}>이전</button><button className="ui-button" disabled={viewIndex===dayPhotos.length-1} onClick={()=>setViewId(dayPhotos[viewIndex+1].id)}>다음</button><button className="ui-button" onClick={()=>setZoom(v=>!v)}>{zoom?'맞춤 보기':'확대'}</button><button className="ui-button" onClick={()=>void download()}>내려받기</button></div></div></>}
    </dialog>
  </div>;
}
