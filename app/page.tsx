'use client';

import React, { useState, useEffect } from 'react';
import { Site, PouringLog, PouringLogInput } from '@/lib/types';
import { INITIAL_SITES, INITIAL_LOGS } from '@/lib/mockData';
import { supabase, isSupabaseConnected } from '@/lib/supabase';
import { Header } from '@/components/Header';
import { SummaryCards } from '@/components/SummaryCards';
import { RecordTable } from '@/components/RecordTable';
import { RecordModal } from '@/components/RecordModal';
import { SiteModal } from '@/components/SiteModal';
import { PrintView } from '@/components/PrintView';

export default function Home() {
  const [sites, setSites] = useState<Site[]>(INITIAL_SITES);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('site-1');
  const [logs, setLogs] = useState<PouringLog[]>(INITIAL_LOGS);
  
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [isPrintViewOpen, setIsPrintViewOpen] = useState(false);
  
  const [editingLog, setEditingLog] = useState<PouringLog | null>(null);
  const [isSupabase, setIsSupabase] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize and check Supabase / LocalStorage
  useEffect(() => {
    const initData = async () => {
      const connected = isSupabaseConnected();
      setIsSupabase(connected);

      if (connected && supabase) {
        try {
          // Fetch sites from Supabase
          const { data: dbSites, error: sitesError } = await supabase
            .from('sites')
            .select('*')
            .order('name');
          
          if (!sitesError && dbSites && dbSites.length > 0) {
            setSites(dbSites);
            setSelectedSiteId(dbSites[0].id);
          }

          // Fetch pouring logs from Supabase
          const { data: dbLogs, error: logsError } = await supabase
            .from('pouring_logs')
            .select('*')
            .order('date', { ascending: false });

          if (!logsError && dbLogs) {
            setLogs(dbLogs);
          }
        } catch (e) {
          console.warn('Supabase fetch failed, fallback to local data:', e);
        }
      } else {
        // Load from LocalStorage if available
        const savedSites = localStorage.getItem('cp_sites');
        const savedLogs = localStorage.getItem('cp_logs');

        if (savedSites) {
          try { setSites(JSON.parse(savedSites)); } catch (e) {}
        }
        if (savedLogs) {
          try { setLogs(JSON.parse(savedLogs)); } catch (e) {}
        }
      }
      setLoading(false);
    };

    initData();
  }, []);

  // Save to LocalStorage whenever sites or logs change
  useEffect(() => {
    if (!loading && !isSupabase) {
      localStorage.setItem('cp_sites', JSON.stringify(sites));
      localStorage.setItem('cp_logs', JSON.stringify(logs));
    }
  }, [sites, logs, isSupabase, loading]);

  const currentSite = sites.find((s) => s.id === selectedSiteId) || sites[0];

  // Logs filtered by selected site
  const siteLogs = logs.filter((log) => log.site_id === selectedSiteId);

  // Add / Edit Log Handler
  const handleSaveLog = async (data: PouringLogInput, id?: string) => {
    if (id) {
      // Edit existing log
      if (isSupabase && supabase) {
        await supabase.from('pouring_logs').update(data).eq('id', id);
      }
      setLogs((prev) =>
        prev.map((log) => (log.id === id ? { ...data, id } : log))
      );
    } else {
      // Add new log
      const newId = `log-${Date.now()}`;
      const newLog: PouringLog = {
        ...data,
        id: newId,
        site_id: selectedSiteId,
      };

      if (isSupabase && supabase) {
        const { data: inserted, error } = await supabase
          .from('pouring_logs')
          .insert({
            site_id: selectedSiteId,
            category: data.category,
            date: data.date,
            building: data.building,
            floor: data.floor,
            member_type: data.member_type,
            min_temp: data.min_temp,
            max_temp: data.max_temp,
            weather: data.weather,
            remicon_company: data.remicon_company,
            strength: data.strength,
            volume: data.volume,
            curing_watering: data.curing_watering,
            curing_protection: data.curing_protection,
            remarks: data.remarks,
          })
          .select()
          .single();

        if (!error && inserted) {
          newLog.id = inserted.id;
        }
      }

      setLogs((prev) => [newLog, ...prev]);
    }
  };

  // Delete Log Handler
  const handleDeleteLog = async (id: string) => {
    if (!confirm('해당 타설/양생 일지 항목을 삭제하시겠습니까?')) return;

    if (isSupabase && supabase) {
      await supabase.from('pouring_logs').delete().eq('id', id);
    }
    setLogs((prev) => prev.filter((log) => log.id !== id));
  };

  // Add Site Handler
  const handleAddSite = async (name: string, code?: string) => {
    const newSiteId = `site-${Date.now()}`;
    const newSite: Site = { id: newSiteId, name, code };

    if (isSupabase && supabase) {
      const { data: inserted, error } = await supabase
        .from('sites')
        .insert({ name, code })
        .select()
        .single();
      if (!error && inserted) {
        newSite.id = inserted.id;
      }
    }

    setSites((prev) => [...prev, newSite]);
    setSelectedSiteId(newSite.id);
  };

  // Delete Site Handler
  const handleDeleteSite = async (id: string) => {
    if (sites.length <= 1) {
      alert('최소 1개 이상의 현장이 등록되어 있어야 합니다.');
      return;
    }
    if (!confirm('현장을 삭제하면 해당 현장의 타설/양생 기록도 삭제됩니다. 계속하시겠습니까?')) return;

    if (isSupabase && supabase) {
      await supabase.from('sites').delete().eq('id', id);
    }

    setSites((prev) => prev.filter((s) => s.id !== id));
    setLogs((prev) => prev.filter((l) => l.site_id !== id));
    
    if (selectedSiteId === id) {
      const remaining = sites.filter((s) => s.id !== id);
      if (remaining.length > 0) setSelectedSiteId(remaining[0].id);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['구분', '일자', '동(구역)', '층', '벽/슬라브', '최저온도(°C)', '최고온도(°C)', '기상', '레미콘사', '타설강도', '타설물량(m³)', '양생-살수', '양생-보양', '비고'];
    
    const rows = siteLogs.map((log) => [
      log.category,
      log.date,
      log.building,
      log.floor,
      log.member_type,
      log.min_temp ?? '',
      log.max_temp ?? '',
      log.weather,
      log.remicon_company,
      log.strength || '',
      log.volume ?? '',
      log.curing_watering,
      log.curing_protection,
      log.remarks || '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${currentSite?.name || '현장'}_콘크리트_타설_양생_일지.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isPrintViewOpen) {
    return (
      <PrintView
        logs={siteLogs}
        sites={sites}
        currentSite={currentSite}
        onBack={() => setIsPrintViewOpen(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header Navigation */}
      <Header
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSelectSite={setSelectedSiteId}
        onOpenAddSite={() => setIsSiteModalOpen(true)}
        onOpenAddRecord={() => {
          setEditingLog(null);
          setIsRecordModalOpen(true);
        }}
        onOpenPrintView={() => setIsPrintViewOpen(true)}
        onExportExcel={handleExportCSV}
        isSupabase={isSupabase}
      />

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Summary Counter & Alert Cards */}
        <SummaryCards logs={siteLogs} site={currentSite} />

        {/* Concrete Pouring & Curing Log Table */}
        <RecordTable
          logs={siteLogs}
          site={currentSite}
          onEditLog={(log) => {
            setEditingLog(log);
            setIsRecordModalOpen(true);
          }}
          onDeleteLog={handleDeleteLog}
          onAddLog={() => {
            setEditingLog(null);
            setIsRecordModalOpen(true);
          }}
          onQuickAddLog={(inputData) => handleSaveLog(inputData)}
          onQuickUpdateLog={(id, inputData) => handleSaveLog(inputData, id)}
        />

      </main>

      {/* Modals */}
      <RecordModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onSave={handleSaveLog}
        initialData={editingLog}
        currentSite={currentSite}
      />

      <SiteModal
        isOpen={isSiteModalOpen}
        onClose={() => setIsSiteModalOpen(false)}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSelectSite={setSelectedSiteId}
        onAddSite={handleAddSite}
        onDeleteSite={handleDeleteSite}
      />

    </div>
  );
}
