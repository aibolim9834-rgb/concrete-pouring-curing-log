'use client';

import React from 'react';
import { Site } from '@/lib/types';
import { Building2, Database } from 'lucide-react';

export type AppPage = 'logs' | 'progress' | 'photos';
// One tab per page, in the same place on every page; the current one is marked with aria-current.
const PAGES: [AppPage, string, string][] = [['logs', '타설일지', '/'], ['progress', '타설현황', '/progress'], ['photos', '알폼핀 사진', '/photos']];

interface HeaderProps {
  sites: Site[];
  selectedSiteId: string;
  onSelectSite: (siteId: string) => void;
  onOpenAddSite: () => void;
  onOpenHome: () => void;
  isSupabase: boolean;
  current: AppPage;
  // Leaving a page goes through its own checks (unsaved photo work, a selected site).
  onNavigate: (page: AppPage) => void;
}

export const Header: React.FC<HeaderProps> = ({
  sites,
  selectedSiteId,
  onSelectSite,
  onOpenAddSite,
  onOpenHome,
  isSupabase,
  current,
  onNavigate,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3.5">
        <div className="app-header-layout">

          {/* Title and Site Picker */}
          <div className="app-header-identity">
            <img className="bolim-logo" src="/bolim-logo.png" width="42" height="30" alt="보림토건" />
            <div className="app-header-copy">
              <div className="app-header-title-row">
                <h1 className="text-lg font-bold text-slate-100 tracking-tight">
                  <button type="button" className="app-home-button" onClick={onOpenHome} title="타설일지 첫 화면으로 이동">콘크리트 타설 및 양생 관리 시스템</button>
                </h1>
                <span className={`app-header-status px-2 py-0.5 text-xs rounded-full font-medium flex items-center gap-1 border ${
                  isSupabase
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border-amber-800'
                }`} title={isSupabase ? '일지·현황·사진이 서버에 저장되어 다른 기기에서도 보입니다.' : '이 브라우저에만 저장됩니다. 다른 기기에서는 보이지 않습니다.'}>
                  <Database className="w-3 h-3" aria-hidden="true" />
                  {isSupabase ? '서버에 저장' : '이 기기에만 저장'}
                </span>
              </div>

              {/* Site selector dropdown */}
              <div className="app-header-site-row">
                <Building2 className="app-header-site-label w-4 h-4 text-slate-400" />
                <span className="app-header-site-label text-xs text-slate-400 font-semibold">현장명:</span>
                {sites.length > 0 ? (
                  <select aria-label="현장 선택"
                    value={selectedSiteId}
                    onChange={(e) => onSelectSite(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-amber-300 text-xs rounded-md px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  >
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.status === 'closed' ? '종료 · ' : ''}{site.name} {site.code ? `(${site.code})` : ''}
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
                  현장 관리
                </button>
              </div>
            </div>
          </div>

        </div>

        <nav className="app-nav" aria-label="화면">
          {PAGES.map(([page, label, path]) => (
            <a key={page} href={selectedSiteId ? `${path}?site=${encodeURIComponent(selectedSiteId)}` : path}
              aria-current={current === page ? 'page' : undefined}
              onClick={(e) => {
                // Ctrl/Shift/middle clicks open a new tab as links normally do.
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                if (current !== page) onNavigate(page);
              }}>{label}</a>
          ))}
        </nav>
      </div>
    </header>
  );
};
