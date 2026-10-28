'use client';

import { useEffect, useRef, useState } from 'react';
import { AppBackup, backupCounts, collectBackup, parseBackup, restoreBackup } from '@/lib/app-backup';
import { downloadFile } from '@/lib/pouring-progress';
import { localToday } from '@/lib/log-data';

export function BackupManager({ cloud, blocked, loading, siteId }: { cloud: boolean; blocked: boolean; loading: boolean; siteId?: string }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menuRef.current) menuRef.current.open = false; }, [siteId]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ backup: AppBackup; before: AppBackup } | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  function prepare(text: string) {
    const backup = parseBackup(text);
    setPending({ backup, before: collectBackup(localStorage, false) });
  }
  async function preview(file?: File) {
    if (!file || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setPending(null);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('50MB 이하의 파일을 선택해주세요.');
      prepare(await file.text());
    } catch (e) { setError(e instanceof Error ? e.message : '백업 파일을 확인해주세요.'); }
    finally { lock.current = false; setBusy(false); if (input.current) input.current.value = ''; }
  }
  function exportData(raw = false) {
    try {
      const backup = collectBackup(localStorage, !raw);
      downloadFile(`콘크리트_${raw ? '원본보호' : '전체백업'}_${localToday()}.json`, JSON.stringify(raw ? { ...backup, format: 'con1-raw-recovery' } : backup, null, 2), 'application/json'); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '백업 저장에 실패했습니다.'); }
  }
  return <details ref={menuRef} className="backup-manager print:hidden">
    <summary>자료 백업·복원</summary>
    <p className="ui-note">{cloud ? 'DB 현장의 전체 백업·복원은 별도 DB 연결 작업에서 진행합니다.' : '이 브라우저의 전체 현장·일지·타설현황·삭제 보관본을 함께 관리합니다.'}</p>
    <div className="progress-actions">
      <button className="ui-button" disabled={cloud || blocked || busy} onClick={() => exportData()}>전체 백업 저장</button>
      <label className="ui-button backup-file">전체 백업 파일 선택<input ref={input} type="file" accept=".json,application/json" disabled={cloud || loading || busy} onChange={e => void preview(e.target.files?.[0])} /></label>
      {blocked && <button className="ui-button" disabled={cloud || busy} onClick={() => exportData(true)}>손상 원본 자료 저장</button>}
      <button className="ui-button" disabled={cloud || busy} onClick={() => {
        try { const raw = localStorage.getItem('cp_restore_recovery_v1'); if (!raw) throw new Error('복원 전 보관본이 없습니다.'); downloadFile('복원직전_보관본.json', raw, 'application/json'); }
        catch (e) { setError(e instanceof Error ? e.message : '보관본을 읽지 못했습니다.'); }
      }}>직전 복원 전 자료 저장</button>
    </div>
    <details><summary>백업 JSON 내용을 붙여넣어 복원</summary>
      <form onSubmit={event => {
        event.preventDefault(); if (cloud || loading || busy) return;
        setError(''); setPending(null);
        try { prepare(text); } catch (e) { setError(e instanceof Error ? e.message : '백업 내용을 확인해주세요.'); }
      }}>
        <label htmlFor="backup-json">백업 JSON 내용</label>
        <textarea id="backup-json" value={text} onChange={e => setText(e.target.value)} disabled={cloud || loading || busy} required rows={5} />
        <button className="ui-button" type="submit" disabled={cloud || loading || busy}>내용 검사</button>
      </form>
    </details>
    {busy && <p role="status">백업을 검사하고 있습니다.</p>}
    {error && <p className="progress-error" role="alert">{error}</p>}
    {pending && <div className="backup-preview">
      <p>복원할 자료: 현장 {backupCounts(pending.backup).sites}개 · 일지 {backupCounts(pending.backup).logs}건 · 현황 {backupCounts(pending.backup).progress}개 · 보관본 {backupCounts(pending.backup).archives}개</p>
      <p className="ui-note">현재 이 브라우저의 전체 자료를 교체합니다. 교체 직전 자료는 별도로 보관하며 복원 후 화면을 새로 불러옵니다.</p>
      <div className="progress-actions"><button className="ui-button ui-danger" disabled={busy} onClick={() => {
        if (cloud || loading || lock.current || !confirm('현재 브라우저의 현장·일지·현황·보관본을 위 자료로 전체 교체하시겠습니까?')) return;
        lock.current = true; setBusy(true);
        try { restoreBackup(localStorage, pending.backup, pending.before); window.location.assign(window.location.pathname); }
        catch (e) { setError(e instanceof Error ? e.message : '복원에 실패했습니다.'); lock.current = false; setBusy(false); }
      }}>확인한 자료로 전체 복원</button><button className="ui-button" disabled={busy} onClick={() => setPending(null)}>복원 취소</button></div>
    </div>}
  </details>;
}
