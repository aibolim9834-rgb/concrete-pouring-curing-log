'use client';

import React, { useState } from 'react';
import { Site } from '@/lib/types';
import { X, Plus, Building2, Trash2, CheckCircle } from 'lucide-react';

interface SiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: Site[];
  selectedSiteId: string;
  onSelectSite: (id: string) => void;
  onAddSite: (name: string, code?: string) => void;
  onDeleteSite: (id: string) => void;
}

export const SiteModal: React.FC<SiteModalProps> = ({
  isOpen,
  onClose,
  sites,
  selectedSiteId,
  onSelectSite,
  onAddSite,
  onDeleteSite,
}) => {
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteCode, setNewSiteCode] = useState('');

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    onAddSite(newSiteName.trim(), newSiteCode.trim() || undefined);
    setNewSiteName('');
    setNewSiteCode('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">현장 관리 (해당 현장 목록)</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Add Site Form */}
          <form onSubmit={handleAdd} className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-amber-400">신규 현장 등록</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <input
                  type="text"
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
                  placeholder="코드(선택)"
                  value={newSiteCode}
                  onChange={(e) => setNewSiteCode(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition"
            >
              <Plus className="w-4 h-4" /> 현장 목록에 추가
            </button>
          </form>

          {/* Current Site List */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 mb-2">등록된 현장 목록 ({sites.length}개)</h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {sites.map((site) => {
                const isSelected = site.id === selectedSiteId;
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
                        onClick={() => onDeleteSite(site.id)}
                        title="현장 삭제"
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

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
