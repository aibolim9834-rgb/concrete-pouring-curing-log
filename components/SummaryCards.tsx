'use client';

import React from 'react';
import { PouringLog, Site } from '@/lib/types';
import { 
  ClipboardList, 
  Thermometer, 
  Sun, 
  ShieldAlert, 
  Building,
  CheckCircle2
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

  // Check Curing alerts
  const hasColdAlert = minTemp !== null && minTemp <= 4;
  const hasHotAlert = maxTemp !== null && maxTemp >= 30;

  // Member types breakdown
  const memberCounts = logs.reduce((acc, log) => {
    const member = log.member_type || '기타';
    acc[member] = (acc[member] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      
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
            <span className="text-xs text-slate-400">총 타설/양생 기록</span>
            <span className="text-xl font-extrabold text-slate-100">{totalCount} <span className="text-xs font-normal text-slate-400">건</span></span>
          </div>
        </div>
      </div>

      {/* 2. Temperature Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">기상/온도 범위</span>
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
            <Thermometer className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">최저 온도</span>
            <span className="font-bold text-blue-400">{minTemp !== null ? `${minTemp}°C` : '-'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">최고 온도</span>
            <span className="font-bold text-red-400">{maxTemp !== null ? `${maxTemp}°C` : '-'}</span>
          </div>
        </div>
      </div>

      {/* 3. Special Curing Condition Alert */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">양생 관리 상태</span>
          <div className={`p-2 rounded-lg ${hasHotAlert || hasColdAlert ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            {hasHotAlert || hasColdAlert ? <ShieldAlert className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          </div>
        </div>
        <div className="mt-3">
          {hasHotAlert ? (
            <div className="text-xs text-amber-300 bg-amber-950/60 border border-amber-800/60 p-2 rounded-md flex items-center gap-1.5 font-medium">
              <Sun className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              서중 콘크리트 양생 (살수 피복 필수)
            </div>
          ) : hasColdAlert ? (
            <div className="text-xs text-blue-300 bg-blue-950/60 border border-blue-800/60 p-2 rounded-md flex items-center gap-1.5 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              동절기 보양 양생 (방열/가온 필수)
            </div>
          ) : (
            <div className="text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 p-2 rounded-md flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              표준 양생 기상 조건 충족
            </div>
          )}
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
