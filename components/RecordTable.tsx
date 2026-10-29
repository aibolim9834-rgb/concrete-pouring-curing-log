'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PouringLog, PouringLogInput, Site } from '@/lib/types';
import { newLog, reuseLogBasics, filterLogs, LogFilters, LogSort, LogSortKey } from '@/lib/log-data';
import { WateringSelect } from './WateringSelect';
import { MobileLogSheet } from './MobileLogSheet';
import { normalizeWatering } from '@/lib/watering';
import { normalizeStrength } from '@/lib/strength';
import { 
  Search, 
  Edit3, 
  Trash2, 
  Sun, 
  Cloud, 
  CloudRain, 
  Snowflake,
  Plus,
  Filter,
  Check,
  X
} from 'lucide-react';

interface RecordTableProps {
  logs: PouringLog[];
  site: Site | undefined;
  onDeleteLog: (id: string) => void;
  onQuickAddLog?: (data: PouringLogInput) => Promise<void>;
  onQuickUpdateLog?: (id: string, data: PouringLogInput) => Promise<void>;
  filters: LogFilters; onFiltersChange: (filters: LogFilters) => void;
  outputScope: 'filtered' | 'all'; onOutputScopeChange: (scope: 'filtered' | 'all') => void;
  sort: LogSort; onSortChange: (sort: LogSort) => void;
  busy?: boolean; blocked?: boolean;
  onWorkPending?: (pending: boolean) => void;
}

