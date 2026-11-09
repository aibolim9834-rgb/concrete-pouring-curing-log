'use client';

import React, { useRef, useState } from 'react';
import { ClipboardCopy, X } from 'lucide-react';
import { PouringLog, Site } from '@/lib/types';
import { buildReport, REPORT_ITEMS, reportDates, reportOptions, ReportOptions } from '@/lib/daily-report';
import { shortDateDay } from '@/lib/date-only';
import { Modal } from './Modal';

// 일일 보고 문구: pick a day of this site's 타설일지, read the message, copy or share it.
// The format and checked items are saved on the site, so the next open starts the same way. Logs are never changed.
export function DailyReportDialog({ site, logs, canSave, onSaveOptions, onClose }: {
  site: Site; logs: PouringLog[]; canSave: boolean;
  onSaveOptions: (options: ReportOptions | null) => Promise<void>; onClose: () => void;
}) {
  const dates = reportDates(logs);
  const [date, setDate] = useState(dates[0]?.date ?? '');
  const [options, setOptions] = useState(() => reportOptions(site.report_options));
  // The message as the user edited it; null shows the one built from the logs.
  const [edited, setEdited] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [saveState, setSaveState] = useState('');
  const [saveError, setSaveError] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Saves run one after another, so a slow earlier save can never land after a later choice.
  const saves = useRef(Promise.resolve());
  const [canShare] = useState(() => typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches);
  const text = edited ?? (date ? buildReport(site.name, logs, date, options) : '');

  // stored is what the site keeps: the full choice, or null to go back to the defaults.
  function choose(next: ReturnType<typeof reportOptions>, stored: ReportOptions | null = next) {
    setOptions(next); setEdited(null); setStatus('');
    if (!canSave) return;
    setSaveError(''); setSaveState('저장 중');
    saves.current = saves.current.then(() => onSaveOptions(stored)).then(
      () => setSaveState('저장됨'),
      e => { setSaveState(''); setSaveError(e instanceof Error ? e.message : '항목 선택을 저장하지 못했습니다. 이번 문구에는 그대로 쓸 수 있습니다.'); });
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus('복사했습니다. 카톡이나 문자에 붙여 넣으세요.'); }
    catch { textRef.current?.select(); setStatus('자동 복사가 막혀 글을 선택해 두었습니다. Ctrl+C(휴대폰은 길게 눌러 복사)로 복사하세요.'); }
  }
  async function share() {
    try { await navigator.share({ text }); }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus('공유 창을 열지 못했습니다. 복사 버튼을 써 주세요.'); }
  }

  return <Modal onClose={onClose} labelledBy="daily-report-title">
    <div className="daily-report bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl">
      <div className="daily-report-head">
        <h2 id="daily-report-title" className="ui-section-title">일일 보고 문구</h2>
        <span className="ui-note">{site.name}</span>
        <button type="button" className="ui-button" onClick={onClose} aria-label="일일 보고 문구 닫기"><X className="w-4 h-4" aria-hidden="true" /></button>
      </div>
      <div className="daily-report-body">
        {!dates.length ? <p className="ui-note">이 현장에는 아직 일지가 없습니다.</p> : <>
          <label className="daily-report-row" htmlFor="daily-report-date"><span>날짜</span>
            <select id="daily-report-date" value={date} onChange={e => { setDate(e.target.value); setEdited(null); setStatus(''); }}>
              {dates.map(d => <option key={d.date} value={d.date}>{shortDateDay(d.date)} · {d.count}건</option>)}
            </select>
          </label>
          <div className="daily-report-row" role="group" aria-labelledby="daily-report-format"><span id="daily-report-format">형식</span>
            <div className="daily-report-seg">
              {(['A', 'B'] as const).map(format => <button key={format} type="button" aria-pressed={options.format === format} onClick={() => choose({ ...options, format })}>{format === 'A' ? '간단' : '항목형'}</button>)}
            </div>
          </div>
          <fieldset className="daily-report-items">
            <legend>넣을 항목</legend>
            {REPORT_ITEMS.map(([key, label]) => <label key={key}>
              <input type="checkbox" checked={options.items[key]} onChange={e => choose({ ...options, items: { ...options.items, [key]: e.target.checked } })} /> {label}
            </label>)}
          </fieldset>
          <textarea ref={textRef} aria-label="보고 문구 (보내기 전에 고칠 수 있음)" value={text} spellCheck={false}
            onChange={e => { setEdited(e.target.value); setStatus(''); }} />
          <div className="daily-report-actions">
            {/* The real autofocus attribute, set before showModal() runs, so the window opens on 복사 instead of 닫기.
                React's autoFocus prop only focuses on mount and leaves no attribute for the dialog to find. */}
            <button type="button" className="ui-button ui-primary" onClick={copy} ref={button => button?.setAttribute('autofocus', '')}><ClipboardCopy className="w-4 h-4" aria-hidden="true" />복사</button>
            {canShare && <button type="button" className="ui-button" onClick={share}>공유</button>}
            <button type="button" className="ui-button" disabled={edited === null} onClick={() => { setEdited(null); setStatus(''); }}>원래 문구로</button>
            <button type="button" className="ui-button" onClick={() => choose(reportOptions(null), null)}>기본 항목으로</button>
          </div>
          <p className="ui-note" role="status">{status}</p>
          {saveError && <p className="progress-error" role="alert">{saveError}</p>}
          <p className="ui-note">{canSave
            ? `형식과 넣을 항목은 이 현장에 저장되어 다음에도 그대로 열립니다.${saveState ? ` (${saveState})` : ''}`
            : '종료된 현장이라 고른 항목은 저장하지 않고 이번에만 씁니다.'}</p>
        </>}
      </div>
    </div>
  </Modal>;
}
