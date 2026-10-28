'use client';

import React from 'react';
import { PouringLog, Site } from '@/lib/types';
import { 
  ClipboardList,
  Thermometer,
  Building
} from 'lucide-react';

interface SummaryCardsProps {
  logs: PouringLog[];
  site: Site | undefined;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ logs, site }) => {
  const totalCount = logs.length;
  
  // Calculate temp statistics
  const validMinTemps = logs.map(l => l.min_temp).filter((t): t is number => t !== null);
  const validMaxTemps = logs.map(l => l.max_temp).filter((t): t is number => t !== null);
  
  const minTemp = validMinTemps.length > 0 ? Math.min(...validMinTemps) : null;
  const maxTemp = validMaxTemps.length > 0 ? Math.max(...validMaxTemps) : null;
  const missingTemperatureCount = logs.filter(log => log.min_temp === null || log.max_temp === null).length;

  // Member types breakdown
  const memberCounts = logs.reduce((acc, log) => {
    const member = log.member_type || '기타';
    acc[member] = (acc[member] || 0) + 1;
    return acc;
  }, Object.create(null) as Record<string, number>);

  return (
    <div className="summary-cards grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      
      {/* 1. Selected Site & Total Records */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">선택 현장 개요</span>
          <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
            <Building className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-sm font-bold text-amber-400 truncate">
            {site?.name || '현장 미선택'}
          </h3>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xs text-slate-400">조회된 타설/양생 기록</span>
            <span className="text-xl font-extrabold text-slate-100">{totalCount} <span className="text-xs font-normal text-slate-400">건</span></span>
          </div>
        </div>
      </div>

      {/* 2. Temperature Range */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">온도 범위</span>
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg"><Thermometer className="w-4 h-4" /></div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-400">최저 온도</span><span className="font-bold text-blue-400">{minTemp !== null ? `${minTemp}°C` : '-'}</span></div>
          <div className="flex items-center justify-between text-xs"><span className="text-slate-400">최고 온도</span><span className="font-bold text-red-400">{maxTemp !== null ? `${maxTemp}°C` : '-'}</span></div>
          {missingTemperatureCount > 0 && <p className="ui-note mt-2">온도 미입력 {missingTemperatureCount}건 포함</p>}
        </div>
      </div>

      {/* 4. Concrete Member Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">타설 부위 현황</span>
          <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
            <ClipboardList className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-xs flex flex-wrap gap-1.5">
          {Object.keys(memberCounts).length > 0 ? (
            Object.entries(memberCounts).map(([member, count]) => (
              <span key={member} className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                {member}: <strong className="text-amber-400">{count}</strong>
              </span>
            ))
          ) : (
            <span className="text-slate-500">기록 없음</span>
          )}
        </div>
      </div>

    </div>
  );
};