export const RecordTable: React.FC<RecordTableProps> = ({
  logs,
  site,
  onDeleteLog,
  onQuickAddLog,
  onQuickUpdateLog, filters, onFiltersChange, outputScope, onOutputScopeChange, sort, onSortChange, busy = false, blocked = false, onWorkPending,
}) => {
  const searchQuery = filters.search, weatherFilter = filters.weather;
  const setSearchQuery = (search: string) => onFiltersChange({ ...filters, search });
  const setWeatherFilter = (weather: string) => onFiltersChange({ ...filters, weather });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  // Inline editing state for existing row
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingRowData, setEditingRowData] = useState<PouringLogInput | null>(null);
  const editingRowRef = useRef<HTMLTableRowElement>(null);

  // Quick New Row State (Always available empty input row above existing records)
  const [newRowData, setNewRowData] = useState<PouringLogInput>(() => newLog(site?.id, String(logs.length + 1)));
  // Phones start with the filter block folded so the table is reachable without scrolling past it.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [filters.from, filters.to, filters.building, filters.floor, filters.member].filter(Boolean).length;
  // Phones enter and edit logs in a full-screen sheet: undefined = closed, null = new log.
  const [sheetLog, setSheetLog] = useState<PouringLog | null | undefined>(undefined);
  const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 760px)').matches;
  const workPending = pending || editingRowId !== null || sheetLog !== undefined;
  useEffect(() => {
    onWorkPending?.(workPending);
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (workPending) window.addEventListener('beforeunload', prevent);
    return () => { onWorkPending?.(false); if (workPending) window.removeEventListener('beforeunload', prevent); };
  }, [workPending, onWorkPending]);
  const filteredLogs = filterLogs(logs, filters);
  const sortState = (key: LogSortKey) => sort.key === key ? sort.direction === 'asc' ? 'ascending' as const : 'descending' as const : undefined;
  function sortButton(label: string, key: LogSortKey) {
    const active = sort.key === key, next = active && sort.direction === 'asc' ? 'desc' : 'asc';
    return <button type="button" className="log-sort-button" onClick={() => onSortChange({ key, direction: next })} title={`${label} ${next === 'asc' ? '오름차순' : '내림차순'}으로 정렬`}>
      <span>{label}</span><span className="log-sort-icon" aria-hidden="true">{active ? sort.direction === 'asc' ? '▲' : '▼' : '↕'}</span>
    </button>;
  }

  const getWeatherIcon = (weather: string) => {
    switch (weather) {
      case '맑음':
        return <Sun className="w-3.5 h-3.5 text-amber-400 inline mr-1" />;
      case '흐림':
        return <Cloud className="w-3.5 h-3.5 text-slate-400 inline mr-1" />;
      case '비':
        return <CloudRain className="w-3.5 h-3.5 text-blue-400 inline mr-1" />;
      case '눈':
        return <Snowflake className="w-3.5 h-3.5 text-blue-400 inline mr-1" />;
      default:
        return null;
    }
  };

  // Handle Quick Add submit from the empty row
  const handleQuickAddSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (lock.current) return;
    lock.current = true; setPending(true); setError('');
    try {
      if (!onQuickAddLog) throw new Error('등록 경로를 확인해주세요.');
      await onQuickAddLog({ ...newRowData, site_id: site?.id || '' });
      setNewRowData(newLog(site?.id, String(logs.length + 2)));
    } catch (e) { setError(e instanceof Error ? e.message : '저장에 실패했습니다. 입력은 유지됩니다.'); }
    finally { lock.current = false; setPending(false); }
  };

  // Start inline edit for a row
  const startInlineEdit = (log: PouringLog) => {
    if (editingRowId || lock.current || busy || blocked) return;
    setEditingRowId(log.id);
    setEditingRowData({
      site_id: log.site_id,
      category: log.category,
      date: log.date,
      building: log.building,
      floor: log.floor,
      member_type: log.member_type,
      min_temp: log.min_temp,
      max_temp: log.max_temp,
      weather: log.weather,
      remicon_company: log.remicon_company,
      strength: log.strength || '',
      volume: log.volume !== null && log.volume !== undefined ? log.volume : '',
      curing_watering: log.curing_watering,
      curing_protection: log.curing_protection,
      remarks: log.remarks || '',
    });
  };

  // Save inline edit
  const saveInlineEdit = useCallback(async (id: string) => {
    if (!editingRowData || lock.current) return;
    lock.current = true; setPending(true); setError('');
    try {
      if (!onQuickUpdateLog) throw new Error('수정 경로를 확인해주세요.');
      await onQuickUpdateLog(id, editingRowData);
      setEditingRowId(null); setEditingRowData(null);
    } catch (e) { setError(e instanceof Error ? e.message : '저장에 실패했습니다. 입력은 유지됩니다.'); }
    finally { lock.current = false; setPending(false); }
  }, [editingRowData, onQuickUpdateLog]);

  useEffect(() => {
    if (!editingRowId) return;
    const saveOutsideRow = (event: PointerEvent) => {
      if (event.target instanceof Node && editingRowRef.current && !editingRowRef.current.contains(event.target)) {
        void saveInlineEdit(editingRowId);
      }
    };
    document.addEventListener('pointerdown', saveOutsideRow, true);
    return () => document.removeEventListener('pointerdown', saveOutsideRow, true);
  }, [editingRowId, saveInlineEdit]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
      
      {error && <p className="progress-error" role="alert">{error}</p>}
      <fieldset disabled={busy || pending || blocked || !site}>
      {/* Table Top Toolbar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="ui-section-title">타설 일지</h2>
          <span className="text-xs text-slate-400 font-medium">
            조회 {filteredLogs.length}건 / 전체 {logs.length}건
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Search bar */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="일지 검색"
              placeholder="날짜, 위치, 레미콘사, 비고 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-slate-500"
            />
          </div>

          {/* Weather Filter */}
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              aria-label="기상 필터"
              value={weatherFilter}
              onChange={(e) => setWeatherFilter(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">기상 전체</option>
              <option value="">미입력</option>
                  <option value="맑음">맑음</option>
              <option value="흐림">흐림</option>
              <option value="비">비</option>
              <option value="눈">눈</option>
            </select>
          </div>

        </div>
      </div>

      <button type="button" className="log-filters-toggle ui-button" aria-expanded={filtersOpen} aria-controls="log-filters" onClick={() => setFiltersOpen(open => !open)}>
        조회 조건 {filtersOpen ? '접기' : '펼치기'}<span className="ui-note">적용 {activeFilterCount}개</span>
      </button>
      <div id="log-filters" className={`log-filters${filtersOpen ? '' : ' is-collapsed'}`}>
        <button className="ui-button" disabled={!logs.length} onClick={() => {
          const latest = [...logs].sort((a,b) => b.date.localeCompare(a.date))[0];
          if (!latest) return;
          if ((newRowData.building || newRowData.floor || newRowData.remicon_company || newRowData.volume !== '' || newRowData.curing_watering || newRowData.curing_protection) && !confirm('작성 중인 새 행을 초기화하고 최근 일지의 동·부위·레미콘사·강도를 불러오시겠습니까?')) return;
          setNewRowData(reuseLogBasics(latest, String(logs.length + 1))); setError('');
        }}>최근 일지 기본정보 불러오기</button>
        <label htmlFor="logs-from">시작일<input id="logs-from" type="date" value={filters.from} onChange={e => onFiltersChange({ ...filters, from: e.target.value })} /></label>
        <label htmlFor="logs-to">종료일<input id="logs-to" type="date" value={filters.to} onChange={e => onFiltersChange({ ...filters, to: e.target.value })} /></label>
        {(['building','floor','member'] as const).map((key, i) => <label key={key} htmlFor={`logs-${key}`}>{['동(구역)','층','구조부위'][i]}<select id={`logs-${key}`} value={filters[key]} onChange={e => onFiltersChange({ ...filters, [key]: e.target.value })}><option value="">전체</option>{Array.from(new Set(logs.map(log => log[key === 'member' ? 'member_type' : key]))).filter(Boolean).sort((a,b) => a.localeCompare(b, 'ko', { numeric: true })).map(value => <option key={value}>{value}</option>)}</select></label>)}
        <button className="ui-button" onClick={() => onFiltersChange({ search: '', weather: 'ALL', from: '', to: '', building: '', floor: '', member: '' })}>조회 초기화</button>
        <label htmlFor="logs-output">출력·CSV 범위<select id="logs-output" value={outputScope} onChange={e => onOutputScopeChange(e.target.value as 'filtered' | 'all')}><option value="filtered">현재 조회 결과 {filteredLogs.length}건</option><option value="all">현장 전체 {logs.length}건</option></select></label>
        <p className="ui-note">조회 {filteredLogs.length}건 · 물량 합계 {filteredLogs.reduce((sum, log) => sum + Number(log.volume || 0), 0).toLocaleString('ko-KR')}m³</p>
        {filters.from && filters.to && filters.from > filters.to && <p className="progress-error" role="alert">시작일이 종료일보다 늦습니다.</p>}
      </div>
      {/* Main Excel-styled Responsive Table */}
      <div className="record-log-wrap overflow-x-auto" role="region" aria-label="타설 일지 표" tabIndex={0}>
        <table className="record-log-table w-full text-xs text-left text-slate-300 border-collapse">
          <caption className="sr-only">타설 일지. 열 제목을 누르면 오름차순 또는 내림차순으로 정렬합니다. 구분은 현재 조회 순서의 자동 번호입니다.</caption>
          <colgroup>
            {/* 번호, 일자, 동, 층, 부위, 최저·최고온도, 기상, 업체, 강도, 물량, 살수·보양, 관리 */}
            {[2.5, 8.5, 16.5, 6.5, 6.5, 4.5, 4.5, 4.5, 6.5, 9.5, 6, 7, 10, 7].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
          </colgroup>
          <thead>
            {/* Row 1 Headers */}
            <tr className="bg-slate-950 text-slate-300 font-bold border-b border-slate-800 text-center">
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 w-12">
                구분
              </th>
              <th scope="col" aria-sort={sortState('date')} rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[100px]">
                {sortButton('일자', 'date')}
              </th>
              <th scope="colgroup" colSpan={3} className="px-3 py-2 border-r border-slate-800 bg-slate-950 text-amber-400">
                타설위치
              </th>
              <th scope="col" aria-sort={sortState('min_temp')} rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[65px]">
                {sortButton('최저온도', 'min_temp')}
              </th>
              <th scope="col" aria-sort={sortState('max_temp')} rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[65px]">
                {sortButton('최고온도', 'max_temp')}
              </th>
              <th scope="col" aria-sort={sortState('weather')} rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[90px]">
                {sortButton('기상', 'weather')}
              </th>
              <th scope="col" aria-sort={sortState('remicon_company')} rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[100px]">
                {sortButton('레미콘사', 'remicon_company')}
              </th>
              <th scope="col" aria-sort={sortState('strength')} rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[85px] text-amber-300">
                {sortButton('타설강도', 'strength')}
              </th>
              <th scope="col" aria-sort={sortState('volume')} rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[85px] text-amber-300">
                {sortButton('타설물량', 'volume')}
              </th>
              <th scope="colgroup" colSpan={2} className="px-3 py-2 border-r border-slate-800 bg-slate-950 text-amber-400">
                양생방법
              </th>
              <th rowSpan={2} className="px-2 py-3 min-w-[80px]">
                관리
              </th>
            </tr>

            {/* Row 2 Headers for Spanned Columns */}
            <tr className="bg-slate-900 text-slate-400 font-bold border-b border-slate-800 text-center">
              <th scope="col" aria-sort={sortState('building')} className="px-2 py-2 border-r border-slate-800 min-w-[85px]">{sortButton('동(구역)', 'building')}</th>
              <th scope="col" aria-sort={sortState('floor')} className="px-2 py-2 border-r border-slate-800 min-w-[60px]">{sortButton('층', 'floor')}</th>
              <th scope="col" aria-sort={sortState('member_type')} className="px-2 py-2 border-r border-slate-800 min-w-[80px]">{sortButton('벽/슬라브', 'member_type')}</th>
              <th scope="col" aria-sort={sortState('curing_watering')} className="px-2 py-2 border-r border-slate-800 min-w-[120px]">{sortButton('살수', 'curing_watering')}</th>
              <th scope="col" aria-sort={sortState('curing_protection')} className="px-2 py-2 border-r border-slate-800 min-w-[130px]">{sortButton('보양', 'curing_protection')}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            
            {/* ✏️ ALWAYS-AVAILABLE BLANK INPUT ROW ABOVE EXISTING RECORDS (직접 입력 빈칸 행) */}
            <tr className="log-quick-add-row bg-amber-950/20 border-t-2 border-dashed border-amber-500/50 hover:bg-amber-950/30 transition">
              {/* 구분 */}
              <td className="p-1.5 border-r border-slate-800 text-center text-slate-400">자동</td>

              {/* 일자 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="date"
                  aria-label="새 일지 일자"
                  value={newRowData.date}
                  onChange={(e) => setNewRowData({ ...newRowData, date: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-[11px] text-slate-200 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 동(구역) */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="예: 101동"
                  aria-label="새 일지 동·구역"
                  value={newRowData.building}
                  onChange={(e) => setNewRowData({ ...newRowData, building: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 층 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="예: 15층"
                  aria-label="새 일지 층"
                  value={newRowData.floor}
                  onChange={(e) => setNewRowData({ ...newRowData, floor: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-center text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 벽/슬라브 */}
              <td className="p-1.5 border-r border-slate-800">
                <select
                  aria-label="새 일지 구조부위"
                  value={newRowData.member_type}
                  onChange={(e) => setNewRowData({ ...newRowData, member_type: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-slate-200 focus:ring-1 focus:ring-amber-500"
                >
                  <option value="슬라브">슬라브</option>
                  <option value="벽체">벽체</option>
                  <option value="기둥/보">기둥/보</option>
                  <option value="기초(MAT)">기초(MAT)</option>
                  <option value="계단/기타">계단/기타</option>
                </select>
              </td>

              {/* 최저온도 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="number"
                  step="0.1"
                  placeholder="온도"
                  aria-label="새 일지 최저온도"
                  value={newRowData.min_temp ?? ''}
                  onChange={(e) => setNewRowData({ ...newRowData, min_temp: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-center text-blue-400 font-semibold placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 최고온도 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="number"
                  step="0.1"
                  placeholder="온도"
                  aria-label="새 일지 최고온도"
                  value={newRowData.max_temp ?? ''}
                  onChange={(e) => setNewRowData({ ...newRowData, max_temp: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-center text-red-400 font-semibold placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 기상 */}
              <td className="p-1.5 border-r border-slate-800">
                <select
                  aria-label="새 일지 기상"
                  value={newRowData.weather}
                  onChange={(e) => setNewRowData({ ...newRowData, weather: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-slate-200 focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">미입력</option>
                  <option value="맑음">맑음 ☀️</option>
                  <option value="흐림">흐림 ☁️</option>
                  <option value="비">비 🌧️</option>
                  <option value="눈">눈 ❄️</option>
                </select>
              </td>

              {/* 레미콘사 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="레미콘사"
                  aria-label="새 일지 레미콘사"
                  value={newRowData.remicon_company}
                  onChange={(e) => setNewRowData({ ...newRowData, remicon_company: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 타설강도 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="강도"
                  aria-label="새 일지 타설강도"
                  title="숫자만 입력하면 MPa가 자동으로 붙습니다."
                  value={newRowData.strength || ''}
                  onChange={(e) => setNewRowData({ ...newRowData, strength: e.target.value })}
                  onBlur={(e) => { const strength = normalizeStrength(e.target.value); setNewRowData(current => ({ ...current, strength })); }}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-center text-amber-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 타설물량 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="number"
                  step="0.1"
                  placeholder="물량"
                  aria-label="새 일지 타설물량"
                  value={newRowData.volume ?? ''}
                  onChange={(e) => setNewRowData({ ...newRowData, volume: e.target.value ? parseFloat(e.target.value) : '' })}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-center text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 살수 */}
              <td className="p-1.5 border-r border-slate-800">
                <WateringSelect
                  aria-label="새 일지 살수"
                  value={newRowData.curing_watering}
                  onChange={(e) => setNewRowData({ ...newRowData, curing_watering: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-emerald-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 보양 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="보양 내용"
                  aria-label="새 일지 보양"
                  value={newRowData.curing_protection}
                  onChange={(e) => setNewRowData({ ...newRowData, curing_protection: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-amber-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 빠른 행 추가 저장 버튼 */}
              <td className="p-1.5 text-center whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleQuickAddSubmit()}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-2 py-1 rounded-[5px] text-xs flex items-center justify-center gap-1 shadow transition"
                  title="이 행에 기록 입력 추가"
                >
                  <Plus className="w-3.5 h-3.5" /> 추가
                </button>
              </td>
            </tr>

            {/* Existing Rows */}
            {filteredLogs.map((log, index) => {
              const isEditing = editingRowId === log.id;
              const isColdTemp = log.min_temp !== null && log.min_temp <= 0;
              const isHotTemp = log.max_temp !== null && log.max_temp > 30;

              if (isEditing && editingRowData) {
                // INLINE EDITING ROW
                return (
                    <tr key={log.id} ref={editingRowRef} className="bg-amber-950/30 border-2 border-amber-500/60"
                      onBlur={(event) => {
                        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) void saveInlineEdit(log.id);
                      }}>
                    <td className="p-1 border-r border-slate-800 text-center">{index + 1}</td>
                    <td className="p-1 border-r border-slate-800 text-center">
                      <input
                        type="date"
                        aria-label="수정 일지 일자"
                        value={editingRowData.date}
                        onChange={(e) => setEditingRowData({ ...editingRowData, date: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-[11px] text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        aria-label="수정 일지 동·구역"
                        value={editingRowData.building}
                        onChange={(e) => setEditingRowData({ ...editingRowData, building: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-amber-300"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        aria-label="수정 일지 층"
                        value={editingRowData.floor}
                        onChange={(e) => setEditingRowData({ ...editingRowData, floor: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-center text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <select
                        aria-label="수정 일지 구조부위"
                        value={editingRowData.member_type}
                        onChange={(e) => setEditingRowData({ ...editingRowData, member_type: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-xs text-white"
                      >
                        <option value="슬라브">슬라브</option>
                        <option value="벽체">벽체</option>
                        <option value="기둥/보">기둥/보</option>
                        <option value="기초(MAT)">기초(MAT)</option>
                        <option value="계단/기타">계단/기타</option>
                      </select>
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="number"
                        step="0.1"
                        aria-label="수정 일지 최저온도"
                        value={editingRowData.min_temp ?? ''}
                        onChange={(e) => setEditingRowData({ ...editingRowData, min_temp: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-xs text-center text-blue-400 font-semibold"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="number"
                        step="0.1"
                        aria-label="수정 일지 최고온도"
                        value={editingRowData.max_temp ?? ''}
                        onChange={(e) => setEditingRowData({ ...editingRowData, max_temp: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-xs text-center text-red-400 font-semibold"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <select
                        aria-label="수정 일지 기상"
                        value={editingRowData.weather}
                        onChange={(e) => setEditingRowData({ ...editingRowData, weather: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-xs text-white"
                      >
                        <option value="">미입력</option>
                  <option value="맑음">맑음</option>
                        <option value="흐림">흐림</option>
                        <option value="비">비</option>
                        <option value="눈">눈</option>
                      </select>
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        aria-label="수정 일지 레미콘사"
                        value={editingRowData.remicon_company}
                        onChange={(e) => setEditingRowData({ ...editingRowData, remicon_company: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        aria-label="수정 일지 타설강도"
                        title="숫자만 입력하면 MPa가 자동으로 붙습니다."
                        value={editingRowData.strength || ''}
                        onChange={(e) => setEditingRowData({ ...editingRowData, strength: e.target.value })}
                        onBlur={(e) => { const strength = normalizeStrength(e.target.value); setEditingRowData(current => current ? { ...current, strength } : current); }}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-center text-amber-300"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="number"
                        step="0.1"
                        aria-label="수정 일지 타설물량"
                        value={editingRowData.volume ?? ''}
                        onChange={(e) => setEditingRowData({ ...editingRowData, volume: e.target.value ? parseFloat(e.target.value) : '' })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-center text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <WateringSelect
                        aria-label="수정 일지 살수"
                        value={editingRowData.curing_watering}
                        onChange={(e) => setEditingRowData({ ...editingRowData, curing_watering: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-emerald-300"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        aria-label="수정 일지 보양"
                        value={editingRowData.curing_protection}
                        onChange={(e) => setEditingRowData({ ...editingRowData, curing_protection: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-amber-300"
                      />
                    </td>
                    <td className="p-1 text-center whitespace-nowrap">
                      <div className="record-row-actions flex items-center justify-center">
                        <button
                          onClick={() => saveInlineEdit(log.id)}
                          title="저장"
                          className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow transition"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingRowId(null);
                            setEditingRowData(null);
                          }}
                          title="취소"
                          className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              // DISPLAY ROW
              return (
                <tr
                  key={log.id}
                  onClick={(event) => {
                    if (!isPhone() || (event.target as HTMLElement).closest('button') || busy || pending || blocked || !site || editingRowId) return;
                    setSheetLog(log);
                  }}
                  onDoubleClick={(event) => {
                    if (busy || pending || blocked || !site || editingRowId) return;
                    const cell = (event.target as HTMLElement).closest('td');
                    if (!cell || cell.cellIndex === 0 || cell.cellIndex === 13) return;
                    startInlineEdit(log);
                  }}
                  className={`record-display-row transition group ${
                    index % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900'
                  }`}
                >
                  <td className="px-2 py-3 text-center border-r border-slate-800/80 font-medium text-slate-400">
                    {index + 1}
                  </td>
                  <td className="px-2 py-3 text-center border-r border-slate-800/80 font-semibold text-slate-200 whitespace-nowrap">
                    {log.date}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 text-amber-300 font-medium whitespace-nowrap">
                    {log.building}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 text-center font-medium text-slate-300 whitespace-nowrap">
                    {log.floor}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 font-medium text-slate-200 whitespace-nowrap">
                    <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[11px]">
                      {log.member_type}
                    </span>
                  </td>
                  <td className={`log-temperature-cell px-2 py-3 border-r border-slate-800/80 text-center font-semibold ${
                    isColdTemp ? 'is-cold text-blue-400' : 'text-slate-300'
                  }`} title={isColdTemp ? '최저온도 0℃ 이하' : undefined}>
                    {log.min_temp !== null ? `${log.min_temp}°C` : '-'}
                  </td>
                  <td className={`log-temperature-cell px-2 py-3 border-r border-slate-800/80 text-center font-semibold ${
                    isHotTemp ? 'is-hot text-red-400' : 'text-slate-300'
                  }`} title={isHotTemp ? '최고온도 30℃ 초과' : undefined}>
                    {log.max_temp !== null ? `${log.max_temp}°C` : '-'}
                  </td>
                  <td className="px-2 py-3 border-r border-slate-800/80 text-center font-medium text-slate-300 whitespace-nowrap">
                    {getWeatherIcon(log.weather)}
                    {log.weather}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 font-medium text-slate-300 truncate max-w-[120px]">
                    {log.remicon_company || '-'}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 text-center font-semibold text-amber-300 whitespace-nowrap">
                    {normalizeStrength(log.strength) || '-'}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 text-center font-semibold text-slate-200 whitespace-nowrap">
                    {log.volume !== null && log.volume !== undefined && log.volume !== '' ? `${log.volume} m³` : '-'}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 text-slate-300">
                    {log.curing_watering ? (
                      <span className="text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded text-[11px] block truncate">
                        {normalizeWatering(log.curing_watering)}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 text-slate-300">
                    {log.curing_protection ? (
                      <span className="text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded text-[11px] block truncate">
                        {log.curing_protection}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center whitespace-nowrap">
                    <div className="record-row-actions flex items-center justify-center opacity-90 group-hover:opacity-100">
                      <button
                        onClick={() => isPhone() ? setSheetLog(log) : startInlineEdit(log)}
                        title="셀 직접 수정"
                        className="p-1.5 text-slate-400 hover:text-amber-400 rounded transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteLog(log.id)}
                        title="삭제"
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
        <p className="log-footer-phone">아래 <strong>+ 새 일지</strong>로 입력하고, 표의 줄을 누르면 그 일지를 고치거나 지울 수 있습니다.</p>
        <div className="log-footer-desktop flex items-center gap-2">
          <span>✏️ <strong className="text-amber-400">표 직접 입력:</strong> 표 상단의 입력 행에 직접 입력 후 <strong className="text-slate-200">[추가]</strong> 또는 엔터를 누르면 바로 기록됩니다.</span>
        </div>
        <div className="log-footer-desktop">
          등록된 데이터 칸을 더블클릭해 수정하고, 행 밖을 누르면 자동 저장됩니다.
        </div>
      </div>
      <div className="log-new-dock"><button type="button" className="log-new-button" onClick={() => setSheetLog(null)}>+ 새 일지</button></div>

      </fieldset>
      {sheetLog !== undefined && <MobileLogSheet key={sheetLog?.id || 'new'} log={sheetLog} logs={logs} site={site}
        onAdd={async data => { if (!onQuickAddLog) throw new Error('등록 경로를 확인해주세요.'); await onQuickAddLog(data); }}
        onUpdate={async (id, data) => { if (!onQuickUpdateLog) throw new Error('수정 경로를 확인해주세요.'); await onQuickUpdateLog(id, data); }}
        onDelete={onDeleteLog} onClose={() => setSheetLog(undefined)} />}
    </div>
  );
};
