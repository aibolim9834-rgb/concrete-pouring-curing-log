'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Site } from '@/lib/types';
import { normalizeShortDate, shortDate } from '@/lib/date-only';
import { listPhotos, makePhotoThumbnail, markPhotosDeleted, latestDeletedBatch, photoBlob, savePhoto, updatePhotoLocation, updatePhotoLocations, SitePhoto } from '@/lib/site-photos-cloud';
import { cloudStorageEnabled } from '@/lib/cloud-storage';

function today() {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function photoLocation(photo: SitePhoto) {const b=photo.building.trim(),f=photo.floor.trim();return `${/^\d+$/.test(b)?b+'동':b} · ${/^\d+$/.test(f)?f+'층':f}`;}
function PhotoImage({photo,original=false}:{photo:SitePhoto;original?:boolean}) {
  const [url,setUrl]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{let active=true,objectUrl='';setUrl('');setFailed(false);photoBlob(photo,original).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[photo.id,photo.siteId,original]);
  return failed?<span role="alert">사진을 불러오지 못했습니다.</span>:url?<img src={url} alt={photo.name} loading={original?'eager':'lazy'} decoding="async"/>:<span>불러오는 중…</span>;
}
function PhotoLocationEditor({photo,blocked,onSaved,onSaving}:{photo:SitePhoto;blocked:boolean;onSaved:()=>Promise<void>;onSaving:(saving:boolean)=>void}) {
  const [open,setOpen]=useState(false),[building,setBuilding]=useState(photo.building),[floor,setFloor]=useState(photo.floor),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const lock=useRef(false);
  async function submit(e:React.FormEvent) {e.preventDefault();if(lock.current||blocked)return;lock.current=true;setSaving(true);onSaving(true);setError('');try{await updatePhotoLocation(photo,building,floor);await onSaved();setOpen(false);}catch(e){setError(e instanceof Error?e.message:'수정하지 못했습니다. 입력은 유지됩니다.');}finally{lock.current=false;setSaving(false);onSaving(false);}}
  return open?<form className="photo-location-editor" onSubmit={submit}><label>동·구역<input aria-label="수정할 동·구역" autoFocus required value={building} disabled={saving} onChange={e=>setBuilding(e.target.value)}/></label><label>층<input aria-label="수정할 층" required value={floor} disabled={saving} onChange={e=>setFloor(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<div><button className="ui-button ui-primary" disabled={saving||blocked} type="submit">{saving?'저장 중':'저장'}</button><button className="ui-button" disabled={saving} type="button" onClick={()=>setOpen(false)}>취소</button></div></form>:<button className="ui-button photo-edit-location" disabled={blocked} onClick={()=>{setBuilding(photo.building);setFloor(photo.floor);setError('');setOpen(true);}}>동·층 수정</button>;
}
export function SitePhotos({site,blocked=false,onWorkPending}:{site:Site;blocked?:boolean;onWorkPending?:(pending:boolean)=>void}) {
  const [photos,setPhotos]=useState<SitePhoto[]>([]),[ready,setReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [date,setDate]=useState(()=>shortDate(today(),'.')),[building,setBuilding]=useState(''),[floor,setFloor]=useState('');
  const [month,setMonth]=useState(()=>today().slice(0,7)),[filter,setFilter]=useState(''),[day,setDay]=useState(''),[limit,setLimit]=useState(20),[over,setOver]=useState(false);
  const [selected,setSelected]=useState<string[]>([]),[bulkBuilding,setBulkBuilding]=useState(''),[bulkFloor,setBulkFloor]=useState(''),[bulkError,setBulkError]=useState('');
  const [viewId,setViewId]=useState(''),[zoom,setZoom]=useState(false);
  const [locationSaving,setLocationSaving]=useState(false);
  const photoBusy=busy||locationSaving;
  const alive=useRef(true),lock=useRef(false),input=useRef<HTMLInputElement>(null),cameraInput=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDialogElement>(null),outsideDown=useRef(false);
  useEffect(()=>{alive.current=true;setBusy(true);setMessage(cloudStorageEnabled()?'서버 사진 확인 중입니다. 기존 브라우저 사진이 있으면 원본을 보존하며 이전합니다.':'사진을 불러오는 중입니다.');listPhotos(site.id).then(rows=>{if(alive.current){setPhotos(rows);setReady(true);setMessage('');}}).catch(e=>{if(alive.current)setMessage(e instanceof Error?e.message:'사진 저장소를 열지 못했습니다. 기존 자료는 유지됩니다.');}).finally(()=>{if(alive.current)setBusy(false);});return()=>{alive.current=false;};},[site.id]);
  useEffect(()=>{if(!photoBusy)return;const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[photoBusy]);
  useEffect(()=>{if(viewId&&!dialog.current?.open)dialog.current?.showModal();},[viewId]);
  useEffect(()=>{onWorkPending?.(photoBusy);return()=>onWorkPending?.(false);},[photoBusy,onWorkPending]);
  const live=photos.filter(p=>!p.deletedAt), filtered=live.filter(p=>p.date.startsWith(month)&&(!filter||p.building===filter));
  const days=Array.from(new Set(filtered.map(p=>p.date))).sort().reverse();
  const dayPhotos=filtered.filter(p=>p.date===day).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
  const selectedPhotos=dayPhotos.filter(p=>selected.includes(p.id));
  const allDisplayedSelected=dayPhotos.length>0&&dayPhotos.slice(0,limit).every(p=>selected.includes(p.id));
  const viewIndex=dayPhotos.findIndex(p=>p.id===viewId),view=dayPhotos[viewIndex];
  const months=Array.from(new Set([month,today().slice(0,7),...live.map(p=>p.date.slice(0,7)),...Array.from({length:12},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;})])).sort().reverse();
  const deleted=latestDeletedBatch(photos);
  function uploadInputsValid() {
    if(!normalizeShortDate(date)){alert('올바른 촬영일을 먼저 입력한 뒤 사진을 넣어주세요.');return false;}
    if(!building.trim()||!floor.trim()){alert('동·구역과 층을 먼저 입력한 뒤 사진을 넣어주세요.');return false;}
    return true;
  }
  async function attach(files: File[]) {
    if(input.current)input.current.value='';
    if(cameraInput.current)cameraInput.current.value='';
    if(!files.length)return;
    if(lock.current||locationSaving||!ready||blocked){alert('사진 저장 준비가 완료된 뒤 다시 첨부해주세요.');return;}
    if(!uploadInputsValid())return;
    const iso=normalizeShortDate(date)!;
    lock.current=true;setBusy(true);let saved=0;const errors:string[]=[];
    try {for(let i=0;i<files.length;i++) {
      if(!alive.current)break;
      setMessage(`${i+1} / ${files.length}장 처리 중`);
      try {const file=files[i],thumbnail=await makePhotoThumbnail(file);const photo:SitePhoto={id:crypto.randomUUID(),siteId:site.id,date:iso,building:building.trim().toUpperCase(),floor:floor.trim(),name:file.name,size:file.size,createdAt:Date.now()};await savePhoto(photo,file,thumbnail);saved++;if(alive.current)setPhotos(rows=>[...rows,photo]);}
      catch(e){errors.push(`${files[i].name}: ${e instanceof Error?e.message:'저장 실패'}`);}
    }
    if(alive.current){setMonth(iso.slice(0,7));setFilter('');setDay(iso);setLimit(20);setMessage(`${saved}장 저장 완료${errors.length?' · '+errors.join(' / '):''}`);}
    } finally {lock.current=false;if(alive.current){setBusy(false);if(input.current)input.current.value='';}}
  }
  async function remove(targets:SitePhoto[], deleting:boolean) {
    if(lock.current||locationSaving||blocked||!targets.length)return;
    if(deleting&&!confirm(`선택한 사진 ${targets.length}장을 삭제하시겠습니까?\n삭제 후 ‘최근 삭제 취소’로 한 번에 복원할 수 있습니다.`))return;
    lock.current=true;setBusy(true);
    try{await markPhotosDeleted(targets,deleting);const rows=await listPhotos(site.id);if(alive.current){setPhotos(rows);setSelected([]);setMessage(deleting?`${targets.length}장을 삭제했습니다. 최근 삭제 취소로 한 번에 복원할 수 있습니다.`:`${targets.length}장을 복원했습니다.`);if(!deleting){setMonth(targets[0].date.slice(0,7));setFilter('');setDay(targets[0].date);}}}
    catch{if(alive.current)setMessage('처리하지 못했습니다. 다른 화면의 변경 여부를 확인하고 다시 시도해주세요.');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function saveSelected(e:React.FormEvent) {
    e.preventDefault();if(lock.current||locationSaving||blocked||!selectedPhotos.length)return;
    lock.current=true;setBusy(true);setBulkError('');
    try{await updatePhotoLocations(selectedPhotos,bulkBuilding,bulkFloor);const rows=await listPhotos(site.id);if(alive.current){setPhotos(rows);setSelected([]);setFilter('');setMessage(`${selectedPhotos.length}장의 동·층 정보를 수정했습니다.`);}}
    catch(e){if(alive.current)setBulkError(e instanceof Error?e.message:'수정하지 못했습니다. 선택과 입력은 유지됩니다.');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  function changeMonth(value:string){setSelected([]);setBulkError('');setMonth(value);setDay('');setLimit(20);}
  function stepMonth(step:number){const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+step,1);changeMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  function outside(e:React.PointerEvent<HTMLDialogElement>|React.MouseEvent<HTMLDialogElement>){const r=e.currentTarget.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
  async function download(){if(!view)return;try{const url=URL.createObjectURL(await photoBlob(view,true)),a=document.createElement('a');a.href=url;a.download=view.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setMessage('원본 다운로드에 실패했습니다.');}}
  return <div className="site-photos">
    <section className="photo-panel photo-upload">
      <div><h2 className="ui-page-title">알폼핀 체결 사진</h2><p className="ui-note">{site.name} · 촬영일과 위치를 입력한 뒤 사진을 추가하세요.</p>
        <div className="photo-fields"><label>촬영일<input aria-label="촬영일" value={date} onChange={e=>setDate(e.target.value)} placeholder="26.10.26" disabled={photoBusy}/></label><label>동·구역<input aria-label="동·구역" value={building} onChange={e=>setBuilding(e.target.value)} placeholder="예: 101동" disabled={photoBusy} list="photo-buildings"/></label><label>층<input aria-label="층" value={floor} onChange={e=>setFloor(e.target.value)} placeholder="예: 5층" disabled={photoBusy}/></label></div>
        <datalist id="photo-buildings">{Array.from(new Set(live.map(p=>p.building))).map(b=><option key={b} value={b}/>)}</datalist>
      </div>
      <div className={`photo-drop ${over?'is-over':''}`} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);void attach(Array.from(e.dataTransfer.files));}}>
        <strong>사진을 여기로 끌어다 놓으세요</strong><p className="ui-note">하루 장수 제한 없이 여러 장을 첨부할 수 있습니다.</p>
        <input ref={input} id="site-photo-files" className="photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photoBusy||!ready||blocked} onChange={e=>void attach(Array.from(e.target.files||[]))}/>
        <input ref={cameraInput} id="site-photo-camera" className="photo-file-input" type="file" accept="image/*" capture="environment" disabled={photoBusy||!ready||blocked} onChange={e=>void attach(Array.from(e.target.files||[]))}/>
        <div className="photo-upload-actions">
          <button type="button" className="ui-button ui-primary photo-camera-button" disabled={photoBusy||!ready||blocked} onClick={()=>{if(uploadInputsValid())cameraInput.current?.click();}}>사진 촬영</button>
          <button type="button" className="ui-button ui-primary" disabled={photoBusy||!ready||blocked} onClick={()=>{if(uploadInputsValid())input.current?.click();}}>사진 선택</button>
        </div><p className="ui-note">JPG · PNG · WebP / 한 장당 20MB 이하</p>
      </div>

      <p className="photo-status ui-note" role="status">{message||(cloudStorageEnabled()?'Supabase 저장 · 기존 브라우저 원본은 유지됩니다.':'사진은 이 브라우저에 저장됩니다. 기존 자료 백업에는 사진이 포함되지 않습니다.')}</p>
      {!ready&&!busy&&<button type="button" className="ui-button" onClick={()=>window.location.reload()}>다시 불러오기</button>}
    </section>
    <section className="photo-panel"><div className="photo-list-header"><div className="photo-list-summary"><div className="photo-heading"><h2 className="ui-section-title">등록한 사진 <span className="ui-note font-normal">{live.length}장</span></h2></div>
      {deleted.length>0&&<button className="ui-button" disabled={blocked||photoBusy} onClick={()=>void remove(deleted,false)}>최근 삭제 취소 ({deleted.length}장)</button>}</div>
      <div className="photo-filters"><label>조회 월<select value={month} onChange={e=>changeMonth(e.target.value)}>{months.map(m=><option key={m} value={m}>{m.slice(2,4)}년 {Number(m.slice(5))}월</option>)}</select></label><label>동·구역<select value={filter} onChange={e=>{setFilter(e.target.value);setDay('');setSelected([]);}}><option value="">전체 동·구역</option>{Array.from(new Set(live.map(p=>p.building))).sort().map(b=><option key={b}>{b}</option>)}</select></label><button className="ui-button" onClick={()=>stepMonth(-1)}>이전 달</button><button className="ui-button" onClick={()=>stepMonth(1)}>다음 달</button><button className="ui-button" onClick={()=>{changeMonth(today().slice(0,7));setFilter('');}}>이번 달</button><span className="ui-note">{days.length}일 · {filtered.length}장</span></div></div>
      {!days.length&&<p className="ui-note">등록한 사진이 없습니다.</p>}{days.map(d=><React.Fragment key={d}><div className="photo-date-row"><strong>{shortDate(d,'.')}</strong><span>{Array.from(new Set(filtered.filter(p=>p.date===d).map(photoLocation))).join(' · ')}</span><span>{filtered.filter(p=>p.date===d).length}장</span><button className="ui-button" aria-label={`${shortDate(d,'.')} 사진 보기`} aria-expanded={day===d} onClick={()=>{setDay(day===d?'':d);setLimit(20);setSelected([]);setBulkError('');}}>{day===d?'접기':'보기'}</button></div>{day===d&&<><form className="photo-bulk-tools" onSubmit={saveSelected}><div className="photo-bulk-selection"><strong>{selectedPhotos.length}장 선택</strong><button type="button" className="ui-button" disabled={photoBusy||blocked} aria-pressed={allDisplayedSelected} onClick={()=>setSelected(allDisplayedSelected?[]:dayPhotos.slice(0,limit).map(p=>p.id))}>모두 선택</button><button type="button" className="ui-button photo-delete" disabled={photoBusy||blocked||!selectedPhotos.length} onClick={()=>void remove(selectedPhotos,true)}>선택한 {selectedPhotos.length}장 삭제</button></div>{selectedPhotos.length>0&&<><label>변경할 동·구역<input aria-label="일괄 수정할 동·구역" required value={bulkBuilding} disabled={photoBusy} onChange={e=>setBulkBuilding(e.target.value)} placeholder="예: 101동"/></label><label>변경할 층<input aria-label="일괄 수정할 층" required value={bulkFloor} disabled={photoBusy} onChange={e=>setBulkFloor(e.target.value)} placeholder="예: 5층"/></label><button type="submit" className="ui-button ui-primary" disabled={photoBusy||blocked}>{busy?'저장 중':`선택한 ${selectedPhotos.length}장 수정`}</button></>}{bulkError&&<p role="alert">{bulkError}</p>}</form><div className="photo-grid">{dayPhotos.slice(0,limit).map(p=><article className={`photo-card ${selected.includes(p.id)?'is-selected':''}`} key={p.id}><label className="photo-select"><input type="checkbox" aria-label={`${p.name} 선택`} checked={selected.includes(p.id)} disabled={photoBusy||blocked} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>선택</label><button className="photo-thumb" aria-label={`${p.name} 크게 보기`} onClick={()=>{setZoom(false);setViewId(p.id);}}><PhotoImage photo={p}/></button><div className="photo-info"><strong>{photoLocation(p)}</strong><p>{p.name}</p><PhotoLocationEditor photo={p} blocked={blocked||photoBusy} onSaving={setLocationSaving} onSaved={async()=>{const rows=await listPhotos(site.id);if(alive.current){setPhotos(rows);setFilter('');setMessage('동·층 정보를 수정했습니다.');}}}/><div><button className="ui-button" onClick={()=>{setZoom(false);setViewId(p.id);}}>보기</button><button className="ui-button photo-delete" disabled={blocked||photoBusy} aria-label={`${p.name} 삭제`} onClick={()=>void remove([p],true)}>삭제</button></div></div></article>)}</div><div className="photo-more"><span role="status">{Math.min(limit,dayPhotos.length)} / {dayPhotos.length}장 표시</span>{limit<dayPhotos.length&&<button className="ui-button ui-primary" onClick={()=>setLimit(n=>n+20)}>사진 {Math.min(20,dayPhotos.length-limit)}장 더 보기</button>}</div></>}</React.Fragment>)}
    </section>
    <dialog className="photo-viewer" aria-labelledby="photo-viewer-title" ref={dialog} onClose={()=>{setViewId('');setZoom(false);}} onPointerDown={e=>{outsideDown.current=e.button===0&&e.target===e.currentTarget&&outside(e);}} onPointerCancel={()=>{outsideDown.current=false;}} onClick={e=>{if(outsideDown.current&&e.target===e.currentTarget&&outside(e))dialog.current?.close();outsideDown.current=false;}}>
      {view&&<><div className="photo-viewer-heading"><div><h2 id="photo-viewer-title">{view.name}</h2><p>{shortDate(view.date,'.')} · {photoLocation(view)}</p></div><button className="ui-button" autoFocus onClick={()=>dialog.current?.close()}>닫기</button></div><div className={`photo-well ${zoom?'is-zoom':''}`}><PhotoImage key={view.id} photo={view} original/></div><div className="photo-viewer-footer"><span>{viewIndex+1} / {dayPhotos.length}</span><div><button className="ui-button" disabled={viewIndex===0} onClick={()=>setViewId(dayPhotos[viewIndex-1].id)}>이전</button><button className="ui-button" disabled={viewIndex===dayPhotos.length-1} onClick={()=>setViewId(dayPhotos[viewIndex+1].id)}>다음</button><button className="ui-button" onClick={()=>setZoom(v=>!v)}>{zoom?'맞춤 보기':'확대'}</button><button className="ui-button" onClick={()=>void download()}>원본 다운로드</button></div></div></>}
    </dialog>
  </div>;
}
