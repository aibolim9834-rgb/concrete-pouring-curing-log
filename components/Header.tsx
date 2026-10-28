'use client';

import React from 'react';
import { Site } from '@/lib/types';
import { 
  Building2, 
  FileSpreadsheet, 
  Printer, 
  Database,
  Table2,
  Plus
} from 'lucide-react';

interface HeaderProps {
  sites: Site[];
  selectedSiteId: string;
  onSelectSite: (siteId: string) => void;
  onOpenAddSite: () => void;
  onOpenPrintView: () => void;
  onOpenHome: () => void;
  onExportExcel: () => void;
  isSupabase: boolean;
  isPhotos?: boolean;
  onOpenPhotos?: () => void;
  isProgress?: boolean;
  onOpenProgress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  sites,
  selectedSiteId,
  onSelectSite,
  onOpenAddSite,
  onOpenPrintView,
  onOpenHome,
  onExportExcel,
  isSupabase,
  isPhotos,
  onOpenPhotos,
  isProgress,
  onOpenProgress,
}) => {
  const photosButton = onOpenPhotos && <button type="button" onClick={onOpenPhotos} className={`ui-button ${isPhotos ? 'app-return-button' : 'app-progress-button'}`}>{isPhotos && <span className="app-return-arrow" aria-hidden="true">←</span>}{isPhotos ? "일지로 돌아가기" : "알폼핀 체결 사진"}</button>;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="app-header-layout">
          
          {/* Title and Site Picker */}
          <div className="app-header-identity">
            <img className="bolim-logo" src="https://cdn.imweb.me/thumbnail/20220701/9fa5f0628c150.png" width="42" height="30" alt="보림토건" />
            <div className="app-header-copy">
              <div className="app-header-title-row">
                <h1 className="text-lg font-bold text-slate-100 tracking-tight">
                  <button type="button" className="app-home-button" onClick={onOpenHome} title="타설 일지 첫 화면으로 이동">콘크리트 타설 및 양생 관리 시스템</button>
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
              <div className="app-header-site-row">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400 font-semibold">현장명:</span>
                {sites.length > 0 ? (
                  <select aria-label="현장 선택"
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
                  className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded-[5px] flex items-center gap-1 transition"
                >
                  <Plus className="w-3 h-3" /> 현장 관리
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="app-header-actions">
            {isPhotos && photosButton}
            {onOpenProgress && <button type="button" onClick={onOpenProgress} className={`ui-button ${isProgress ? 'app-return-button' : 'app-progress-button'}`}>{isProgress ? <span className="app-return-arrow" aria-hidden="true">←</span> : <Table2 size={18} aria-hidden="true" />}{isProgress ? '일지로 돌아가기' : '타설현황'}</button>}
            {!isPhotos && photosButton}
            {!isPhotos && <>
            <button
              onClick={onOpenPrintView}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-[5px] text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              인쇄/보고서 서식
            </button>
            <button
              onClick={onExportExcel}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-[5px] text-xs flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              CSV 내보내기
            </button></>}
          </div>

        </div>
      </div>
    </header>
  );
};
