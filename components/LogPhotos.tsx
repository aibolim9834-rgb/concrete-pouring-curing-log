'use client';
import React, { useEffect, useRef, useState } from 'react';
import { PouringLog, Site } from '@/lib/types';
import { volumeText } from '@/lib/log-data';
import { latestDeletedBatch, makePhotoThumbnail, markPhotosDeleted, photoBlob, photoPurgeLabel, savePhoto, SitePhoto } from '@/lib/site-photos-cloud';
import { cloudStorageEnabled } from '@/lib/cloud-storage';
import { askConfirm } from './ConfirmDialog';
import { PhotoImage } from './SitePhotos';

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 타설 사진 for one 타설일지 row. photos are this row's photos, deleted ones included so the last deletion can be undone.
export function LogPhotos({ site, log, photos, loadError, readOnly, onChanged, onClose }: {
  site: Site; log: PouringLog; photos: SitePhoto[]; loadError: string; readOnly: boolean;
  onChanged: () => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), cameraInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false), alive = useRef(true), outsideDown = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [over, setOver] = useState(false);
  const [selected, setSelected] = useState<string[]>([]), [viewId, setViewId] = useState(''), [zoom, setZoom] = useState(false);
  useEffect(() => { alive.current = true; if (!dialog.current?.open) dialog.current?.showModal(); return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!busy) return;
    const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [busy]);

  const live = photos.filter(p => !p.deletedAt).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const deleted = latestDeletedBatch(photos);
  const picked = live.filter(p => selected.includes(p.id));
  const viewIndex = live.findIndex(p => p.id === viewId), view = live[viewIndex];
  const place = [log.date, log.building, log.floor, log.member_type, volumeText(log.volume)].filter(Boolean).join(' · ');

  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await task(); } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function attach(files: File[]) {
    if (input.current) input.current.value = '';
    if (cameraInput.current) cameraInput.current.value = '';
    if (!files.length || readOnly) return;
    void run(async () => {
      let saved = 0; const errors: string[] = [];
      for (let i = 0; i < files.length && alive.current; i++) {
        setMessage(`${i + 1} / ${files.length}장 올리는 중`);
        try {
          const file = files[i], thumbnail = await makePhotoThumbnail(file);
          await savePhoto({ id: crypto.randomUUID(), siteId: site.id, logId: log.id, date: log.date, building: log.building, floor: log.floor, name: file.name, size: file.size, createdAt: Date.now() }, file, thumbnail);
          saved++;
        } catch (e) { errors.push(`${files[i].name}: ${e instanceof Error ? e.message : '저장 실패'}`); }
      }
      await onChanged();
      if (alive.current) setMessage(`${saved}장 저장 완료${errors.length ? ' · ' + errors.join(' / ') : ''}`);
    });
  }
  // Each photo is its own download; a short gap keeps browsers from dropping the later ones.
  function download(targets: SitePhoto[]) {
    if (!targets.length) return;
    void run(async () => {
      const failed: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        setMessage(`${i + 1} / ${targets.length}장 내려받는 중`);
        try { saveBlob(await photoBlob(targets[i], true), targets[i].name); } catch { failed.push(targets[i].name); }
        if (i < targets.length - 1) await new Promise(resolve => setTimeout(resolve, 400));
      }
      if (alive.current) setMessage(failed.length ? `${targets.length - failed.length}장 받음 · 받지 못한 사진: ${failed.join(', ')}` : `${targets.length}장을 내려받았습니다.`);
    });
  }
  async function remove(targets: SitePhoto[], deleting: boolean) {
    if (lock.current || readOnly || !targets.length) return;
    if (deleting && !await askConfirm({ title: '사진 삭제', message: `선택한 사진 ${targets.length}장을 삭제하시겠습니까?\n${cloudStorageEnabled() ? '삭제 후 2일 동안은 ‘최근 삭제 취소’로 한 번에 복원할 수 있고, 그 뒤에는 완전히 삭제됩니다.' : '삭제 후 ‘최근 삭제 취소’로 한 번에 복원할 수 있습니다.'}`, confirmLabel: '삭제', danger: true })) return;
    await run(async () => {
      try {
        await markPhotosDeleted(targets, deleting);
        await onChanged();
        if (alive.current) { setSelected([]); setViewId(''); setMessage(deleting ? `${targets.length}장을 삭제했습니다.` : `${targets.length}장을 복원했습니다.`); }
      } catch { if (alive.current) setMessage('처리하지 못했습니다. 다른 화면의 변경 여부를 확인하고 다시 시도해주세요.'); }
    });
  }
  const outside = (e: React.PointerEvent<HTMLDialogElement> | React.MouseEvent<HTMLDialogElement>) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  const close = () => { if (!busy) dialog.current?.close(); };

  return <dialog ref={dialog} className="photo-viewer log-photo-dialog" aria-labelledby="log-photo-title"
    onCancel={e => { if (busy) e.preventDefault(); }} onClose={onClose}
    onPointerDown={e => { outsideDown.current = e.button === 0 && e.target === e.currentTarget && outside(e); }}
    onPointerCancel={() => { outsideDown.current = false; }}
    onClick={e => { if (outsideDown.current && e.target === e.currentTarget && outside(e)) close(); outsideDown.current = false; }}>
    <div className="photo-viewer-heading">
      <div><h2 id="log-photo-title">{view ? view.name : `타설 사진 · ${live.length}장`}</h2><p>{place}</p></div>
      <div className="log-photo-heading-actions">
        {view && <button type="button" className="ui-button" onClick={() => { setViewId(''); setZoom(false); }}>목록으로</button>}
        <button type="button" className="ui-button" autoFocus disabled={busy} onClick={close}>닫기</button>
      </div>
    </div>
    {view ? <>
      <div className={`photo-well ${zoom ? 'is-zoom' : ''}`}><PhotoImage key={view.id} photo={view} original /></div>
      <div className="photo-viewer-footer"><span>{viewIndex + 1} / {live.length}</span><div>
        <button type="button" className="ui-button" disabled={viewIndex === 0} onClick={() => setViewId(live[viewIndex - 1].id)}>이전</button>
        <button type="button" className="ui-button" disabled={viewIndex === live.length - 1} onClick={() => setViewId(live[viewIndex + 1].id)}>다음</button>
        <button type="button" className="ui-button" onClick={() => setZoom(v => !v)}>{zoom ? '맞춤 보기' : '확대'}</button>
        <button type="button" className="ui-button" disabled={busy} onClick={() => download([view])}>원본 받기</button>
      </div></div>
    </> : <div className="log-photo-body">
      {!readOnly && <div className={`log-photo-add ${over ? 'is-over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); attach(Array.from(e.dataTransfer.files)); }}>
        <p><strong>사진을 끌어다 놓거나 버튼으로 추가하세요.</strong><br />이 일지 행에만 연결되고, 알폼핀 체결 사진과는 따로 보관됩니다. JPG · PNG · WebP / 한 장당 20MB 이하</p>
        <input ref={input} className="log-photo-file" type="file" accept="image/jpeg,image/png,image/webp" multiple tabIndex={-1} aria-hidden="true" onChange={e => attach(Array.from(e.target.files || []))} />
        <input ref={cameraInput} className="log-photo-file" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={e => attach(Array.from(e.target.files || []))} />
        <div>
          <button type="button" className="ui-button ui-primary" disabled={busy} onClick={() => cameraInput.current?.click()}>사진 촬영</button>
          <button type="button" className="ui-button ui-primary" disabled={busy} onClick={() => input.current?.click()}>사진 선택</button>
        </div>
      </div>}
      {loadError && <p className="log-photo-alert" role="alert">{loadError}</p>}
      {(message || deleted.length > 0) && <div className="log-photo-tools">
        {message && <p className="ui-note" role="status">{message}</p>}
        {!readOnly && deleted.length > 0 && <button type="button" className="ui-button" disabled={busy} onClick={() => void remove(deleted, false)}>최근 삭제 취소 ({deleted.length}장{cloudStorageEnabled() && deleted[0].deletedAt ? ` · ${photoPurgeLabel(deleted[0].deletedAt)} 완전 삭제` : ''})</button>}
      </div>}
      {live.length ? <>
        <div className="log-photo-tools">
          <label className="photo-select"><input type="checkbox" checked={picked.length === live.length} disabled={busy} onChange={e => setSelected(e.target.checked ? live.map(p => p.id) : [])} />전체 선택</label>
          <span className="ui-note">{picked.length}장 선택</span>
          <button type="button" className="ui-button ui-primary" disabled={busy || !picked.length} onClick={() => download(picked)}>선택한 사진 받기 ({picked.length}장)</button>
          <span className="ui-note">사진마다 파일 하나씩 내려받습니다. 처음 한 번은 브라우저가 여러 파일 다운로드를 허용할지 물을 수 있습니다.</span>
        </div>
        <div className="photo-grid">{live.map(p => <article className={`photo-card ${selected.includes(p.id) ? 'is-selected' : ''}`} key={p.id}>
          <label className="photo-select"><input type="checkbox" aria-label={`${p.name} 선택`} checked={selected.includes(p.id)} disabled={busy} onChange={e => setSelected(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />선택</label>
          <button type="button" className="photo-thumb" aria-label={`${p.name} 크게 보기`} onClick={() => { setZoom(false); setViewId(p.id); }}><PhotoImage photo={p} /></button>
          <div className="photo-info"><p>{p.name}</p><div>
            <button type="button" className="ui-button" disabled={busy} onClick={() => download([p])}>원본 받기</button>
            {!readOnly && <button type="button" className="ui-button photo-delete" disabled={busy} onClick={() => void remove([p], true)}>삭제</button>}
          </div></div>
        </article>)}</div>
        <p className="ui-note">사진을 누르면 크게 볼 수 있습니다.{!readOnly && ` 삭제한 사진은 ${cloudStorageEnabled() ? '2일 동안 ' : ''}‘최근 삭제 취소’로 되살릴 수 있습니다.`}</p>
      </> : !loadError && <p className="ui-note">등록한 사진이 없습니다.</p>}
    </div>}
  </dialog>;
}
