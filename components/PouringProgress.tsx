'use client';

import React, { useEffect, useRef, useState } from 'react';
import { difference, days, gap, shortDate } from '@/lib/date-only';
import { previousStageId, scheduleMetrics } from '@/lib/progress-schedule';
import { ShortDateInput } from './ShortDateInput';
import { ProgressPrint } from './ProgressPrint';
import { ProgressStructure } from './ProgressStructure';
import { inlineDateRecord } from '@/lib/inline-date';
import { clearProgressColor, progressColor, recentProgressColors, setProgressColor } from '@/lib/progress-color';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Site } from '@/lib/types';
import { buildingLabel, completedStages, downloadFile, emptyProgress, ProgressDocument, progressId, progressRows, validDate } from '@/lib/pouring-progress';
import { EntryDraft, entryFromDraft, parsePourDateList, pourDates, pourDatesLabel, progressCsv, removeProgressEntry, setPourDates, upsertProgressEntry } from '@/lib/progress-entries';
import { loadProgress, ProgressSnapshot, saveProgress } from '@/lib/progress-storage';
import { cloudStorageEnabled } from '@/lib/cloud-storage';

import { progressEditor, visibleSelection } from '@/lib/progress-editor';
import { parseProgressBackup, serializeProgressBackup } from '@/lib/progress-backup';

