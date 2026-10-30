'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Site, PouringLog, PouringLogInput } from '@/lib/types';
import { supabase, checkSupabaseHealth } from '@/lib/supabase';
import { Header } from '@/components/Header';
import { SummaryCards } from '@/components/SummaryCards';
import { RecordTable } from '@/components/RecordTable';
import { SiteModal } from '@/components/SiteModal';
import { PrintView } from '@/components/PrintView';
import { SitePhotos } from '@/components/SitePhotos';
import { PouringProgress } from '@/components/PouringProgress';

import { archiveSite, assertNewSiteName, isClosedSite, listSiteArchives, pickerSites, removeLocalSite, restoreLocalSite, SiteArchive, sortSites } from '@/lib/site-archive';
import { progressId, validDate } from '@/lib/pouring-progress';
import { shortDate } from '@/lib/date-only';
import { readLocalData, writeLocalData, validateLogInput, filterLogs, emptyLogFilters, LogFilters, sortLogs, defaultLogSort, LogSort } from '@/lib/log-data';
import { BackupManager } from './BackupManager';
import { nextSiteCode } from '@/lib/site-code';
import { loadCloudLogData } from '@/lib/cloud-log-data';
import { csvCell } from '@/lib/csv';
import { normalizeWatering } from '@/lib/watering';
import { normalizeStrength } from '@/lib/strength';
import { normalizeFloor } from '@/lib/floor';

