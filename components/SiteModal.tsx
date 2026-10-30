'use client';

import { Modal } from './Modal';
import React, { useRef, useState } from 'react';
import { Site } from '@/lib/types';
import { assertNewSiteName, SiteArchive } from '@/lib/site-archive';
import { downloadFile } from '@/lib/pouring-progress';
import { nextSiteCode } from '@/lib/site-code';
import { X, Plus, Building2, Trash2, CheckCircle } from 'lucide-react';

interface SiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: Site[];
  selectedSiteId: string;
  onSelectSite: (id: string) => void;
  onAddSite: (name: string) => Promise<void>;
  onRenameSite: (id: string, name: string) => Promise<void>;
  onDeleteSite: (id: string) => Promise<void>;
  archives: SiteArchive[];
  archiveError: string;
  canRestore: boolean;
  onRestoreSite: (key: string) => Promise<void>;
}

export const SiteModal: React.FC<SiteModalProps> = ({
  isOpen,
  onClose,
  sites,
  selectedSiteId,
  onSelectSite,
  onAddSite,
  onRenameSite,
  onDeleteSite,
  archives, archiveError, canRestore, onRestoreSite,
}) => {
  const [newSiteName, setNewSiteName] = useState('');
  const newSiteCode = nextSiteCode([...sites, ...archives.map(archive => archive.site)]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const lock = useRef(false);

  if (!isOpen) return null;

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : '처리에 실패했습니다. 입력과 저장 공간을 확인해주세요.'); }
    finally { lock.current = false; setBusy(false); }
  };
  // Cancelling a rename puts focus back on that site's 수정 button.
  const cancelRename = (id: string) => {
    setRenaming(null); setError('');
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-site-rename="${id}"]`)?.focus());
  };
  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    const { id, name } = renaming;
    // The list is disabled while saving, which drops focus; put it back so Enter and Esc keep working.
    void run(async () => { await onRenameSite(id, name); setRenaming(null); })
      .then(() => requestAnimationFrame(() => (document.querySelector<HTMLElement>('.site-rename-row input') ?? document.querySelector<HTMLElement>(`[data-site-rename="${id}"]`))?.focus()));
  };
  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    void run(async () => {
      assertNewSiteName(sites, newSiteName);
      await onAddSite(newSiteName.trim());
      setNewSiteName('');
    });
  };

  return (
    <Modal onClose={() => { if (!busy) onClose(); }} labelledBy="site-modal-title">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <h2 id="site-modal-title" className="text-base font-bold text-slate-100">현장 관리 (해당 현장 목록)</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="현장 관리 닫기"
            disabled={busy}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {/* One scroll area for the whole body: a second, nested list scroller made the wheel jump between the two. */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto overscroll-contain">
          {(error || archiveError) && <p className="progress-error" role="alert">{error || archiveError}</p>}
          <fieldset disabled={busy} className="space-y-6">
          
          {/* Add Site Form */}
          <form onSubmit={handleAdd} className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-amber-400">신규 현장 등록</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  aria-label="신규 현장명"
                  placeholder="현장명 (예: 대구 범어 자이 S&D)"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
              <div>
                <input
                  type="text"
                  aria-label="신규 현장 코드"
                  value={newSiteCode}
                  placeholder="사용 가능한 코드 없음"
                  readOnly
                  aria-describedby="site-code-note"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <p id="site-code-note" className="ui-note">{newSiteCode ? '현장 코드는 A0001부터 순서대로 자동 부여됩니다.' : '현장 코드 A0001~A9999를 모두 사용했습니다.'}</p>
            <button
              type="submit"
              disabled={!newSiteCode}
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition"
            >
              <Plus className="w-4 h-4" /> 현장 목록에 추가
            </button>
          </form>

          {/* Current Site List */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 mb-2">등록된 현장 목록 ({sites.length}개)</h3>
            <div className="space-y-1.5">
              {sites.map((site) => {
                const isSelected = site.id === selectedSiteId;
                if (renaming?.id === site.id) return (
                  // Esc must cancel only the rename, not close the whole dialog.
                  <form key={site.id} onSubmit={handleRename} className="site-rename-row flex items-center gap-2 p-2 rounded-lg border bg-amber-950/40 border-amber-800/80 text-xs"
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelRename(site.id); } }}>
                    <input
                      type="text"
                      aria-label={`${site.name} 새 현장명`}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: site.id, name: e.target.value })}
                      onFocus={(e) => e.currentTarget.select()}
                      maxLength={100}
                      required
                      autoFocus
                      className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button type="submit" className="ui-button ui-primary">저장</button>
                    <button type="button" className="ui-button" onClick={() => cancelRename(site.id)}>취소</button>
                  </form>
                );
                return (
                  <div
                    key={site.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition ${
                      isSelected
                        ? 'bg-amber-950/40 border-amber-800/80 text-amber-300 font-semibold'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isSelected && <CheckCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                      <span className="truncate">{site.name}</span>
                      {site.code && (
                        <span className="text-[10px] text-slate-500 bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded">
                          {site.code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        data-site-rename={site.id}
                        onClick={() => { setError(''); setRenaming({ id: site.id, name: site.name }); }}
                        aria-label={`${site.name} 현장명 수정`}
                        className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px]"
                      >
                        수정
                      </button>
                      {!isSelected && (
                        <button
                          onClick={() => {
                            onSelectSite(site.id);
                            onClose();
                          }}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px]"
                        >
                          선택
                        </button>
                      )}
                      <button
                        onClick={() => void run(() => onDeleteSite(site.id))}
                        title="현장 삭제"
                        aria-label={`${site.name} ${site.code || ''} 현장 삭제`}
                        className="p-1 text-slate-500 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-400 mb-2">보관된 현장 ({archives.length}개)</h3>
            <p className="ui-note mb-2">삭제 전에 현장·일지·타설현황을 함께 보관합니다. 브라우저 데이터를 지우면 보관본도 사라지므로 백업 파일을 저장해주세요.</p>
            <ul className="space-y-2">
              {archives.map(archive => <li key={archive.key} className="border border-slate-700 rounded-lg p-3 space-y-2">
                <p className="break-words">{archive.site.name}{archive.site.code ? ` (${archive.site.code})` : ''} · {archive.logs.length}건 일지 · 현황 {archive.progressRaw ? '있음' : '없음'}</p>
                <p className="ui-note">{new Date(archive.archivedAt).toLocaleString('ko-KR')} · {archive.mode === 'local' ? '브라우저 현장' : 'DB 현장 (별도 복원 필요)'}</p>
                <div className="progress-actions">
                  <button className="ui-button" disabled={!canRestore || archive.mode !== 'local' || sites.some(site => site.id === archive.site.id)} onClick={() => void run(() => onRestoreSite(archive.key))}>{sites.some(site => site.id === archive.site.id) ? '복원된 현장' : '현장 복원'}</button>
                  <button className="ui-button" onClick={() => downloadFile(`${archive.site.name}_현장보관.json`, JSON.stringify(archive, null, 2), 'application/json')}>보관본 저장</button>
                </div>
              </li>)}
            </ul>
          </div>
          </fieldset>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
          >
            닫기
          </button>
        </div>

      </div>
    </Modal>
  );
};