const cn = (...values: (string | false | null | undefined)[]) => twMerge(clsx(values));
const defaultColor = '#ffffff';
const standardColors = [
  { name: '진한 빨강', value: '#C00000' },
  { name: '빨강', value: '#FF0000' },
  { name: '주황', value: '#FFC000' },
  { name: '노랑', value: '#FFFF00' },
  { name: '연두', value: '#92D050' },
  { name: '초록', value: '#00B050' },
  { name: '하늘색', value: '#00B0F0' },
  { name: '파랑', value: '#0070C0' },
  { name: '진한 파랑', value: '#002060' },
  { name: '보라', value: '#7030A0' },
];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ink = (hex: string) => {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
};
const blankEntry = (): EntryDraft => ({ member: '슬라브', zone: '', volume: '', remarks: '' });
interface Props { site: Site; onWorkPending?: (pending: boolean) => void }
export function PouringProgress({ site, onWorkPending }: Props) {
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(blankEntry);
  const lock = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [basis, setBasis] = useState(today);
  const [filter, setFilter] = useState('all');
  const [panel, setPanel] = useState<'structure' | null>('structure');
  const [multiple, setMultiple] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [pourDraft, setPourDraft] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [comparisonStage, setComparisonStage] = useState('');
  const [inlineEdit, setInlineEdit] = useState<{key:string;bid:string;sid:string;field:'actual'|'planned';value:string;error:string;add?:boolean;list?:boolean}|null>(null);
  const workPending = saving || !!inlineEdit;
  useEffect(() => {
    onWorkPending?.(workPending);
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (workPending) window.addEventListener('beforeunload', prevent);
    return () => { onWorkPending?.(false); if (workPending) window.removeEventListener('beforeunload', prevent); };
  }, [workPending, onWorkPending]);
  const inlineDateRef = useRef<HTMLInputElement>(null);
  const inlineKeyRef = useRef<string|null>(null);
  const inlineSavingRef = useRef(false);
  const inlineAutoSaveRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  function clearInlineAutoSave() { if(inlineAutoSaveRef.current!==null){clearTimeout(inlineAutoSaveRef.current);inlineAutoSaveRef.current=null;} }
  useEffect(()=>()=>{clearInlineAutoSave();inlineKeyRef.current=null;},[]);
  const cellNodes = useRef(new Map<string,HTMLButtonElement>());
  useEffect(()=>{if(inlineEdit)inlineDateRef.current?.focus();},[inlineEdit?.key]);
  const [color, setColor] = useState(defaultColor);
  const [history, setHistory] = useState<ProgressDocument[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [addingBuilding, setAddingBuilding] = useState(false);
  const [stageId, setStageId] = useState('');
  const document = snapshot?.document || emptyProgress();
  const visible = document.buildings.filter(b => filter === 'all' || b.id === filter);
  const rows = progressRows(visible);
  const [selectedBuildingId, selectedStageId] = selected.length === 1 ? selected[0].split(':') : [];
  const selectedBuilding = document.buildings.find(b => b.id === selectedBuildingId);
  const selectedStage = selectedBuilding?.stages.find(s => s.id === selectedStageId);
  const selectedRecord = selectedBuilding?.records[selectedStageId];
  const {plannedDays,actualDays} = selectedBuilding ? scheduleMetrics(selectedBuilding,selectedStageId,{date,plannedDate,comparisonStage}) : {plannedDays:null,actualDays:null};
  const previousStage = (next: ProgressDocument,bid:string,sid:string) => { const b=next.buildings.find(b=>b.id===bid); return b ? previousStageId(b,sid) : ''; };
  const entryReport = visible.flatMap(b => b.stages.flatMap(s => {
    const r = b.records[s.id];
    return r?.date ? (r.entries || []).map(e => ({ b: buildingLabel(b.name), s: s.name, date: r.date, entry: e })) : [];
  }));

  useEffect(() => {
    // The selection bar sticks under the app header, whose height changes when it wraps.
    const header = window.document.querySelector<HTMLElement>('.concrete-app > header'), bar = window.document.querySelector<HTMLElement>('.progress-selection-tools');
    if (!header || !bar) return;
    const root = window.document.documentElement.style;
    const update = () => { root.setProperty('--app-header-height', `${header.offsetHeight}px`); root.setProperty('--selection-bar-height', `${bar.offsetHeight}px`); };
    const observer = new ResizeObserver(update); observer.observe(header); observer.observe(bar); update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    window.addEventListener('cp-progress-export', exportCSV);
    return () => window.removeEventListener('cp-progress-export', exportCSV);
  });

  useEffect(() => {
    let active = true;
    // Preserve local originals when importing existing records into cloud storage.
    loadProgress(site.id, cloudStorageEnabled()).then(value => { if (active) {
      setSnapshot(value); setStale(false); resetEditor(value.document); setPanel('structure');
      const first = value.document.buildings[0];
      if (first) { const stage = completedStages(first, today())[0] || first.stages.find(s => s.id === 'f1') || first.stages[0]; if (stage) selectRecord(value.document, first.id, stage.id); }
    } }).catch(e => { if (active) { setStale(true); setError(e instanceof Error ? e.message : '현황을 불러오지 못했습니다. 원본은 유지됩니다. 새로 불러오기를 눌러주세요.'); } });
    const changed = (e: StorageEvent) => { if (e.key === null || e.key === `cp_pouring_progress_v1:${site.id}`) { setStale(true); setError('다른 탭에서 현황을 변경했습니다. 새로 불러온 뒤 다시 입력해주세요.'); } };
    window.addEventListener('storage', changed);
    return () => { active = false; clearInlineAutoSave(); inlineKeyRef.current=null; window.removeEventListener('storage', changed); };
  }, [site.id]);

  function resetEditor(next: ProgressDocument, preferredId?: string) {
    clearInlineAutoSave();inlineKeyRef.current=null;
    const editor = progressEditor(next, preferredId);
    setBuildingId(editor.buildingId);
    setStageId(editor.stageId); setSelected([]);
    setEntryDraft(blankEntry()); setInlineEdit(null);
  }

  async function commit(next: ProgressDocument, remember = true) {
    if (!snapshot || lock.current) return false;
    if (stale) { setError('다른 탭에서 변경되었습니다. 새로 불러온 뒤 다시 입력해주세요.'); return false; }
    lock.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const saved = await saveProgress(site.id, snapshot, next);
      if (remember) setHistory(h => [...h.slice(-19), snapshot.document]);
      setSnapshot(saved); setNotice('저장했습니다.'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '저장에 실패했습니다. 브라우저 저장 공간과 연결 상태를 확인해주세요.'); return false; }
    finally { lock.current = false; setSaving(false); }
  }
  async function reload() {
    if (lock.current) return;
    try { const value = await loadProgress(site.id, cloudStorageEnabled()); setSnapshot(value); setStale(false); setHistory([]); setSelected([]); setPanel('structure'); setFilter('all'); resetEditor(value.document); setError(''); setNotice('최신 현황을 불러왔습니다.'); }
    catch(e) { setStale(true); setError(e instanceof Error ? e.message : '불러오기에 실패했습니다. 연결 또는 저장 데이터를 확인해주세요.'); }
  }
  function selectRecord(next: ProgressDocument, bid: string, sid: string) {
    setBuildingId(bid); setStageId(sid);
    const record = next.buildings.find(b => b.id === bid)?.records[sid];
    setDate(record?.date || ''); setPlannedDate(record?.plannedDate || ''); setComparisonStage(record?.comparisonStage ?? previousStage(next,bid,sid)); setColor(record?.color || defaultColor);
    setSelected([`${bid}:${sid}`]); setEntryDraft(blankEntry());
  }
  function selectCell(bid: string, sid: string) {
    clearInlineAutoSave();inlineKeyRef.current=null;
    setInlineEdit(null);
    const key = `${bid}:${sid}`;
    const nextSelection = multiple ? selected.includes(key) ? selected.filter(x => x !== key) : [...selected, key] : [key];
    setSelected(nextSelection);
    const [editBuilding, editStage] = nextSelection.length === 1 ? nextSelection[0].split(':') : [bid, sid];
    setBuildingId(editBuilding); setStageId(editStage);
    const record = document.buildings.find(b => b.id === editBuilding)?.records[editStage];
    setDate(record?.date || ''); setPlannedDate(record?.plannedDate || ''); setComparisonStage(record?.comparisonStage ?? previousStage(document,editBuilding,editStage)); setColor(record?.color || defaultColor); setEntryDraft(blankEntry());
    setError('');
  }
  function beginInline(bid:string,sid:string,field:'actual'|'planned',add=false) {
    if (saving || stale || lock.current) return;
    const b=document.buildings.find(b=>b.id===bid),r=b?.records[sid];
    if (!b?.stages.some(s=>s.id===sid)) return;
    setMultiple(false); selectRecord(document,bid,sid);
    clearInlineAutoSave();inlineKeyRef.current=bid+':'+sid+':'+field;
    // Multi-date cells edit all dates as one comma-separated line.
    const list=field==='actual' && !!r?.dates && !add;
    setInlineEdit({key:bid+':'+sid+':'+field,bid,sid,field,value:list?pourDates(r).map(d=>shortDate(d)).join(', '):add?'':(field==='planned'?r?.plannedDate:r?.date)||'',error:'',add,list});
    setNotice(list?'날짜를 쉼표로 구분해 고치거나 지우고 Enter로 저장합니다. · Esc로 입력 취소':add?'추가할 타설일을 입력하면 자동 저장됩니다. · Esc로 입력 취소':'날짜 입력을 마치면 자동 저장됩니다. · Esc로 입력 취소');
  }
  function setInlineValue(value:string) {
    clearInlineAutoSave();
    if (!inlineEdit || inlineSavingRef.current) return;
    setInlineEdit({...inlineEdit,value,error:''});
    if(inlineEdit.field==='planned')setPlannedDate(value);else setDate(value);
  }
  function focusCell(key:string) { requestAnimationFrame(()=>cellNodes.current.get(key)?.focus({preventScroll:true})); }
  function cancelInline() {
    if(!inlineEdit || lock.current)return;
    clearInlineAutoSave();inlineKeyRef.current=null;
    const edit=inlineEdit;setInlineEdit(null);selectRecord(document,edit.bid,edit.sid);setNotice('셀 입력을 취소했습니다.');focusCell(edit.key);
  }
  function queueInlineSave(value:string,source:'input'|'blur'|'calendar') {
    clearInlineAutoSave();
    if(!inlineEdit || inlineKeyRef.current!==inlineEdit.key || inlineSavingRef.current || lock.current || stale)return;
    if(value && !validDate(value)){if(source==='blur')setInlineEdit(current=>current?{...current,error:'올바른 날짜를 입력해주세요.'}:null);return;}
    const record=document.buildings.find(b=>b.id===inlineEdit.bid)?.records[inlineEdit.sid];
    const previous=inlineEdit.add?'':(inlineEdit.field==='planned'?record?.plannedDate:record?.date)||'';
    if(previous===value)return;
    if(inlineEdit.add && pourDates(record).includes(value)){setInlineEdit(current=>current?{...current,error:'이미 넣은 타설일입니다.'}:null);return;}
    if(source==='input'){inlineAutoSaveRef.current=setTimeout(()=>{inlineAutoSaveRef.current=null;void saveInline(value);},400);}
    else void saveInline(value);
  }
  async function saveInline(value?:string) {
    clearInlineAutoSave();
    if(!inlineEdit || inlineKeyRef.current!==inlineEdit.key || inlineSavingRef.current || lock.current)return;
    const edit={...inlineEdit,value:value??inlineEdit.value},b=document.buildings.find(b=>b.id===edit.bid),record=b?.records[edit.sid];
    if(!b)return;
    inlineSavingRef.current=true;
    try {
      const next=structuredClone(document),target=next.buildings.find(b=>b.id===edit.bid)!;
      if(edit.list){
        const dates=parsePourDateList(edit.value);
        if(dates.join()===pourDates(record).join()){inlineKeyRef.current=null;setInlineEdit(null);focusCell(edit.key);return;}
        const updated=setPourDates(record,dates,record?.color || defaultColor);
        if(record?.entries?.length && record.date!==updated.date && !confirm('마지막 타설일이 바뀌어 구역 내역의 공통 타설일도 함께 바뀝니다. 계속하시겠습니까?'))return;
        target.records[edit.sid]={...updated,comparisonStage:updated.comparisonStage ?? previousStage(document,edit.bid,edit.sid)};
      } else if(edit.add){
        if(!validDate(edit.value))throw Error('추가할 타설일을 올바르게 입력해주세요.');
        if(pourDates(record).includes(edit.value))throw Error('이미 넣은 타설일입니다.');
        const updated=setPourDates(record,[...pourDates(record),edit.value],record?.color || defaultColor);
        if(record?.entries?.length && record.date!==updated.date && !confirm('마지막 타설일이 바뀌어 구역 내역의 공통 타설일도 함께 바뀝니다. 계속하시겠습니까?'))return;
        target.records[edit.sid]={...updated,comparisonStage:updated.comparisonStage ?? previousStage(document,edit.bid,edit.sid)};
      } else target.records[edit.sid]=inlineDateRecord(record,edit.field,edit.value,record?.color || defaultColor,previousStage(document,edit.bid,edit.sid));
      if(!edit.add && !edit.list && edit.field==='actual' && record?.entries?.length && record.date!==edit.value && !confirm('이 층·단계의 모든 구역에 공통으로 적용되는 실시일을 변경하시겠습니까?'))return;
      if(await commit(next)){inlineKeyRef.current=null;setInlineEdit(null);selectRecord(next,edit.bid,edit.sid);setNotice(buildingLabel(b.name)+' '+(b.stages.find(s=>s.id===edit.sid)?.name || '')+' '+(edit.list?'타설일을 저장했습니다.':edit.add?'타설일 '+shortDate(edit.value,'.')+'을 추가했습니다.':(edit.field==='planned'?'예정일':'실시일')+'을 저장했습니다.'));focusCell(edit.key);}
    } catch(e) {setInlineEdit(current=>current ? {...current,error:e instanceof Error?e.message:'날짜를 확인해주세요.'}:null);}
    finally {inlineSavingRef.current=false;}
  }
  function renderInlineDate() {
    if(!inlineEdit)return null;
    const field=inlineEdit.field==='planned'?'예정일':inlineEdit.add?'추가할 타설일':'실시일';
    return <><form className="inline-cell-edit" aria-label={field+' 셀 직접 편집'} onSubmit={e=>{e.preventDefault();void saveInline();}} onKeyDown={e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelInline();}
      if(e.key==='Enter' && e.target===inlineDateRef.current){e.preventDefault();e.stopPropagation();if(e.nativeEvent.isComposing || e.nativeEvent.keyCode===229)return;void saveInline();}
    }}>
      <span id="inline-cell-help" className="sr-only">올바른 날짜 입력 완료 후 자동 저장됩니다. Enter로 바로 저장, Escape로 입력을 취소합니다.</span><label className="sr-only" htmlFor="inline-cell-date">셀 {field}</label>
      {inlineEdit.list ? <input id="inline-cell-date" ref={inlineDateRef} type="text" className="inline-date-list" inputMode="numeric" autoComplete="off" spellCheck={false} aria-label="셀 실시일 목록, 쉼표로 구분" aria-describedby={inlineEdit.error?'inline-cell-error':'inline-cell-help'} aria-invalid={!!inlineEdit.error} disabled={saving || stale} value={inlineEdit.value} onChange={e=>setInlineEdit(current=>current?{...current,value:e.target.value,error:''}:null)} onBlur={()=>{void saveInline();}}/>
        : <ShortDateInput id="inline-cell-date" inputRef={inlineDateRef} label={'셀 '+field} value={inlineEdit.value} onChange={setInlineValue} onCommit={queueInlineSave} disabled={saving || stale} describedBy={inlineEdit.error?'inline-cell-error':'inline-cell-help'} invalid={!!inlineEdit.error}/>}
    </form>{inlineEdit.error && <p id="inline-cell-error" role="alert" className="inline-cell-error">{inlineEdit.error}</p>}</>;
  }
  async function chooseColor(nextColor: string) {
    if (!snapshot || lock.current || stale || !selected.length) return;
    if (await applyRecords('color', nextColor)) setColor(nextColor);
  }
  async function chooseComparisonStage(nextStageId: string) {
    if (!snapshot || lock.current || stale || selected.length !== 1 || !selectedBuilding || !selectedStage) return;
    const targets = visibleSelection(document, selected, filter);
    if (targets.length !== 1) { setError('표에서 비교 기준을 바꿀 칸을 다시 선택해주세요.'); return; }
    if (nextStageId && (nextStageId === selectedStageId || !selectedBuilding.stages.some(s => s.id === nextStageId))) {
      setError('같은 동의 다른 층·단계를 선택해주세요.'); return;
    }
    const next = structuredClone(document), target = next.buildings.find(b => b.id === selectedBuildingId)!;
    target.records[selectedStageId] = { ...(target.records[selectedStageId] || { date: '', status: 'none', color }), comparisonStage: nextStageId };
    if (await commit(next)) { setComparisonStage(nextStageId); setNotice('작업일 비교 단계를 저장했습니다.'); }
  }
  async function applyRecords(action: 'color' | 'clear-color' | 'clear', selectedColor = color) {
    const targets = visibleSelection(document, selected, filter);
    if (targets.length !== selected.length) { setSelected(targets); setError('표시 범위가 바뀌었습니다. 칸을 다시 선택해주세요.'); return; }
    if (!targets.length) { setError('표에서 입력할 칸을 선택해주세요.'); return; }
    const next = structuredClone(document);
    let changed = 0;
    for (const key of targets) {
      const [bid, sid] = key.split(':'); const b = next.buildings.find(x => x.id === bid);
      if (!b || !b.stages.some(s => s.id === sid)) continue;
      if (action === 'clear') { if (b.records[sid]) { delete b.records[sid]; changed++; } }
      else if (action === 'clear-color') {
        const record = b.records[sid], cleared = clearProgressColor(record);
        if (cleared && cleared !== record) { b.records[sid] = cleared; changed++; }
      }
      else { b.records[sid] = setProgressColor(b.records[sid], selectedColor); changed++; }
    }
    if (!changed) { setNotice(action === 'clear-color' ? '지울 색상이 없습니다.' : '변경할 기록이 없습니다.'); return; }
    if (action === 'clear' && !confirm(`선택한 ${changed}개 타설 기록을 지우시겠습니까? 동과 층은 유지됩니다.`)) return;
    const saved = await commit(next);
    if (saved && action === 'clear-color') setNotice(`${changed}칸의 색상만 지웠습니다.`);
    return saved;
  }
  async function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length !== 1 || !selectedBuilding || !selectedStage) return;
    try {
      const entry = entryFromDraft(entryDraft, progressId());
      const next = structuredClone(document);
      const b = next.buildings.find(b => b.id === selectedBuildingId)!;
      b.records[selectedStageId] = upsertProgressEntry(b.records[selectedStageId], entry, date, color);
      if (await commit(next)) { setEntryDraft(blankEntry()); setNotice('같은 날의 구역 내역을 저장했습니다.'); }
    } catch (e) { setError(e instanceof Error ? e.message : '구역 내역을 확인해주세요.'); }
  }
  async function deleteEntry(id: string) {
    if (!selectedRecord || !confirm('이 구역 내역을 삭제하시겠습니까? 공통 타설일과 다른 구역은 유지됩니다.')) return;
    try {
      const next = structuredClone(document);
      next.buildings.find(b => b.id === selectedBuildingId)!.records[selectedStageId] = removeProgressEntry(selectedRecord, id);
      if (await commit(next)) setEntryDraft(blankEntry());
    } catch (e) { setError(e instanceof Error ? e.message : '구역 내역을 삭제하지 못했습니다.'); }
  }
  function openBuildingForm() {
    if (saving || stale || inlineEdit) return;
    setPanel('structure'); setAddingBuilding(true);
  }
  function selectStructure(next: ProgressDocument, bid: string, sid = '') {
    if (filter !== 'all' && filter !== bid) setFilter('all');
    if (sid) { setMultiple(false); selectRecord(next,bid,sid); }
    else resetEditor(next,bid);
  }
  async function undo() {
    const previous = history[history.length - 1];
    if (previous && await commit(previous,false)) {
      setHistory(h => h.slice(0,-1)); setFilter('all'); resetEditor(previous);
      setAddingBuilding(false); setPanel('structure'); setNotice('이전 상태로 되돌렸습니다.');
    }
  }
  function exportCSV() {
    if (!snapshot) { setError('타설현황을 불러온 뒤 CSV로 내보내주세요.'); return; }
    downloadFile(`${site.name}_타설현황.csv`, progressCsv(document, filter, basis), 'text/csv;charset=utf-8');
  }
  function exportBackup() {
    try { downloadFile(`${site.name}_타설현황_백업.json`, serializeProgressBackup(site.name, document), 'application/json'); }
    catch (error) { setError(error instanceof Error ? error.message : '백업을 만들지 못했습니다. 저장 데이터는 유지됩니다.'); }
  }
  async function importJSON(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하의 백업 파일을 선택해주세요.');
      const parsed = parseProgressBackup(await file.text());
      if (!confirm(`백업 '${parsed.siteName || '현장'}'의 ${parsed.document.buildings.length}개 동으로 현재 현황을 교체하시겠습니까? 기존 일지는 변경되지 않습니다.`)) return;
      if (await commit(parsed.document)) { setSelected([]); setPanel(null); setFilter('all'); resetEditor(parsed.document); }
    } catch (e) { setError(e instanceof Error ? e.message : '백업 파일을 확인해주세요.'); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }

  // Each extra pour date shown on one line widens that building's actual-date column.
  function extraDateWidth(b: ProgressDocument['buildings'][number]) {
    return Math.max(0, ...Object.values(b.records).map(r => pourDates(r).length - 1)) * 50;
  }
  async function changePourDates(next: string[]) {
    if (!snapshot || lock.current || stale || inlineEdit || !selectedBuilding || !selectedStage) return;
    try {
      const record = selectedBuilding.records[selectedStageId], updated = setPourDates(record, next, color);
      if (record?.entries?.length && record.date !== updated.date && !confirm('마지막 타설일이 바뀌어 구역 내역의 공통 타설일도 함께 바뀝니다. 계속하시겠습니까?')) return;
      const doc = structuredClone(document), target = doc.buildings.find(b => b.id === selectedBuildingId)!;
      target.records[selectedStageId] = { ...updated, comparisonStage: updated.comparisonStage ?? previousStage(document, selectedBuildingId, selectedStageId) };
      if (await commit(doc)) { selectRecord(doc, selectedBuildingId, selectedStageId); setPourDraft(''); setNotice(`${buildingLabel(selectedBuilding.name)} ${selectedStage.name} 타설일을 저장했습니다.`); }
    } catch (e) { setError(e instanceof Error ? e.message : '타설일을 확인해주세요.'); }
  }
  function renderCellEditor(part: 'bar' | 'details') {
    const single = selected.length === 1;
    const recentColors = recentProgressColors(document, standardColors.map(c => c.value));
    const swatch = (value: string, label: string, title: string) => <button key={value} type="button" disabled={!selected.length} style={{ background: value }} aria-label={label} title={title} aria-pressed={!!selected.length && selected.every(key => { const [bid,sid] = key.split(':'); return progressColor(document.buildings.find(b=>b.id===bid)?.records[sid])?.toUpperCase() === value; })} onClick={() => { void chooseColor(value); }} />;
    const bar = <>
      <div className="progress-selection-row">
        <h3 className="ui-label">선택 항목</h3><span className="progress-selection-name">{single ? `${buildingLabel(selectedBuilding?.name || '')} · ${selectedStage?.name}` : selected.length ? `${selected.length}칸 선택` : '선택한 칸 없음'}</span>
        <div className="progress-color-tools" role="group" aria-label="칸 배경색">
          <label htmlFor="progress-cell-color" className="progress-color-picker"><span className="sr-only">사용자 지정 배경색</span><input id="progress-cell-color" type="color" value={color} disabled={!selected.length} onInput={e => { void chooseColor(e.currentTarget.value); }} /></label>
          <div className="progress-swatches" role="group" aria-label="표준색">{standardColors.map(c => swatch(c.value, `표준색 ${c.name}`, `${c.name} (${c.value})`))}</div>
          {recentColors.length > 0 && <div className="progress-swatches progress-recent-swatches" role="group" aria-label="최근 사용 색"><span className="progress-recent-label" aria-hidden="true">최근</span>{recentColors.map(c => swatch(c, `최근 사용 색 ${c}`, c))}</div>}
        </div>
        <button type="button" className="ui-button" disabled={!selected.length} onClick={() => applyRecords('clear-color')}>색상만 지우기</button>
        <button type="button" className="ui-button ui-primary progress-add-trigger" aria-expanded={addingBuilding} aria-controls="structure-panel" onClick={openBuildingForm}>+ 동 추가</button>
        <button type="button" className="ui-button ui-danger progress-clear-record" disabled={!selected.length} onClick={() => applyRecords('clear')}>선택 기록 지우기</button>
      </div>
      {single && <div className="progress-pour-dates" role="group" aria-label="타설일 목록">
        <span className="ui-label">타설일</span>
        {pourDates(selectedRecord).map(d => <span key={d} className="progress-pour-chip">{shortDate(d, '.')}<button type="button" aria-label={`${shortDate(d, '.')} 타설일 삭제`} onClick={() => { void changePourDates(pourDates(selectedRecord).filter(x => x !== d)); }}>×</button></span>)}
        {!pourDates(selectedRecord).length && <span className="ui-note">미입력</span>}
        <form className="progress-pour-add" onSubmit={e => { e.preventDefault(); if (!validDate(pourDraft)) { setError('추가할 타설일을 올바르게 입력해주세요.'); return; } if (pourDates(selectedRecord).includes(pourDraft)) { setError('이미 넣은 타설일입니다.'); return; } void changePourDates([...pourDates(selectedRecord), pourDraft]); }}>
          <ShortDateInput label="추가할 타설일" value={pourDraft} onChange={setPourDraft}/><button type="submit" className="ui-button">+ 타설일 추가</button>
        </form>
        {(selectedRecord?.dates?.length || 0) > 1 && <span className="ui-note">차이·작업일은 마지막 날짜 기준</span>}
      </div>}
    </>;
    const details = <>
      <div className="progress-selection-details">
      {single && <details className="inline-basis"><summary>작업일·계산 기준</summary>
        <div className="inline-work-results" aria-live="polite"><div><span>예정 작업일</span><strong data-result="planned">{days(plannedDays)}</strong></div><div><span>실시 작업일</span><strong data-result="actual">{days(actualDays)}</strong></div></div>
        <label htmlFor="progress-comparison-stage">작업일 비교 단계<select id="progress-comparison-stage" value={comparisonStage} aria-describedby="progress-comparison-help" onChange={e=>{ void chooseComparisonStage(e.target.value); }}><option value="">미지정</option>{[...(selectedBuilding?.stages || [])].sort((a,b)=>b.order-a.order).filter(s=>s.id!==selectedStageId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <p id="progress-comparison-help" className="sr-only">비교 단계는 즉시 저장됩니다. 휴일을 포함하고 시작일은 제외합니다.</p>
      </details>}
      {single && <details className="progress-details" key={selected[0]}>
        <summary>구역 내역 ({selectedRecord?.entries?.length || 0}건)</summary>
        <p className="ui-note">공통 타설일 {shortDate(selectedRecord?.date || date) || '미입력'}</p>
        {!!selectedRecord?.entries?.length && <ul className="progress-entry-list">{selectedRecord.entries.map(entry => <li key={entry.id}>
          <strong>{entry.member} · {entry.zone}</strong><p className="ui-note">{entry.volume === null ? '물량 미입력' : `${entry.volume.toLocaleString('ko-KR')} m³`}{entry.remarks ? ` · ${entry.remarks}` : ''}</p>
          <div className="progress-actions"><button type="button" className="ui-button" onClick={() => setEntryDraft({ ...entry, volume: entry.volume === null ? '' : String(entry.volume) })}>수정</button><button type="button" className="ui-button ui-danger" onClick={() => deleteEntry(entry.id)}>삭제</button></div>
        </li>)}</ul>}
        <form className="progress-entry-form" onSubmit={saveEntry}>
          <h4 className="ui-label">{entryDraft.id ? '구역 내역 수정' : '구역 내역 추가'}</h4>
          <label>구조부위<select value={entryDraft.member} onChange={e => setEntryDraft(d => ({ ...d, member: e.target.value }))}>{['슬라브', '벽체', '벽체·슬라브', '기둥', '보', '기초', '계단', '기타'].map(member => <option key={member}>{member}</option>)}</select></label>
          <label>구역<input value={entryDraft.zone} maxLength={80} required placeholder="예: A구역" onChange={e => setEntryDraft(d => ({ ...d, zone: e.target.value }))} /></label>
          <label>물량(m³) · 선택<input type="number" min={0} step="any" value={entryDraft.volume} placeholder="미입력" onChange={e => setEntryDraft(d => ({ ...d, volume: e.target.value }))} /></label>
          <label>비고 · 선택<textarea value={entryDraft.remarks} maxLength={1000} rows={2} placeholder="필요한 작업 내용" onChange={e => setEntryDraft(d => ({ ...d, remarks: e.target.value }))} /></label>
          <div className="progress-actions"><button className="ui-button ui-primary" type="submit">{entryDraft.id ? '내역 수정 저장' : '구역 내역 저장'}</button>{entryDraft.id && <button className="ui-button" type="button" onClick={() => setEntryDraft(blankEntry())}>수정 취소</button>}</div>
        </form>
      </details>}
      </div>
    </>;
    return part === 'bar' ? bar : details;
  }

  return <section className="progress-page" aria-label="타설현황">
    <div className="progress-heading"><div><p className="ui-note">{site.name}</p><div className="progress-title-row"><h2 className="ui-page-title">동별 타설현황</h2><span className="progress-storage-badge ui-note print:hidden">{snapshot ? snapshot.mode === 'local' ? '브라우저 저장' : 'DB 저장' : stale ? '불러오기 실패' : '불러오는 중…'}</span></div></div>
      <div className="progress-actions progress-heading-actions print:hidden">
        <button type="button" className="ui-button" disabled={!snapshot || saving} onClick={exportBackup}>백업 저장</button>
        <button type="button" className="ui-button" disabled={!snapshot || saving || !!inlineEdit || stale} onClick={() => importRef.current?.click()}>백업 불러오기</button>
        <input hidden type="file" accept=".json,application/json" ref={importRef} onChange={e => importJSON(e.target.files?.[0])} aria-label="타설현황 백업 파일" />
        <button className="ui-button" disabled={!history.length || saving || !!inlineEdit} onClick={undo}>실행 취소</button>
        <button className="ui-button" disabled={!snapshot || saving || !!inlineEdit} onClick={() => { setPanel('structure'); setAddingBuilding(false); }}>동·층 관리</button>
      </div></div>
    {(error || stale) && <div className="progress-error"><p role="alert">{error || '저장된 현황을 다시 불러와주세요.'}</p>{stale && <button type="button" className="ui-button" disabled={saving || !!inlineEdit} onClick={reload}>새로 불러오기</button>}{stale && inlineEdit && <p className="ui-note">셀 입력을 취소한 뒤 다시 불러와주세요.</p>}</div>}<p className="sr-only" role="status">{saving ? '저장 중입니다.' : notice}</p>
    <fieldset disabled={!snapshot || saving || stale || !!inlineEdit} className="progress-controls print:hidden"><label>기준일<ShortDateInput label="기준일" value={basis} onChange={v=>{if(validDate(v))setBasis(v);}}/></label><label>표시할 동<select value={filter} onChange={e => { setFilter(e.target.value); setSelected([]); setNotice('표시할 동이 바뀌어 선택을 해제했습니다.'); }}><option value="all">전체 동</option>{document.buildings.map(b => <option key={b.id} value={b.id}>{buildingLabel(b.name)}</option>)}</select></label><label className="progress-check"><input type="checkbox" checked={multiple} onChange={e => { setMultiple(e.target.checked); setSelected([]); setEntryDraft(blankEntry()); }} />여러 칸 선택</label><span className="ui-note">{visible.length}개 동 표시 · {selected.length}칸 선택</span><span role="status" className="ui-note">{saving ? '저장 중…' : notice}</span></fieldset>
    <section className="progress-selection-tools print:hidden" aria-label="선택 항목 설정"><fieldset disabled={!snapshot || saving || stale || !!inlineEdit}>{renderCellEditor('bar')}</fieldset></section>
    <section className="progress-selection-extra print:hidden" aria-label="선택 항목 상세"><fieldset disabled={!snapshot || saving || stale || !!inlineEdit}>{renderCellEditor('details')}</fieldset></section>
    <ProgressPrint buildings={visible} siteName={site.name} basis={basis} ink={ink}/>
    <div className={cn('progress-work', panel && 'has-panel')}>
      <div>{!document.buildings.length ? <div className="progress-empty"><h3 className="ui-section-title">등록된 동이 없습니다</h3><p>동 이름과 지상·지하 층수를 입력하면 버림·기초·옥상·옥탑을 포함한 표가 만들어집니다.</p><button className="ui-button ui-primary" disabled={!snapshot} onClick={openBuildingForm}>+ 첫 동 추가</button></div> : <div className="progress-table-wrap progress-comparison-wrap" tabIndex={0} role="region" aria-label="동별 층별 예정일 실시일 비교표">
        <table className="progress-table progress-comparison-table" style={{ '--progress-building-count': visible.length || 1, '--progress-editor-count': inlineEdit ? 1 : 0, '--progress-extra-width': `${visible.reduce((sum, b) => sum + extraDateWidth(b), 0)}px` } as React.CSSProperties}>
          <caption>{site.name} 타설현황 · {shortDate(basis)} 기준 · 예정일·실시일·차이</caption>
          <colgroup><col className="comparison-stage-col"/></colgroup>{visible.map(b => <colgroup key={b.id}><col className={cn('comparison-date-col',inlineEdit?.bid === b.id && inlineEdit.field === 'planned' && 'is-editing')}/><col className={cn('comparison-date-col',inlineEdit?.bid === b.id && inlineEdit.field === 'actual' && 'is-editing')} style={extraDateWidth(b) ? { width: `calc(var(--progress-date-width) + ${extraDateWidth(b)}px)` } : undefined}/><col className="comparison-gap-col"/></colgroup>)}
          <thead>
            <tr><th scope="col" rowSpan={2}>층 / 단계</th>{visible.map(b => { const done = completedStages(b, basis); return <th scope="colgroup" colSpan={3} key={b.id} className="comparison-building-header"><span>{buildingLabel(b.name)}</span><small>최고 {done[0]?.name || '미타설'} · {done.length}/{b.stages.length}단계 완료</small></th>; })}</tr>
            <tr>{visible.map(b => <React.Fragment key={b.id}><th scope="col">예정일</th><th scope="col">실시일</th><th scope="col" className="comparison-group-end">차이</th></React.Fragment>)}</tr>
          </thead>
          <tbody>{rows.map(row => {
            const names = Array.from(new Set(visible.flatMap(b => b.stages.filter(s => s.id === row.id).map(s => s.name))));
            return <tr key={row.id}><th scope="row">{names.join(' / ')}</th>{visible.map(b => {
              const stage = b.stages.find(s => s.id === row.id), record = b.records[row.id], recordKey = `${b.id}:${row.id}`, background = progressColor(record);
              if (!stage) return <td key={b.id} colSpan={3} className="progress-na comparison-group-end">해당 없음</td>;
              const variance = difference(record?.plannedDate || '', record?.date || '');
              return <React.Fragment key={b.id}>
                {(['planned','actual'] as const).map(field => {
                  const key = `${recordKey}:${field}`, fieldName = field === 'planned' ? '예정일' : '실시일';
                  const value = (field === 'planned' ? record?.plannedDate : record?.date) || '', label = field === 'actual' && record?.dates ? pourDatesLabel(record) : value ? shortDate(value,'.') : '';
                  return <td key={field} data-date-field={field}>{inlineEdit?.key === key ? renderInlineDate() : <button
                    ref={node => { if (node) cellNodes.current.set(key,node); else cellNodes.current.delete(key); }}
                    disabled={saving || stale} title={fieldName+' · 더블클릭 또는 Enter로 직접 수정'}
                    onDoubleClick={() => beginInline(b.id,row.id,field)}
                    onKeyDown={e => { if ((e.key === 'Enter' || e.key === 'F2') && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) { e.preventDefault(); beginInline(b.id,row.id,field); } }}
                    className={cn('progress-cell',selected.includes(recordKey) && 'is-selected')}
                    style={background ? { background, '--progress-cell-background': background, '--progress-cell-ink': ink(background) } as React.CSSProperties : undefined}
                    onClick={() => selectCell(b.id,row.id)} aria-pressed={selected.includes(recordKey)}
                    aria-label={`${buildingLabel(b.name)} ${stage.name} ${fieldName} ${label || '미입력'}`}>
                    <span className="progress-cell-date">{label || '—'}</span>{field === 'actual' && !!record?.entries?.length && <span className="progress-cell-detail progress-entry-count">{record.entries.length}구역</span>}
                  </button>}{field === 'actual' && !inlineEdit && record?.date && selected.length === 1 && selected[0] === recordKey && <button type="button" className="progress-cell-add" disabled={saving || stale}
                    aria-label={`${buildingLabel(b.name)} ${stage.name} 타설일 추가`} title="타설일 추가" onClick={() => beginInline(b.id,row.id,'actual',true)}>+</button>}</td>;
                })}
                <td className="comparison-gap comparison-group-end" data-variance={variance === null ? 'missing' : variance}>
                  <span className={cn(variance !== null && variance > 0 && 'is-late',variance !== null && variance < 0 && 'is-early')} title="실시일 − 예정일 · 두 날짜가 있어야 계산됩니다.">{!record?.date && !record?.plannedDate ? '—' : gap(variance)}</span>
                </td>
              </React.Fragment>;
            })}</tr>;
          })}</tbody>
        </table></div>}
      <p className="sr-only">예정일·실시일은 더블클릭 또는 Enter로 수정하고, 올바른 날짜 입력 완료 후 자동 저장됩니다. 차이는 실시일에서 예정일을 뺀 일수입니다. 완료 단계는 기준일 기준이며 전체 공정률이 아닙니다.</p></div>
      {panel && <ProgressStructure document={document} buildingId={buildingId} stageId={stageId}
        disabled={saving || !snapshot || stale || !!inlineEdit} adding={addingBuilding} onAdding={setAddingBuilding}
        onClose={() => {setPanel(null);setAddingBuilding(false);}} onSelect={selectStructure}
        commit={commit} canUndo={!!history.length} onUndo={undo}/>}

    </div>
    {!!entryReport.length && <section className="progress-entry-report" aria-label="구역별 타설 내역 출력"><h3 className="ui-section-title">같은 날 부위·구역별 타설 내역</h3><table className="progress-table"><thead><tr>{['동', '층·단계', '공통 타설일', '구조부위', '구역', '물량(m³)', '비고'].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{entryReport.map(({ b, s, date, entry }) => <tr key={`${b}:${s}:${entry.id}`}><td>{b}</td><td>{s}</td><td>{date}</td><td>{entry.member}</td><td>{entry.zone}</td><td>{entry.volume ?? '미입력'}</td><td>{entry.remarks}</td></tr>)}</tbody></table></section>}
  </section>;
}