export function ConcreteApp({ initialView = 'logs' }: { initialView?: 'logs' | 'progress' | 'photos' }) {
  const [sites, setSiteList] = useState<Site[]>([]);
  // Every change to the list (load, add, rename, delete, restore) goes through here, so it stays in name order.
  const setSites = (update: Site[] | ((prev: Site[]) => Site[])) => setSiteList(prev => sortSites(typeof update === 'function' ? update(prev) : update));
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [logs, setLogs] = useState<PouringLog[]>([]);
  
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [isPrintViewOpen, setIsPrintViewOpen] = useState(false);
  
  const [isSupabase, setIsSupabase] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataIssue, setDataIssue] = useState('');
  const [ready, setReady] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState<LogFilters>(emptyLogFilters);
  const [outputScope, setOutputScope] = useState<'filtered' | 'all'>('filtered');

  const siteLock = useRef(false);
  const photoWorkPending = useRef(false);
  const logWorkPending = useRef(false);
  const progressWorkPending = useRef(false);
  function canLeavePhotos() {
    if (photoWorkPending.current) { alert('사진 저장이 완료된 뒤 이동해주세요.'); return false; }
    if (siteLock.current || logWorkPending.current || progressWorkPending.current) { alert('편집 중인 내용을 저장하거나 취소한 뒤 이동해주세요.'); return false; }
    return true;
  }
  const [archives, setArchives] = useState<SiteArchive[]>([]);
  const [archiveError, setArchiveError] = useState('');
  const [logSort, setLogSort] = useState<LogSort>(defaultLogSort);
  function refreshArchives() {
    try { setArchives(listSiteArchives(localStorage)); setArchiveError(''); }
    catch { setArchiveError('보관된 현장을 불러오지 못했습니다. 저장 데이터는 유지됩니다.'); }
  }
  function openSiteManager() { if (!canLeavePhotos()) return; refreshArchives(); setIsSiteModalOpen(true); }

  useEffect(() => {
    let active = true;
    async function initData() {
      try {
        const preferred = new URLSearchParams(window.location.search).get('site') || localStorage.getItem('cp_selected_site');
        const healthy = process.env.NEXT_PUBLIC_CON1_QA === 'true' ? false : await checkSupabaseHealth();
        if (!active) return;
        setIsSupabase(healthy);
        let loaded;
        if (healthy) {
          loaded = await loadCloudLogData();
        } else loaded = readLocalData(localStorage);
        if (!active) return;
        const loadedSites = sortSites(loaded.sites);
        setSites(loadedSites); setLogs(loaded.logs);
        // A remembered 종료 site stays open (it was being viewed); otherwise start on the first 진행 site.
        setSelectedSiteId(loadedSites.find(site => site.id === preferred)?.id || loadedSites.find(site => !isClosedSite(site))?.id || loadedSites[0]?.id || '');
        setReady(true); setDataIssue('');
      } catch (e) {
        if (active) setDataIssue(`자료를 안전하게 불러오지 못해 입력을 중지했습니다. 원본은 덮어쓰지 않습니다. ${e instanceof Error ? e.message : ''}`);
      } finally { if (active) setLoading(false); }
    }
    void initData();
    const changed = (event: StorageEvent) => {
      if (event.key === null || ['cp_sites','cp_logs'].includes(event.key)) setDataIssue('다른 화면에서 현장 또는 일지가 바뀌었습니다. 작성 중인 내용을 확인한 뒤 새로고침해주세요.');
    };
    window.addEventListener('storage', changed);
    return () => { active = false; window.removeEventListener('storage', changed); };
  }, []);

  function assertWritable() {
    if (!ready || dataIssue) throw new Error(dataIssue || '자료를 불러온 뒤 다시 시도해주세요.');
  }

  useEffect(() => {
    if (!loading && ready && !dataIssue) {
      try {
        if (selectedSiteId) localStorage.setItem('cp_selected_site', selectedSiteId); else localStorage.removeItem('cp_selected_site');
        const url = new URL(window.location.href);
        if (selectedSiteId) url.searchParams.set('site', selectedSiteId); else url.searchParams.delete('site');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      } catch { setOperationError('현장 선택 상태를 저장하지 못했습니다. 브라우저 저장 공간을 확인해주세요.'); }
    }
  }, [selectedSiteId, loading, ready, dataIssue]);

  const currentSite = sites.find((s) => s.id === selectedSiteId) || sites.find(s => !isClosedSite(s)) || sites[0];
  // A 종료 site is shown read-only: viewing, printing and CSV still work, every edit path is closed.
  const readOnly = isClosedSite(currentSite);
  const assertOpenSite = () => { if (readOnly) throw new Error('종료된 현장은 읽기 전용입니다. 고치려면 먼저 "다시 진행"으로 바꿔주세요.'); };
  const openPage = (view: 'logs' | 'progress' | 'photos') => {
    if (!canLeavePhotos()) return;
    if (!currentSite) { alert('현장을 먼저 선택하거나 추가해주세요.'); return; }
    window.location.assign(`${view === 'photos' ? '/photos' : view === 'progress' ? '/progress' : '/'}?site=${encodeURIComponent(currentSite.id)}`);
  };

  // Logs filtered by selected site
  const siteLogs = sortLogs(selectedSiteId ? logs.filter((log) => log.site_id === selectedSiteId) : [], logSort);

  const viewedLogs = filterLogs(siteLogs, filters);
  const outputLogs = outputScope === 'all' ? siteLogs : viewedLogs;
  const outputDescription = outputScope === 'all' ? '현장 전체' : `조회 결과 · ${filters.from || '처음'} ~ ${filters.to || '마지막'}`;

  const handleSaveLog = async (data: PouringLogInput, id?: string) => {
    assertWritable(); assertOpenSite();
    if (siteLock.current) throw new Error('저장 중입니다. 잠시 후 다시 시도해주세요.');
    const activeSiteId = selectedSiteId;
    if (!sites.some(site => site.id === activeSiteId)) throw new Error('등록할 현장을 선택해주세요.');
    const trimmed = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as PouringLogInput;
    const input = { ...trimmed, site_id: activeSiteId, building: trimmed.building.toUpperCase(), floor: normalizeFloor(trimmed.floor), strength: normalizeStrength(trimmed.strength), curing_watering: normalizeWatering(trimmed.curing_watering) };
    validateLogInput(input);
    if (id && !siteLogs.some(log => log.id === id)) throw new Error('수정할 일지를 다시 선택해주세요.');
    siteLock.current = true; setLogBusy(true); setOperationError(''); setNotice('');
    try {
      let saved: PouringLog = { ...input, id: id || `log-${progressId()}` };
      if (isSupabase) {
        const result = id
          ? await supabase.from('pouring_logs').update(input).eq('id', id).eq('site_id', activeSiteId).select('*').maybeSingle()
          : await supabase.from('pouring_logs').insert(input).select('*').single();
        if (result.error || !result.data) throw new Error('일지 저장에 실패했습니다. 입력은 유지됩니다. 연결·권한 또는 다른 화면의 변경을 확인해주세요.');
        saved = { ...result.data, remicon_company: result.data.remicon_company ?? '', curing_watering: result.data.curing_watering ?? '', curing_protection: result.data.curing_protection ?? '' };
      }
      const nextLogs = id ? logs.map(log => log.id === id ? saved : log) : [saved, ...logs];
      if (!isSupabase) writeLocalData(localStorage, { sites, logs }, { sites, logs: nextLogs });
      setLogs(nextLogs); setNotice('일지를 저장했습니다.');
    } catch (e) { setOperationError(e instanceof Error ? e.message : '저장에 실패했습니다.'); throw e; }
    finally { siteLock.current = false; setLogBusy(false); }
  };

  const handleDeleteLog = async (id: string) => {
    try {
      assertWritable(); assertOpenSite();
      if (siteLock.current) throw new Error('다른 작업을 처리 중입니다.');
      const target = siteLogs.find(log => log.id === id);
      if (!target || !confirm(`${target.date} ${target.building} ${target.floor} 일지를 삭제하시겠습니까?`)) return;
      siteLock.current = true; setLogBusy(true); setOperationError(''); setNotice('');
      try {
        if (isSupabase) {
          const result = await supabase.from('pouring_logs').delete().eq('id', id).eq('site_id', target.site_id).select('id').maybeSingle();
          if (result.error || !result.data) throw new Error('일지 삭제에 실패했습니다. 목록은 유지됩니다.');
        }
        const nextLogs = logs.filter(log => log.id !== id);
        if (!isSupabase) writeLocalData(localStorage, { sites, logs }, { sites, logs: nextLogs });
        setLogs(nextLogs); setNotice('일지를 삭제했습니다.');
      } finally { siteLock.current = false; setLogBusy(false); }
    } catch (e) { setOperationError(e instanceof Error ? e.message : '삭제에 실패했습니다.'); }
  };

  // Site changes finish persistence before committing React state.
  const handleAddSite = async (name: string) => {
    assertWritable();
    if (siteLock.current) throw new Error('현장 처리 중입니다. 잠시 후 다시 시도해주세요.');
    siteLock.current = true;
    try {
      assertNewSiteName(sites, name);
      const code = nextSiteCode([...sites, ...listSiteArchives(localStorage).map(archive => archive.site)]);
      if (!code) throw new Error('현장 코드 A0001~A9999를 모두 사용했습니다.');
      const newSite: Site = { id: `site-${progressId()}`, name: name.trim(), code };
      if (isSupabase && supabase) {
        const { data: inserted, error } = await supabase.from('sites').insert({ name: newSite.name, code }).select().single();
        if (error || !inserted) throw new Error('현장 등록에 실패했습니다. 입력 내용은 유지됩니다. 연결과 권한을 확인해주세요.');
        newSite.id = inserted.id;
      } else {
        writeLocalData(localStorage, { sites, logs }, { sites: [...sites, newSite], logs });
      }
      setSites(prev => [...prev, newSite]); setSelectedSiteId(newSite.id);
    } finally { siteLock.current = false; }
  };

  const handleRenameSite = async (id: string, name: string) => {
    assertWritable();
    if (siteLock.current) throw new Error('현장 처리 중입니다. 잠시 후 다시 시도해주세요.');
    const target = sites.find(site => site.id === id);
    if (!target) throw new Error('이름을 바꿀 현장을 다시 선택해주세요.');
    const nextName = name.trim();
    if (nextName === target.name) return;
    assertNewSiteName(sites, nextName, id);
    siteLock.current = true;
    try {
      const renamed = sites.map(site => site.id === id ? { ...site, name: nextName } : site);
      if (isSupabase && supabase) {
        const { data, error } = await supabase.from('sites').update({ name: nextName }).eq('id', id).select('id').maybeSingle();
        if (error || !data) throw new Error('현장명 변경에 실패했습니다. 입력 내용은 유지됩니다. 연결과 권한을 확인해주세요.');
      } else {
        writeLocalData(localStorage, { sites, logs }, { sites: renamed, logs });
      }
      setSites(renamed);
    } finally { siteLock.current = false; }
  };

  // 종료 처리 (closedAt = 'YYYY-MM-DD') or 다시 진행 (closedAt = null); records stay untouched either way.
  const handleSetSiteStatus = async (id: string, closedAt: string | null) => {
    assertWritable();
    if (siteLock.current) throw new Error('현장 처리 중입니다. 잠시 후 다시 시도해주세요.');
    const target = sites.find(site => site.id === id);
    if (!target) throw new Error('상태를 바꿀 현장을 다시 선택해주세요.');
    if (closedAt !== null && !validDate(closedAt)) throw new Error('종료일을 올바르게 입력해주세요.');
    const change = { status: closedAt ? 'closed' as const : 'active' as const, closed_at: closedAt };
    siteLock.current = true;
    try {
      const updated = sites.map(site => site.id === id ? { ...site, ...change } : site);
      if (isSupabase && supabase) {
        const { data, error } = await supabase.from('sites').update(change).eq('id', id).select('id').maybeSingle();
        if (error || !data) throw new Error(`현장 ${closedAt ? '종료' : '다시 진행'} 처리에 실패했습니다. 연결과 권한을 확인해주세요.`);
      } else {
        writeLocalData(localStorage, { sites, logs }, { sites: updated, logs });
      }
      setSites(updated);
      // Closing the site being worked on moves to the first 진행 site, so the screen does not turn read-only by surprise.
      if (closedAt && selectedSiteId === id) setSelectedSiteId(sortSites(updated).find(site => !isClosedSite(site))?.id || id);
    } finally { siteLock.current = false; }
  };

  const handleDeleteSite = async (id: string) => {
    assertWritable();
    if (siteLock.current) throw new Error('현장 처리 중입니다. 잠시 후 다시 시도해주세요.');
    const target = sites.find(site => site.id === id);
    if (!target) throw new Error('삭제할 현장을 다시 선택해주세요.');
    const progress = localStorage.getItem(`cp_pouring_progress_v1:${id}`);
    if (!confirm(`'${target.name}'${target.code ? ` (${target.code})` : ''} 현장을 삭제하시겠습니까?\n현장 ID: ${target.id}\n기존 일지 ${logs.filter(log => log.site_id === id).length}건 · 타설현황 ${progress ? '있음' : '없음'}\n이 브라우저에 복구용 보관본을 먼저 저장한 뒤 현장 목록과 연결 기록에서 제거합니다.${isSupabase ? '\nDB 현장 복원은 추후 DB 연결 작업에서 진행해야 합니다.' : '\n현장 관리의 보관된 현장에서 복원할 수 있습니다.'}`)) return;
    siteLock.current = true;
    try {
      const archive = archiveSite(localStorage, target, logs, isSupabase ? 'cloud' : 'local');
      refreshArchives();
      let remaining = sites.filter(site => site.id !== id), remainingLogs = logs.filter(log => log.site_id !== id);
      if (isSupabase && supabase) {
        const { error } = await supabase.from('sites').delete().eq('id', id);
        if (error) throw new Error('DB 현장 삭제에 실패했습니다. 목록과 기록은 유지됩니다.');
        // DB changes cannot be rolled back with browser storage; keep the recovery copy.
        try { localStorage.removeItem(`cp_pouring_progress_v1:${id}`); }
        catch { alert('DB 현장은 삭제되었으나 브라우저 현황 정리에 실패했습니다. 복구용 보관본을 내려받아 보관해주세요.'); }
      } else {
        const next = removeLocalSite(localStorage, sites, logs, archive);
        remaining = next.sites; remainingLogs = next.logs;
      }
      setSites(remaining); setLogs(remainingLogs);
      if (selectedSiteId === id) setSelectedSiteId(remaining.find(site => !isClosedSite(site))?.id || remaining[0]?.id || '');
    } finally { siteLock.current = false; }
  };

  const handleRestoreSite = async (key: string) => {
    assertWritable();
    if (siteLock.current) throw new Error('현장 처리 중입니다. 잠시 후 다시 시도해주세요.');
    if (isSupabase) throw new Error('DB 모드에서는 보관본을 내려받아 별도 복원해주세요.');
    const archive = listSiteArchives(localStorage).find(item => item.key === key);
    if (!archive) throw new Error('복원할 보관본을 찾지 못했습니다.');
    siteLock.current = true;
    try {
      const next = restoreLocalSite(localStorage, sites, logs, archive);
      setSites(next.sites); setLogs(next.logs); setSelectedSiteId(archive.site.id);
      refreshArchives();
    } finally { siteLock.current = false; }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!ready || dataIssue) { setOperationError('자료 읽기 오류를 해결한 뒤 내보내주세요.'); return; }
    if (!currentSite) {
      alert('내보낼 현장을 선택해주세요.');
      return;
    }
    const headers = ['구분', '일자', '동(구역)', '층', '벽/슬라브', '최저온도(°C)', '최고온도(°C)', '기상', '레미콘사', '타설강도', '타설물량(m³)', '양생-살수', '양생-보양', '비고'];
    
    const rows = outputLogs.map((log, index) => [
      index + 1,
      log.date,
      log.building,
      log.floor,
      log.member_type,
      log.min_temp ?? '',
      log.max_temp ?? '',
      log.weather,
      log.remicon_company,
      normalizeStrength(log.strength),
      log.volume ?? '',
      normalizeWatering(log.curing_watering),
      log.curing_protection,
      log.remarks || '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map(csvCell).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${currentSite?.name || '현장'}_콘크리트_타설_양생_일지.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (isPrintViewOpen) {
    return (
      <PrintView
        logs={outputLogs}
        sites={currentSite ? [currentSite] : []}
        description={outputDescription}
        currentSite={currentSite}
        onBack={() => setIsPrintViewOpen(false)}
      />
    );
  }

  return (
    <div className="concrete-app min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {process.env.NEXT_PUBLIC_CON1_QA === 'true' && <div className="bg-slate-800 text-slate-300 px-4 py-2 text-xs print:hidden">검증용 분리 실행 · 운영 DB 미연결 · 이 포트의 브라우저 데이터만 사용합니다.</div>}
      
      {/* Header Navigation */}
      <Header
        sites={pickerSites(sites, currentSite?.id || '')}
        selectedSiteId={selectedSiteId}
        onSelectSite={id => { if (!siteLock.current && canLeavePhotos()) { setSelectedSiteId(id); setFilters(emptyLogFilters()); setNotice(''); } }}
        onOpenAddSite={openSiteManager}
        onOpenHome={() => { if (initialView !== 'logs') { if (currentSite) openPage('logs'); else if (canLeavePhotos()) window.location.assign('/'); } }}
        onOpenPrintView={() => {
          if (!canLeavePhotos()) return;
          if (!ready || dataIssue || !currentSite) { setOperationError('현장을 선택하고 자료를 정상적으로 불러온 뒤 출력해주세요.'); return; }
          if (initialView === 'progress') window.print(); else setIsPrintViewOpen(true);
        }}
        onExportExcel={initialView === 'progress' ? () => window.dispatchEvent(new Event('cp-progress-export')) : handleExportCSV}
        isSupabase={isSupabase}
        isProgress={initialView === 'progress'}
        isPhotos={initialView === 'photos'}
        onOpenPhotos={() => openPage(initialView === 'photos' ? 'logs' : 'photos')}
        onOpenProgress={() => openPage(initialView === 'progress' ? 'logs' : 'progress')}
      />

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {dataIssue && <div className="progress-error" role="alert">{dataIssue}<button className="ui-button" onClick={() => { if (confirm('작성 중인 내용을 따로 보관하셨나요? 새로고침하면 저장하지 않은 입력은 사라집니다.')) window.location.reload(); }}>새로고침</button></div>}
        {/* DB mode has no whole-app backup, so the menu only appears for browser storage. */}
        {!loading && !isSupabase && <BackupManager cloud={isSupabase} blocked={!ready || !!dataIssue} loading={loading} siteId={selectedSiteId} />}
        {readOnly && currentSite && <div className="site-closed-band" role="status"><span>종료된 현장입니다{currentSite.closed_at ? ` (${shortDate(currentSite.closed_at, '.')} 종료)` : ''} · 읽기 전용</span>
          <button type="button" className="ui-button ui-primary" disabled={!ready || !!dataIssue} onClick={() => { if (confirm(`'${currentSite.name}'을(를) 다시 진행 현장으로 바꿀까요?`)) handleSetSiteStatus(currentSite.id, null).catch(e => setOperationError(e instanceof Error ? e.message : '다시 진행 처리에 실패했습니다.')); }}>다시 진행</button></div>}
        {operationError && <p className="progress-error" role="alert">{operationError}</p>}
        <p className="ui-note" role="status">{logBusy ? '저장 중입니다.' : notice}</p>
      </div>
      {/* Main Content Body: the strip above already gives 16px under the header, so only add space when it shows something. */}
      <main className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-6 ${dataIssue || operationError || logBusy || notice || (!loading && !isSupabase) ? 'pt-3' : 'pt-0'}`}>
        
        {/* Summary Counter & Alert Cards */}
        {initialView === 'logs' && <SummaryCards logs={viewedLogs} />}

        {/* Concrete Pouring & Curing Log Table */}
        {initialView === 'photos' ? loading ? <p role="status">현장을 불러오는 중입니다.</p> : currentSite ? <SitePhotos key={currentSite.id} site={currentSite} blocked={!ready || !!dataIssue || readOnly} onWorkPending={value=>{photoWorkPending.current=value;}} /> : <div className="progress-empty">현장을 먼저 선택하거나 추가해주세요.</div> : initialView === 'progress' ? loading ? <p className="ui-note" role="status">현장을 불러오는 중입니다.</p> : currentSite ? <PouringProgress key={currentSite.id} site={currentSite} readOnly={readOnly} onWorkPending={value=>{progressWorkPending.current=value;}} /> : <div className="progress-empty"><h2 className="ui-page-title">현장을 먼저 추가해주세요</h2><button className="ui-button ui-primary" onClick={openSiteManager}>현장 추가</button></div> : loading ? <p role="status">일지를 불러오는 중입니다.</p> : <RecordTable
          key={currentSite?.id || 'empty'}
          logs={siteLogs}
          filters={filters}
          onFiltersChange={setFilters}
          outputScope={outputScope}
          onOutputScopeChange={setOutputScope}
          sort={logSort}
          onSortChange={setLogSort}
          busy={logBusy}
          onWorkPending={value=>{logWorkPending.current=value;}}
          blocked={!ready || !!dataIssue}
          readOnly={readOnly}
          site={currentSite}
          onDeleteLog={handleDeleteLog}
          onQuickAddLog={(inputData) => handleSaveLog(inputData)}
          onQuickUpdateLog={(id, inputData) => handleSaveLog(inputData, id)}
        />}

      </main>

      {/* Modals */}
      <SiteModal
        isOpen={isSiteModalOpen}
        onClose={() => setIsSiteModalOpen(false)}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSelectSite={id => { if (!siteLock.current && canLeavePhotos()) { setSelectedSiteId(id); setFilters(emptyLogFilters()); setNotice(''); } }}
        onAddSite={handleAddSite}
        onRenameSite={handleRenameSite}
        onDeleteSite={handleDeleteSite}
        onSetSiteStatus={handleSetSiteStatus}
        archives={archives}
        archiveError={archiveError}
        canRestore={!isSupabase}
        onRestoreSite={handleRestoreSite}
      />

    </div>
  );
}
