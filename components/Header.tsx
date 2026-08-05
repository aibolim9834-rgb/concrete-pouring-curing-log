'use client';

import React from 'react';
import { Site } from '@/lib/types';
import { 
  Building2, 
  PlusCircle, 
  FileSpreadsheet, 
  Printer, 
  Database, 
  HardHat,
  Plus
} from 'lucide-react';

interface HeaderProps {
  sites: Site[];
  selectedSiteId: string;
  onSelectSite: (siteId: string) => void;
  onOpenAddSite: () => void;
  onOpenAddRecord: () => void;
  onOpenPrintView: () => void;
  onExportExcel: () => void;
  isSupabase: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sites,
  selectedSiteId,
  onSelectSite,
  onOpenAddSite,
  onOpenAddRecord,
  onOpenPrintView,
  onExportExcel,
  isSupabase,
}) => {
  const currentSite = sites.find(s => s.id === selectedSiteId);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Title and Site Picker */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <HardHat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-100 tracking-tight">
                  콘크리트 타설 및 양생 관리 시스템
                </h1>
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium flex items-center gap-1 border ${
                  isSupabase 
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800' 
                    : 'bg-amber-950 text-amber-300 border-amber-800'
                }`}>
                  <Database className="w-3 h-3" />
                  {isSupabase ? 'Supabase 연동됨' : '로컬 모드 (추후 DB 연동)'}
                </span>
              </div>
              
              {/* Site selector dropdown */}
              <div className="flex items-center gap-2 mt-1">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400 font-semibold">현장명:</span>
                {sites.length > 0 ? (
                  <select
                    value={selectedSiteId}
                    onChange={(e) => onSelectSite(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-amber-300 text-xs rounded-md px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  >
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name} {site.code ? `(${site.code})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={onOpenAddSite}
                    className="text-xs text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-md hover:bg-amber-900/60 transition"
                  >
                    + 첫 현장 등록하기
                  </button>
                )}
                <button
                  onClick={onOpenAddSite}
                  title="현장 추가 및 관리"
                  className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded-md flex items-center gap-1 transition"
                >
                  <Plus className="w-3 h-3" /> 현장 관리
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={onOpenAddRecord}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm hover:shadow"
            >
              <PlusCircle className="w-4 h-4" />
              타설 일지 등록
            </button>
            <button
              onClick={onOpenPrintView}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              인쇄/보고서 서식
            </button>
            <button
              onClick={onExportExcel}
              className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              CSV 내보내기
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
