'use client';

import { Modal } from './Modal';
import React, { useEffect, useRef, useState } from 'react';
import { Site } from '@/lib/types';
import { assertNewSiteName, isClosedSite, SiteArchive } from '@/lib/site-archive';
import { localToday } from '@/lib/log-data';
import { shortDate } from '@/lib/date-only';
import { ShortDateInput } from './ShortDateInput';
import { downloadFile } from '@/lib/pouring-progress';
import { nextSiteCode } from '@/lib/site-code';
import { X, Plus, Building2, Trash2, CheckCircle, MoreHorizontal } from 'lucide-react';
import { KmaRegion, resolveArea, shortAreaLabel, WeatherArea } from '@/lib/kma-area';
import { SiteAddressFields } from './SiteAddressFields';

interface SiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: Site[];
  selectedSiteId: string;
  onSelectSite: (id: string) => void;
  onAddSite: (name: string, address: string, area: WeatherArea | null) => Promise<void>;
  onRenameSite: (id: string, name: string) => Promise<void>;
  onSaveSiteAddress: (id: string, address: string, area: WeatherArea | null) => Promise<void>;
  onDeleteSite: (id: string) => Promise<void>;
  onSetSiteStatus: (id: string, closedAt: string | null) => Promise<void>;
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
  onSaveSiteAddress,
  onDeleteSite,
  onSetSiteStatus,
  archives, archiveError, canRestore, onRestoreSite,
}) => {
  const [newSiteName, setNewSiteName] = useState('');
  const newSiteCode = nextSiteCode([...sites, ...archives.map(archive => archive.site)]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  // 진행 is the default tab; 종료 lists closed sites, 전체 shows both with a status badge.
  const [tab, setTab] = useState<'active' | 'closed' | 'all'>('active');
  const [closing, setClosing] = useState<{ id: string; date: string } | null>(null);
  const inTab = (site: Site) => tab === 'all' || isClosedSite(site) === (tab === 'closed');
  const lock = useRef(false);
  const [newAddress, setNewAddress] = useState(''), [newPicked, setNewPicked] = useState<WeatherArea | null>(null);
  const [addressing, setAddressing] = useState<{ id: string; address: string; picked: WeatherArea | null } | null>(null);
  // The official region table (about 250 KB) loads only when this window opens.
  const [regions, setRegions] = useState<KmaRegion[] | null>(null), [regionError, setRegionError] = useState('');
  useEffect(() => {
    if (!isOpen || regions) return;
    let alive = true;
    import('@/lib/kma-regions.json')
      .then(m => { if (alive) { setRegions(m.default.rows as KmaRegion[]); setRegionError(''); } })
      .catch(() => { if (alive) setRegionError('기상 위치 목록을 불러오지 못했습니다. 주소만 저장되고, 위치는 나중에 다시 찾을 수 있습니다.'); });
    return () => { alive = false; };
  }, [isOpen, regions]);

  if (!isOpen) return null;

  // The place saved with an address. Waiting for the table instead of saving without a place the address would have found.
  const areaFor = (address: string, picked: WeatherArea | null) => {
    if (!address.trim()) return null;
    if (regionError) return picked;
    if (!regions) throw new Error('기상 위치 목록을 불러오는 중입니다. 잠시 후 다시 눌러 주세요.');
    return resolveArea(address, picked, regions);
  };

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
      await onAddSite(newSiteName.trim(), newAddress.trim(), areaFor(newAddress, newPicked));
      setNewSiteName(''); setNewAddress(''); setNewPicked(null);
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
            <SiteAddressFields id="new-site-address" address={newAddress} picked={newPicked} regions={regions} regionError={regionError}
              onAddressChange={value => { setNewAddress(value); setNewPicked(null); }} onPick={setNewPicked} />
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
            <div className="site-status-tabs" role="tablist" aria-label="현장 상태">
              {([['active', '진행'], ['closed', '종료'], ['all', '전체']] as const).map(([key, label]) => {
                const count = key === 'all' ? sites.length : sites.filter(site => isClosedSite(site) === (key === 'closed')).length;
                return <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setClosing(null); setAddressing(null); setError(''); }}>{label} <small>{count}</small></button>;
              })}
            </div>
            <div className="space-y-1.5 mt-2" role="tabpanel">
              {sites.filter(inTab).map((site) => {
                const isSelected = site.id === selectedSiteId, closed = isClosedSite(site);
                if (closing?.id === site.id) return (
                  <form key={site.id} className="site-close-row" onSubmit={e => { e.preventDefault(); void run(async () => { await onSetSiteStatus(site.id, closing.date); setClosing(null); }); }}
                    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setClosing(null); } }}>
                    <b className="truncate">{site.name}</b>
                    <label>종료일<ShortDateInput label={`${site.name} 종료일`} value={closing.date} onChange={date => setClosing({ id: site.id, date })}/></label>
                    <button type="submit" className="ui-button ui-danger">종료 처리</button>
                    <button type="button" className="ui-button" onClick={() => setClosing(null)}>취소</button>
                    <p className="ui-note">일지·타설현황·사진은 그대로 남고, 위쪽 현장 선택에서만 빠집니다. 종료 탭에서 다시 볼 수 있습니다.</p>
                  </form>
                );
                if (addressing?.id === site.id) return (
                  // Esc cancels only the address change, not the whole dialog.
                  <form key={site.id} className="site-address-row" onSubmit={e => { e.preventDefault(); void run(async () => { await onSaveSiteAddress(site.id, addressing.address.trim(), areaFor(addressing.address, addressing.picked)); setAddressing(null); }); }}
                    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAddressing(null); } }}>
                    <b className="truncate">{site.name}</b>
                    <SiteAddressFields id={`site-address-${site.id}`} autoFocus address={addressing.address} picked={addressing.picked} regions={regions} regionError={regionError}
                      onAddressChange={address => setAddressing({ id: site.id, address, picked: null })} onPick={picked => setAddressing({ ...addressing, picked })} />
                    <div className="progress-actions">
                      <button type="submit" className="ui-button ui-primary">저장</button>
                      <button type="button" className="ui-button" onClick={() => setAddressing(null)}>취소</button>
                    </div>
                  </form>
                );
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
                    className={`site-row flex flex-wrap items-center justify-between gap-x-2 gap-y-1 p-2.5 rounded-lg border text-xs transition ${closed ? 'is-closed' : ''} ${
                      isSelected
                        ? 'bg-amber-950/40 border-amber-800/80 text-amber-300 font-semibold'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {/* flex-1 + min-w-0: a long 현장명 shortens with … instead of pushing 선택 and ⋯ onto their own line. */}
                    <div className="flex flex-1 min-w-0 items-center gap-2">
                      {isSelected && <CheckCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                      <span className="truncate" title={site.name}>{site.name}</span>
                      {site.code && (
                        <span className="flex-shrink-0 text-[10px] text-slate-500 bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded">
                          {site.code}
                        </span>
                      )}
                      {closed ? <span className="site-status-badge is-closed">종료{site.closed_at ? ` ${shortDate(site.closed_at, '.')}` : ''}</span> : tab === 'all' && <span className="site-status-badge">진행</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {closed ? <>
                        {!isSelected && <button onClick={() => { onSelectSite(site.id); onClose(); }} aria-label={`${site.name} 보기 (읽기 전용)`} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px]">보기</button>}
                        <button onClick={() => void run(() => onSetSiteStatus(site.id, null))} aria-label={`${site.name} 다시 진행`} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px]">다시 진행</button>
                        <button
                          onClick={() => void run(() => onDeleteSite(site.id))}
                          title="현장 삭제"
                          aria-label={`${site.name} ${site.code || ''} 현장 삭제`}
                          className="p-1 text-slate-500 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </> : <>
                        {/* 선택 is used most, so it stays on the row; the rarer three sit behind ⋯ to leave room for long site names. */}
                        {isSelected ? <span className="site-row-current">현재 현장</span>
                          : <button onClick={() => { onSelectSite(site.id); onClose(); }} aria-label={`${site.name} 선택`} className="site-row-select">선택</button>}
                        <SiteActions site={site} actions={[
                          [`${site.name} 현장명 수정`, '현장명 수정', () => { setError(''); setClosing(null); setAddressing(null); setRenaming({ id: site.id, name: site.name }); }],
                          [`${site.name} 주소 ${site.address ? '수정' : '입력'}`, site.address ? '주소 수정' : '주소 입력', () => { setError(''); setRenaming(null); setClosing(null); setAddressing({ id: site.id, address: site.address ?? '', picked: site.weather_area ?? null }); }],
                          [`${site.name} 종료 처리`, '종료 처리', () => { setError(''); setRenaming(null); setAddressing(null); setClosing({ id: site.id, date: localToday() }); }],
                        ]} />
                      </>}
                    </div>
                    <p className="site-row-address">
                      {site.address && <span className="truncate">{site.address}</span>}
                      <span className={`site-area-chip ${site.weather_area ? 'is-ok' : site.address ? 'is-need' : ''}`}>
                        {site.weather_area ? `기상 기준: ${shortAreaLabel(site.weather_area)}` : site.address ? '위치 선택 필요 · ⋯의 주소 수정에서 고르기' : '주소 없음 · 오늘 날씨 표시 안 됨'}
                      </span>
                    </p>
                  </div>
                );
              })}
              {!sites.some(inTab) && <p className="ui-note">{tab === 'closed' ? '종료된 현장이 없습니다.' : '진행 중인 현장이 없습니다.'}</p>}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-400 mb-2">보관된 현장 ({archives.length}개)</h3>
            <p className="ui-note mb-2">삭제한 현장의 브라우저 백업입니다. 삭제 전에 현장·일지·타설현황을 함께 보관합니다. 브라우저 데이터를 지우면 보관본도 사라지므로 백업 파일을 저장해주세요.</p>
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

// ⋯ next to a site: its rarer actions as a small group of buttons in a popover (not an ARIA menu, so Tab moves through them).
// The popover sits in the top layer above the dialog; it is placed under the button by script because CSS anchor positioning
// is not yet in Chrome. Browsers without popover show the buttons on the row instead.
function SiteActions({ site, actions }: { site: Site; actions: [label: string, text: string, run: () => void][] }) {
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [inline, setInline] = useState(false);
  const panelId = `site-actions-${site.id}`;
  useEffect(() => {
    const menu = panel.current;
    if (!menu || !('popover' in HTMLElement.prototype)) { setInline(true); return; }
    const close = () => menu.hidePopover();
    const onToggle = (event: Event) => {
      const isOpen = (event as ToggleEvent).newState === 'open';
      setOpen(isOpen);
      if (isOpen) {
        // Below the button, right edges aligned; above it when the window bottom is too close.
        const box = trigger.current!.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
        const top = box.bottom + 4 + height > window.innerHeight - 8 ? Math.max(8, box.top - 4 - height) : box.bottom + 4;
        menu.style.top = `${top}px`;
        menu.style.left = `${Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8))}px`;
        // The list scrolls under a fixed panel, so scrolling or resizing closes it instead of leaving it behind.
        window.addEventListener('scroll', close, { capture: true, once: true });
        window.addEventListener('resize', close, { once: true });
      } else {
        window.removeEventListener('scroll', close, { capture: true });
        window.removeEventListener('resize', close);
        // Esc or a click outside hides the focused item; put focus back on ⋯ rather than losing it.
        if (document.activeElement === document.body || menu.contains(document.activeElement)) trigger.current?.focus();
      }
    };
    menu.addEventListener('toggle', onToggle);
    return () => { menu.removeEventListener('toggle', onToggle); window.removeEventListener('scroll', close, { capture: true }); window.removeEventListener('resize', close); };
  }, []);
  const buttons = actions.map(([label, text, run]) =>
    <button key={text} type="button" aria-label={label} onClick={() => { if (panel.current?.matches(':popover-open')) panel.current.hidePopover(); run(); }}>{text}</button>);
  if (inline) return <span className="site-actions-inline">{buttons}</span>;
  return <>
    <button ref={trigger} type="button" data-site-rename={site.id} className="site-actions-trigger" aria-label={`${site.name} 관리`} aria-expanded={open} aria-controls={panelId}
      onClick={() => { const menu = panel.current; if (menu) { if (menu.matches(':popover-open')) menu.hidePopover(); else menu.showPopover(); } }}>
      <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
    </button>
    {/* Right after its button so Tab moves from ⋯ into the open panel. */}
    <div ref={panel} id={panelId} popover="auto" className="site-actions-menu">{buttons}</div>
  </>;
}
