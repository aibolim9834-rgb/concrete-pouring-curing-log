'use client';

import React, { useState } from 'react';
import { PouringLog, PouringLogInput, Site } from '@/lib/types';
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
  X,
  Save
} from 'lucide-react';

interface RecordTableProps {
  logs: PouringLog[];
  site: Site | undefined;
  onEditLog: (log: PouringLog) => void;
  onDeleteLog: (id: string) => void;
  onAddLog: () => void;
  onQuickAddLog?: (data: PouringLogInput) => void;
  onQuickUpdateLog?: (id: string, data: PouringLogInput) => void;
}

export const RecordTable: React.FC<RecordTableProps> = ({
  logs,
  site,
  onEditLog,
  onDeleteLog,
  onAddLog,
  onQuickAddLog,
  onQuickUpdateLog,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [weatherFilter, setWeatherFilter] = useState('ALL');

  // Inline editing state for existing row
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingRowData, setEditingRowData] = useState<PouringLogInput | null>(null);

  // Quick New Row State (Always available empty input row at the bottom)
  const [newRowData, setNewRowData] = useState<PouringLogInput>({
    site_id: site?.id || '',
    category: String(logs.length + 1),
    date: new Date().toISOString().split('T')[0],
    building: '',
    floor: '',
    member_type: '슬라브',
    min_temp: 20,
    max_temp: 28,
    weather: '맑음',
    remicon_company: '',
    strength: '24MPa',
    volume: '',
    curing_watering: '1일 3회 살수 실시',
    curing_protection: '양생시트 보양',
    remarks: '',
  });

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.building.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.floor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.member_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.remicon_company && log.remicon_company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.curing_watering && log.curing_watering.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.curing_protection && log.curing_protection.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesWeather =
      weatherFilter === 'ALL' || log.weather === weatherFilter;

    return matchesSearch && matchesWeather;
  });

  const getWeatherIcon = (weather: string) => {
    switch (weather) {
      case '맑음':
        return <Sun className="w-3.5 h-3.5 text-amber-400 inline mr-1" />;
      case '흐림':
        return <Cloud className="w-3.5 h-3.5 text-slate-400 inline mr-1" />;
      case '비':
        return <CloudRain className="w-3.5 h-3.5 text-blue-400 inline mr-1" />;
      case '눈':
        return <Snowflake className="w-3.5 h-3.5 text-cyan-300 inline mr-1" />;
      default:
        return null;
    }
  };

  // Handle Quick Add submit from the empty row
  const handleQuickAddSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newRowData.building && !newRowData.floor) {
      alert('동(구역) 또는 층 정보를 입력해주세요.');
      return;
    }

    if (onQuickAddLog) {
      onQuickAddLog({
        ...newRowData,
        site_id: site?.id || '',
      });
    }

    // Reset new row form
    setNewRowData({
      site_id: site?.id || '',
      category: String(logs.length + 2),
      date: new Date().toISOString().split('T')[0],
      building: '',
      floor: '',
      member_type: '슬라브',
      min_temp: 20,
      max_temp: 28,
      weather: '맑음',
      remicon_company: '',
      strength: '24MPa',
      volume: '',
      curing_watering: '1일 3회 살수 실시',
      curing_protection: '양생시트 보양',
      remarks: '',
    });
  };

  // Start inline edit for a row
  const startInlineEdit = (log: PouringLog) => {
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
  const saveInlineEdit = (id: string) => {
    if (editingRowData && onQuickUpdateLog) {
      onQuickUpdateLog(id, editingRowData);
    } else if (editingRowData) {
      onEditLog({ ...editingRowData, id });
    }
    setEditingRowId(null);
    setEditingRowData(null);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
      
      {/* Table Top Toolbar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider bg-amber-950/70 border border-amber-800/80 px-2.5 py-1 rounded-md">
            현장명 : {site?.name || '미선택'}
          </span>
          <span className="text-xs text-slate-400 font-medium">
            (총 {filteredLogs.length}개의 기록)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Search bar */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="위치, 층, 부위, 레미콘사 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-slate-500"
            />
          </div>

          {/* Weather Filter */}
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              value={weatherFilter}
              onChange={(e) => setWeatherFilter(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">기상 전체</option>
              <option value="맑음">맑음</option>
              <option value="흐림">흐림</option>
              <option value="비">비</option>
              <option value="눈">눈</option>
            </select>
          </div>

          <button
            onClick={onAddLog}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" /> 팝업 폼 작성
          </button>
        </div>
      </div>

      {/* Main Excel-styled Responsive Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left text-slate-300 border-collapse">
          <thead>
            {/* Row 1 Headers */}
            <tr className="bg-slate-950 text-slate-300 font-bold border-b border-slate-800 text-center">
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 w-12">
                구분
              </th>
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[100px]">
                일자
              </th>
              <th colSpan={3} className="px-3 py-2 border-r border-slate-800 bg-slate-950 text-amber-400">
                타설위치
              </th>
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[65px]">
                최저온도
              </th>
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[65px]">
                최고온도
              </th>
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[90px]">
                기상
              </th>
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[100px]">
                레미콘사
              </th>
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[85px] text-amber-300">
                타설강도
              </th>
              <th rowSpan={2} className="px-2 py-3 border-r border-slate-800 min-w-[85px] text-amber-300">
                타설물량
              </th>
              <th colSpan={2} className="px-3 py-2 border-r border-slate-800 bg-slate-950 text-amber-400">
                양생방법
              </th>
              <th rowSpan={2} className="px-2 py-3 min-w-[80px]">
                관리
              </th>
            </tr>

            {/* Row 2 Headers for Spanned Columns */}
            <tr className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 text-center text-[11px]">
              <th className="px-2 py-2 border-r border-slate-800 min-w-[85px]">동(구역)</th>
              <th className="px-2 py-2 border-r border-slate-800 min-w-[60px]">층</th>
              <th className="px-2 py-2 border-r border-slate-800 min-w-[80px]">벽/슬라브</th>
              <th className="px-2 py-2 border-r border-slate-800 min-w-[120px]">살수</th>
              <th className="px-2 py-2 border-r border-slate-800 min-w-[130px]">보양</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            
            {/* Existing Rows */}
            {filteredLogs.map((log, index) => {
              const isEditing = editingRowId === log.id;
              const isColdTemp = log.min_temp !== null && log.min_temp <= 4;
              const isHotTemp = log.max_temp !== null && log.max_temp >= 30;

              if (isEditing && editingRowData) {
                // INLINE EDITING ROW
                return (
                  <tr key={log.id} className="bg-amber-950/30 border-2 border-amber-500/60">
                    <td className="p-1 border-r border-slate-800 text-center">
                      <input
                        type="text"
                        value={editingRowData.category}
                        onChange={(e) => setEditingRowData({ ...editingRowData, category: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-center text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800 text-center">
                      <input
                        type="date"
                        value={editingRowData.date}
                        onChange={(e) => setEditingRowData({ ...editingRowData, date: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-[11px] text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        value={editingRowData.building}
                        onChange={(e) => setEditingRowData({ ...editingRowData, building: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-amber-300"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        value={editingRowData.floor}
                        onChange={(e) => setEditingRowData({ ...editingRowData, floor: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-center text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <select
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
                        value={editingRowData.min_temp ?? ''}
                        onChange={(e) => setEditingRowData({ ...editingRowData, min_temp: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-xs text-center text-blue-400 font-semibold"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="number"
                        step="0.1"
                        value={editingRowData.max_temp ?? ''}
                        onChange={(e) => setEditingRowData({ ...editingRowData, max_temp: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-xs text-center text-red-400 font-semibold"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <select
                        value={editingRowData.weather}
                        onChange={(e) => setEditingRowData({ ...editingRowData, weather: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1 py-1 text-xs text-white"
                      >
                        <option value="맑음">맑음</option>
                        <option value="흐림">흐림</option>
                        <option value="비">비</option>
                        <option value="눈">눈</option>
                      </select>
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        value={editingRowData.remicon_company}
                        onChange={(e) => setEditingRowData({ ...editingRowData, remicon_company: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        value={editingRowData.strength || ''}
                        onChange={(e) => setEditingRowData({ ...editingRowData, strength: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-center text-amber-300"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="number"
                        step="0.1"
                        value={editingRowData.volume ?? ''}
                        onChange={(e) => setEditingRowData({ ...editingRowData, volume: e.target.value ? parseFloat(e.target.value) : '' })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-center text-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        value={editingRowData.curing_watering}
                        onChange={(e) => setEditingRowData({ ...editingRowData, curing_watering: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-emerald-300"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-800">
                      <input
                        type="text"
                        value={editingRowData.curing_protection}
                        onChange={(e) => setEditingRowData({ ...editingRowData, curing_protection: e.target.value })}
                        className="w-full bg-slate-800 border border-amber-500 rounded px-1.5 py-1 text-xs text-amber-300"
                      />
                    </td>
                    <td className="p-1 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
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
                  className={`hover:bg-slate-800/60 transition group ${
                    index % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900'
                  }`}
                >
                  <td className="px-2 py-3 text-center border-r border-slate-800/80 font-medium text-slate-400">
                    {log.category || index + 1}
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
                  <td className={`px-2 py-3 border-r border-slate-800/80 text-center font-semibold ${
                    isColdTemp ? 'text-blue-400 bg-blue-950/20' : 'text-slate-300'
                  }`}>
                    {log.min_temp !== null ? `${log.min_temp}°C` : '-'}
                  </td>
                  <td className={`px-2 py-3 border-r border-slate-800/80 text-center font-semibold ${
                    isHotTemp ? 'text-red-400 bg-red-950/20' : 'text-slate-300'
                  }`}>
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
                    {log.strength || '-'}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 text-center font-semibold text-slate-200 whitespace-nowrap">
                    {log.volume !== null && log.volume !== undefined && log.volume !== '' ? `${log.volume} m³` : '-'}
                  </td>
                  <td className="px-2.5 py-3 border-r border-slate-800/80 text-slate-300">
                    {log.curing_watering ? (
                      <span className="text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded text-[11px] block truncate">
                        {log.curing_watering}
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
                    <div className="flex items-center justify-center gap-1.5 opacity-90 group-hover:opacity-100">
                      <button
                        onClick={() => startInlineEdit(log)}
                        title="셀 직접 수정"
                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteLog(log.id)}
                        title="삭제"
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* ✏️ ALWAYS-AVAILABLE BLANK INPUT ROW AT THE BOTTOM (직접 입력 빈칸 행) */}
            <tr className="bg-amber-950/20 border-t-2 border-dashed border-amber-500/50 hover:bg-amber-950/30 transition">
              {/* 구분 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="+"
                  value={newRowData.category}
                  onChange={(e) => setNewRowData({ ...newRowData, category: e.target.value })}
                  className="w-full bg-slate-900 border border-amber-500/40 rounded px-1 py-1 text-xs text-center text-amber-400 font-bold placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 일자 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="date"
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
                  value={newRowData.building}
                  onChange={(e) => setNewRowData({ ...newRowData, building: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 층 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="예: 15층"
                  value={newRowData.floor}
                  onChange={(e) => setNewRowData({ ...newRowData, floor: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-center text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 벽/슬라브 */}
              <td className="p-1.5 border-r border-slate-800">
                <select
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
                  value={newRowData.max_temp ?? ''}
                  onChange={(e) => setNewRowData({ ...newRowData, max_temp: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-center text-red-400 font-semibold placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 기상 */}
              <td className="p-1.5 border-r border-slate-800">
                <select
                  value={newRowData.weather}
                  onChange={(e) => setNewRowData({ ...newRowData, weather: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-slate-200 focus:ring-1 focus:ring-amber-500"
                >
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
                  value={newRowData.remicon_company}
                  onChange={(e) => setNewRowData({ ...newRowData, remicon_company: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 타설강도 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="강도"
                  value={newRowData.strength || ''}
                  onChange={(e) => setNewRowData({ ...newRowData, strength: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-center text-amber-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 타설물량 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="number"
                  step="0.1"
                  placeholder="물량"
                  value={newRowData.volume ?? ''}
                  onChange={(e) => setNewRowData({ ...newRowData, volume: e.target.value ? parseFloat(e.target.value) : '' })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-center text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 살수 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="살수 내용"
                  value={newRowData.curing_watering}
                  onChange={(e) => setNewRowData({ ...newRowData, curing_watering: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-emerald-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 보양 */}
              <td className="p-1.5 border-r border-slate-800">
                <input
                  type="text"
                  placeholder="보양 내용"
                  value={newRowData.curing_protection}
                  onChange={(e) => setNewRowData({ ...newRowData, curing_protection: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAddSubmit()}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-amber-300 placeholder-slate-600 focus:ring-1 focus:ring-amber-500"
                />
              </td>

              {/* 빠른 행 추가 저장 버튼 */}
              <td className="p-1.5 text-center whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleQuickAddSubmit()}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-2 py-1 rounded text-xs flex items-center justify-center gap-1 shadow transition"
                  title="이 행에 기록 입력 추가"
                >
                  <Plus className="w-3.5 h-3.5" /> 추가
                </button>
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <span>✏️ <strong className="text-amber-400">표 직접 입력:</strong> 맨 아래 점선 빈칸 행에 직접 입력 후 <strong className="text-white">[추가]</strong> 또는 엔터를 누르면 바로 기록됩니다.</span>
        </div>
        <div>
          기존 행의 ✏️ 수정 아이콘을 누르면 표 안에서 즉시 셀 수정이 가능합니다.
        </div>
      </div>

    </div>
  );
};
