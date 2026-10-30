'use client';

import React, { useEffect, useRef, useState } from 'react';
import { buildingLabel, presetStages, ProgressDocument, progressId, validateProgress } from '@/lib/pouring-progress';
import { changeStage, sameNameRow } from '@/lib/progress-structure';
import { shortDate } from '@/lib/date-only';
import { Modal } from './Modal';

interface Props {
  document: ProgressDocument; buildingId: string; stageId: string; disabled: boolean;
  adding: boolean; onAdding: (value: boolean) => void; onClose: () => void;
  onSelect: (document: ProgressDocument, bid: string, sid?: string) => void;
  commit: (document: ProgressDocument) => Promise<boolean>;
  canUndo: boolean; onUndo: () => Promise<void>;
}
export function ProgressStructure({document,buildingId,stageId,disabled,adding,onAdding,onClose,onSelect,commit,canUndo,onUndo}: Props) {
  const building = document.buildings.find(b => b.id === buildingId);
  const selectedStage = building?.stages.find(s => s.id === stageId);
  const [mode,setMode] = useState<'rename-building'|'add-stage'|'rename-stage'|null>(null);
  const [name,setName] = useState('');
  const [newName,setNewName] = useState('');
  const [floors,setFloors] = useState('20'), [basements,setBasements] = useState('3');
  const [position,setPosition] = useState('');
  const [error,setError] = useState('');
  const [dialog,setDialog] = useState<'delete-building'|'delete-stage'|'copy'|null>(null);
  const [targets,setTargets] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionStage = useRef('');
  // Adding a floor whose name another building already has fills that existing row, so the position choice does not apply.
  const joinRow = mode==='add-stage'&&!adding ? sameNameRow(document,buildingId,name) : undefined;
  useEffect(() => { setMode(null);setError('');setDialog(null); },[buildingId]);
  useEffect(() => { if(actionStage.current!==stageId){setMode(null);setError('');setDialog(null);} },[stageId]);
  useEffect(() => {
    const list = listRef.current, row = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (list && row) {
      const top=row.offsetTop-list.offsetTop;
      if(top<list.scrollTop)list.scrollTop=top;
      else if(top+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=top+row.offsetHeight-list.clientHeight;
    }
  },[buildingId,stageId]);
  useEffect(() => {
    if (!adding) return;
    const numbers=document.buildings.flatMap(b=>{const m=buildingLabel(b.name).match(/^(\d+)동$/);return m?[Number(m[1])]:[];});
    setNewName(`${Math.max(100,...numbers)+1}동`);setMode(null);setError('');
    inputRef.current?.focus();
  },[adding]);
  const closeForm=()=>{onAdding(false);setMode(null);setError('');};
  // New floors usually go on top of the building, so 추가 위치 starts at the floor right below 옥상.
  const topFloorPosition=()=>{const sorted=[...(building?.stages||[])].sort((a,b)=>b.order-a.order),roof=sorted.findIndex(s=>s.name.trim()==='옥상');return (roof>=0?sorted[roof+1]?.id:undefined)??stageId;};
  // Cancelling a row rename puts focus back on that row's 수정 button.
  const cancelStageEdit=(id:string)=>{closeForm();requestAnimationFrame(()=>listRef.current?.querySelector<HTMLButtonElement>(`[data-stage-edit="${id}"]`)?.focus());};
  async function save(e: React.FormEvent) {
    e.preventDefault();if(disabled)return;setError('');
    try {
      let next:ProgressDocument, bid=buildingId, sid=stageId;
      if(adding) {
        const label=buildingLabel(newName.trim());
        if(!label || document.buildings.some(b=>buildingLabel(b.name).trim()===label))throw Error('중복되지 않는 동 이름을 입력해주세요.');
        if(!floors.trim()||!basements.trim()||!Number.isInteger(+floors)||+floors<0||+floors>200||!Number.isInteger(+basements)||+basements<0||+basements>20)throw Error('지상층은 0~200, 지하층은 0~20의 정수로 입력해주세요.');
        bid=progressId();sid='';next={...document,buildings:[...document.buildings,{id:bid,name:label,stages:presetStages(+floors,+basements),records:{}}]};
      } else if(mode==='rename-building') {
        const label=buildingLabel(name.trim());
        if(!building||!label||document.buildings.some(b=>b.id!==buildingId&&buildingLabel(b.name).trim()===label))throw Error('중복되지 않는 동 이름을 입력해주세요.');
        next={...document,buildings:document.buildings.map(b=>b.id===buildingId?{...b,name:label}:b)};
      } else {
        sid=mode==='add-stage'?sameNameRow(document,buildingId,name)?.id??progressId():stageId;
        next=changeStage(document,buildingId,mode==='add-stage'?'add':'rename',sid,name,position);
      }
      validateProgress(next);
      if(await commit(next)){closeForm();onSelect(next,bid,sid);}
      else setError('저장하지 못했습니다. 연결 상태와 화면 위쪽 안내를 확인해주세요. 입력 내용은 유지됩니다.');
    } catch(e){setError(e instanceof Error?e.message:'입력 내용을 확인해주세요.');}
  }
  async function confirmAction() {
    if(disabled||!building)return;
    try {
      let next:ProgressDocument,bid=buildingId,sid=stageId;
      if(dialog==='delete-building') {
        next={...document,buildings:document.buildings.filter(b=>b.id!==buildingId)};bid=next.buildings[0]?.id||'';sid='';
      } else if(dialog==='delete-stage') {next=changeStage(document,buildingId,'delete',stageId);sid='';}
      else {
        if(!selectedStage||!targets.length)return;
        next=structuredClone(document);
        for(const b of next.buildings.filter(b=>targets.includes(b.id))) {
          if(b.stages.some(s=>s.id===stageId||s.name.trim()===selectedStage.name.trim()))throw Error('이미 같은 층·단계가 있는 동은 제외해주세요.');
          b.stages.push({...selectedStage});
        }
        validateProgress(next);
      }
      if(await commit(next)){setDialog(null);closeForm();onSelect(next,bid,sid);}
      else setError('저장하지 못했습니다. 연결 상태와 화면 위쪽 안내를 확인해주세요. 기존 자료는 유지됩니다.');
    } catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}
  }
  function editStage(id:string,action:'rename'|'delete') {
    actionStage.current=id;
    onAdding(false);onSelect(document,buildingId,id);
    setName(building?.stages.find(s=>s.id===id)?.name||'');setError('');if(action==='rename')setMode('rename-stage');else setDialog('delete-stage');
  }
  return <aside id="structure-panel" className="progress-panel progress-structure print:hidden" aria-label="동·층 관리">
    <div className="progress-panel-heading"><h3 className="ui-section-title">동·층 관리</h3><button className="ui-button" disabled={disabled} onClick={onClose}>닫기</button></div>
    <fieldset disabled={disabled}>
      {!!document.buildings.length && <><div className="structure-building-row"><select aria-label="편집할 동" value={buildingId} onChange={e=>{closeForm();onSelect(document,e.target.value);}}>{document.buildings.map(b=><option key={b.id} value={b.id}>{buildingLabel(b.name)}</option>)}</select>
      <button className="ui-button" onClick={()=>{onAdding(false);setName(building?.name||'');setMode('rename-building');setError('');}}>이름 변경</button><button className="ui-button ui-danger" onClick={()=>{setError('');setDialog('delete-building');}}>동 삭제</button></div>
      <p className="structure-selected">{buildingLabel(building?.name||'')}{selectedStage?' · '+selectedStage.name:''}</p></>}
      {(adding||(mode&&mode!=='rename-stage')) && <form className="structure-form" onSubmit={save} onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault();}}>
        <h4>{adding?'새 동 추가':mode==='rename-building'?'동 이름 변경':mode==='add-stage'?'새 층·단계 추가':'층·단계 이름 변경'}</h4>
        <label>{adding||mode==='rename-building'?'동 이름':'층·단계 이름'}<input ref={inputRef} aria-label={adding?'새 동 이름':mode==='rename-building'?'변경할 동 이름':'층·단계 이름'} value={adding?newName:name} maxLength={80} required onChange={e=>adding?setNewName(e.target.value):setName(e.target.value)} autoFocus/></label>
        {adding && <div className="structure-two"><label>지상층 수<input aria-label="지상층 수" type="number" value={floors} min={0} max={200} step={1} required onChange={e=>setFloors(e.target.value)}/></label><label>지하층 수<input aria-label="지하층 수" type="number" value={basements} min={0} max={20} step={1} required onChange={e=>setBasements(e.target.value)}/></label></div>}
        {joinRow && <p className="ui-note">다른 동에 있는 {joinRow.name} 줄에 맞춰 추가됩니다. 그 줄의 해당 없음 칸이 이 동의 칸이 됩니다.</p>}
        {mode==='add-stage'&&!adding&&!joinRow && <label>추가 위치<select aria-label="추가 위치" value={position} onChange={e=>setPosition(e.target.value)}>{[...(building?.stages||[])].sort((a,b)=>b.order-a.order).map(s=><option key={s.id} value={s.id}>{s.name} 위에 추가</option>)}<option value="">맨 아래에 추가</option></select></label>}
        <div className="structure-buttons"><button type="submit" className="ui-button ui-primary">{adding||mode==='add-stage'?'추가':'변경 저장'}</button><button type="button" className="ui-button" onClick={closeForm}>취소</button></div>
      </form>}
      {error&&!dialog&&mode!=='rename-stage' && <p role="alert" className="structure-error">{error}</p>}
      <div className="structure-stage-heading"><h4>층·단계 <span>({building?.stages.length||0})</span></h4><button className="ui-button ui-primary" disabled={!building} onClick={()=>{onAdding(false);setMode('add-stage');setName('');setPosition(topFloorPosition());setError('');}}>+ 층 추가</button></div>
      <div ref={listRef} className="structure-stage-list" aria-label="층·단계 목록">{[...(building?.stages||[])].sort((a,b)=>b.order-a.order).map(s=><div key={s.id} className="structure-stage-row" aria-current={s.id===stageId}>
        {mode==='rename-stage'&&s.id===stageId
          // The rename happens in the row itself, so the list keeps its place.
          ? <form className="structure-stage-edit" onSubmit={save} onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault();if(e.key==='Escape'){e.preventDefault();cancelStageEdit(s.id);}}}>
            <input aria-label={`${s.name} 새 이름`} value={name} maxLength={80} required autoFocus onFocus={e=>e.currentTarget.select()} onChange={e=>setName(e.target.value)} aria-invalid={!!error||undefined} aria-describedby={error?'structure-stage-edit-error':undefined}/>
            <button type="submit" className="ui-button ui-primary">저장</button><button type="button" className="ui-button" onClick={()=>cancelStageEdit(s.id)}>취소</button>
            {error && <p id="structure-stage-edit-error" role="alert" className="structure-error">{error}</p>}
          </form>
          : <><button className="structure-stage-pick" onClick={()=>{closeForm();onSelect(document,buildingId,s.id);}}>{s.name}{building?.records[s.id]?.date&&<small>타설일 {shortDate(building.records[s.id].date,'.')}</small>}</button>
            <button className="ui-button" data-stage-edit={s.id} aria-label={`${s.name} 수정`} onClick={()=>editStage(s.id,'rename')}>수정</button><button className="ui-button ui-danger" aria-label={`${s.name} 삭제`} onClick={()=>editStage(s.id,'delete')}>삭제</button></>}
      </div>)}{!building&&<p className="ui-note">동을 추가하면 층 목록이 나타납니다.</p>}</div>
      <div className="structure-footer"><button className="ui-button" disabled={!selectedStage||document.buildings.length<2} onClick={()=>{setTargets([]);setError('');setDialog('copy');}}>다른 동에도 추가…</button><button className="ui-button" disabled={!canUndo} onClick={async()=>{closeForm();await onUndo();}}>실행 취소</button></div>
    </fieldset>
    {dialog&&building&&<Modal labelledBy="structure-dialog-title" onClose={()=>{if(!disabled)setDialog(null);}}><div className="structure-dialog">
      <h3 id="structure-dialog-title">{dialog==='delete-building'?`${buildingLabel(building.name)} 삭제`:dialog==='delete-stage'?`${buildingLabel(building.name)} · ${selectedStage?.name} 삭제`:`${selectedStage?.name}을 다른 동에도 추가`}</h3>
      {dialog==='delete-building'?<p>층·단계 {building.stages.length}개와 연결 기록 {Object.keys(building.records).length}개가 삭제됩니다. 실행 취소로 복구할 수 있습니다.</p>:dialog==='delete-stage'?<p>이 층·단계의 연결 기록 {building.records[stageId]?1:0}개(날짜·색상·구역 내역)가 삭제됩니다. 실행 취소로 복구할 수 있습니다.</p>:<>{document.buildings.filter(b=>b.id!==buildingId).map(b=>{const exists=b.stages.some(s=>s.id===stageId||s.name.trim()===selectedStage?.name.trim());return <label className="structure-copy-target" key={b.id}><input type="checkbox" disabled={disabled||exists} checked={targets.includes(b.id)} onChange={e=>setTargets(e.target.checked?[...targets,b.id]:targets.filter(id=>id!==b.id))}/>{buildingLabel(b.name)}{exists?' · 이미 있음':''}</label>;})}</>}
      {error&&<p role="alert" className="structure-error">{error}</p>}<div className="structure-buttons"><button className="ui-button" disabled={disabled} onClick={()=>setDialog(null)}>취소</button><button className={'ui-button '+(dialog==='copy'?'ui-primary':'ui-danger')} disabled={disabled||(dialog==='copy'&&!targets.length)} onClick={confirmAction}>{dialog==='copy'?'선택한 동에 추가':'삭제'}</button></div>
    </div></Modal>}
  </aside>;
}
