'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PouringLog, PouringLogInput, Site } from '@/lib/types';
import { newLog } from '@/lib/log-data';
import { normalizeStrength } from '@/lib/strength';
import { WateringSelect } from './WateringSelect';

const memberOptions = ['슬라브', '벽체', '기둥/보', '기초(MAT)', '계단/기타'];
const weatherOptions = ['', '맑음', '흐림', '비', '눈'];
const required = [['date', '일자'], ['building', '동(구역)'], ['floor', '층'], ['member_type', '구조부위']] as const;

function draftFrom(log: PouringLog): PouringLogInput {
  return { site_id: log.site_id, category: log.category, date: log.date, building: log.building, floor: log.floor, member_type: log.member_type, min_temp: log.min_temp, max_temp: log.max_temp, weather: log.weather, remicon_company: log.remicon_company, strength: log.strength || '', volume: log.volume ?? '', curing_watering: log.curing_watering, curing_protection: log.curing_protection, remarks: log.remarks || '' };
}
const temperature = (value: string) => value.trim() === '' ? null : Number(value);

interface MobileLogSheetProps {
  log: PouringLog | null; // null opens an empty new log
  logs: PouringLog[];
  site: Site | undefined;
  onAdd: (data: PouringLogInput) => Promise<void>;
  onUpdate: (id: string, data: PouringLogInput) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// Phone-sized entry form for one log. The desktop table keeps its inline row editing.
export function MobileLogSheet({ log, logs, site, onAdd, onUpdate, onDelete, onClose }: MobileLogSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  // The baseline is what closing without saving would lose nothing against.
  const [baseline, setBaseline] = useState<PouringLogInput>(() => log ? draftFrom(log) : newLog(site?.id, String(logs.length + 1)));
  const [draft, setDraft] = useState<PouringLogInput>(baseline);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [minText, setMinText] = useState(baseline.min_temp === null ? '' : String(baseline.min_temp));
  const [maxText, setMaxText] = useState(baseline.max_temp === null ? '' : String(baseline.max_temp));
  const dirty = JSON.stringify({ ...draft, min_temp: temperature(minText), max_temp: temperature(maxText) }) !== JSON.stringify(baseline);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  // A confirmed delete removes the log from the list; the sheet then has nothing left to show.
  // The native close event can arrive late (or not at all in a background tab), so closes we start also tell the parent directly.
  const finish = () => { dialogRef.current?.close(); onClose(); };
  useEffect(() => {
    if (log && !logs.some(item => item.id === log.id)) finish();
  });

  const set = (patch: Partial<PouringLogInput>) => { setDraft(current => ({ ...current, ...patch })); setNotice(''); };
  function requestClose() {
    if (saving) return;
    if (dirty && !confirm('작성 중인 내용을 버릴까요?')) return;
    finish();
  }

  async function save(keepGoing: boolean) {
    if (lock.current) return;
    const min = temperature(minText), max = temperature(maxText);
    const empty = required.filter(([key]) => !String(draft[key] ?? '').trim()).map(([key]) => key);
    setMissing(empty); setError(''); setNotice('');
    if (empty.length) { dialogRef.current?.querySelector<HTMLElement>(`#mobile-log-${empty[0]}`)?.focus(); return; }
    if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) { setError('온도는 숫자로 입력해주세요.'); return; }
    const volumeText = String(draft.volume ?? '').trim(), volume = volumeText === '' ? '' : Number(volumeText);
    if (volume !== '' && !Number.isFinite(volume)) { setError('타설물량은 숫자로 입력해주세요.'); return; }
    const input = { ...draft, site_id: site?.id || '', min_temp: min, max_temp: max, volume, strength: normalizeStrength(draft.strength) };
    lock.current = true; setSaving(true);
    try {
      if (log) await onUpdate(log.id, input); else await onAdd(input);
      if (!keepGoing) { finish(); return; }
      // Same-day pours usually share place, structure, weather and supplier.
      const next = { ...newLog(site?.id, String(logs.length + 2)), date: input.date, building: input.building, floor: input.floor, member_type: input.member_type, weather: input.weather, min_temp: min, max_temp: max, remicon_company: input.remicon_company };
      setDraft(next); setBaseline(next);
      setNotice(`${input.date.slice(5)} ${input.building} ${input.floor} 일지를 저장했습니다. 날짜·위치·날씨·레미콘사는 남겨 두었습니다.`);
    } catch (e) { setError(e instanceof Error ? e.message : '저장에 실패했습니다. 입력은 유지됩니다.'); }
    finally { lock.current = false; setSaving(false); }
  }

  const field = (key: 'building' | 'floor' | 'remicon_company' | 'curing_protection', label: string, placeholder = '') => {
    const need = required.some(([name]) => name === key), bad = missing.includes(key);
    return <label htmlFor={`mobile-log-${key}`}><span>{label}{need && <span className="mobile-log-need" aria-hidden="true"> *</span>}</span>
      <input id={`mobile-log-${key}`} type="text" value={draft[key]} placeholder={placeholder} required={need} aria-invalid={bad || undefined} aria-describedby={bad ? `mobile-log-${key}-error` : undefined}
        onChange={e => set({ [key]: e.target.value })} />
      {bad && <span id={`mobile-log-${key}-error`} className="mobile-log-error">{`${label}을 입력해주세요.`}</span>}
    </label>;
  };
  const members = memberOptions.includes(draft.member_type) || !draft.member_type ? memberOptions : [...memberOptions, draft.member_type];

  return (
    <dialog ref={dialogRef} className="mobile-log-sheet" aria-labelledby="mobile-log-title"
      onCancel={e => { if (saving || (dirty && !confirm('작성 중인 내용을 버릴까요?'))) e.preventDefault(); }}
      onClose={onClose}>
      <form className="mobile-log-form" onSubmit={e => { e.preventDefault(); void save(false); }} noValidate>
        <header className="mobile-log-head">
          <h2 id="mobile-log-title">{log ? '일지 수정' : '새 일지'}<small>{site?.name}</small></h2>
          <button type="button" className="mobile-log-close" aria-label="닫기" onClick={requestClose}>×</button>
        </header>
        <fieldset className="mobile-log-body" disabled={saving}>
          {error && <p className="mobile-log-alert" role="alert">{error}</p>}

          <fieldset className="mobile-log-group"><legend>날짜·위치</legend>
            <label htmlFor="mobile-log-date"><span>일자<span className="mobile-log-need" aria-hidden="true"> *</span></span>
              <input id="mobile-log-date" type="date" value={draft.date} required aria-invalid={missing.includes('date') || undefined} onChange={e => set({ date: e.target.value })} />
              {missing.includes('date') && <span className="mobile-log-error">일자를 입력해주세요.</span>}
            </label>
            <div className="mobile-log-pair">{field('building', '동(구역)', '예: 101동')}{field('floor', '층', '예: 15층')}</div>
          </fieldset>

          <fieldset className="mobile-log-group" id="mobile-log-member_type" tabIndex={-1} aria-invalid={missing.includes('member_type') || undefined}><legend>구조부위<span className="mobile-log-need" aria-hidden="true"> *</span></legend>
            <div className="mobile-log-chips">{members.map(option => <label key={option} className="mobile-log-chip">
              <input type="radio" name="mobile-log-member" value={option} checked={draft.member_type === option} onChange={() => set({ member_type: option })} />{option}
            </label>)}</div>
            {missing.includes('member_type') && <span className="mobile-log-error">구조부위를 골라주세요.</span>}
          </fieldset>

          <fieldset className="mobile-log-group"><legend>날씨</legend>
            <div className="mobile-log-chips">{(weatherOptions.includes(draft.weather) ? weatherOptions : [...weatherOptions, draft.weather]).map(option => <label key={option || 'none'} className="mobile-log-chip">
              <input type="radio" name="mobile-log-weather" value={option} checked={draft.weather === option} onChange={() => set({ weather: option })} />{option || '미입력'}
            </label>)}</div>
            {/* type=number keeps the minus key on phone keyboards for sub-zero readings. */}
            <div className="mobile-log-pair">
              <label htmlFor="mobile-log-min">최저온도<span className="mobile-log-unit"><input id="mobile-log-min" type="number" step="0.1" value={minText} onChange={e => { setMinText(e.target.value); setNotice(''); }} /><span aria-hidden="true">°C</span></span></label>
              <label htmlFor="mobile-log-max">최고온도<span className="mobile-log-unit"><input id="mobile-log-max" type="number" step="0.1" value={maxText} onChange={e => { setMaxText(e.target.value); setNotice(''); }} /><span aria-hidden="true">°C</span></span></label>
            </div>
          </fieldset>

          <fieldset className="mobile-log-group"><legend>콘크리트</legend>
            {field('remicon_company', '레미콘사')}
            <div className="mobile-log-pair">
              <label htmlFor="mobile-log-strength">타설강도<input id="mobile-log-strength" type="text" placeholder="예: 27 또는 40-210" value={draft.strength || ''} onChange={e => set({ strength: e.target.value })} onBlur={e => set({ strength: normalizeStrength(e.target.value) })} /></label>
              <label htmlFor="mobile-log-volume">타설물량<span className="mobile-log-unit"><input id="mobile-log-volume" type="text" inputMode="decimal" value={draft.volume ?? ''} onChange={e => set({ volume: e.target.value === '' ? '' : e.target.value })} /><span aria-hidden="true">m³</span></span></label>
            </div>
          </fieldset>

          <fieldset className="mobile-log-group"><legend>양생</legend>
            <label htmlFor="mobile-log-watering">살수<WateringSelect id="mobile-log-watering" value={draft.curing_watering} onChange={e => set({ curing_watering: e.target.value })} /></label>
            {field('curing_protection', '보양', '예: 비닐 보양')}
          </fieldset>

          {log && <button type="button" className="mobile-log-delete ui-button ui-danger" onClick={() => onDelete(log.id)}>이 일지 삭제</button>}
        </fieldset>
        {notice && <p className="mobile-log-notice" role="status">{notice}</p>}
        <footer className="mobile-log-foot">
          {log ? <button type="button" className="mobile-log-secondary" onClick={requestClose} disabled={saving}>취소</button>
            : <button type="button" className="mobile-log-secondary" onClick={() => { void save(true); }} disabled={saving}>이어서 입력</button>}
          <button type="submit" className="mobile-log-primary" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
        </footer>
      </form>
    </dialog>
  );
}
