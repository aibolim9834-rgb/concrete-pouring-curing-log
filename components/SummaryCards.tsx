'use client';

import React, { useEffect, useState } from 'react';
import { PouringLog, Site } from '@/lib/types';
import { shortAreaLabel } from '@/lib/kma-area';
import type { TodayWeather } from '@/lib/kma-weather';
import type { SiteWarnings } from '@/lib/kma-warning';
import {
  ClipboardList,
  ExternalLink,
  Thermometer,
  Building
} from 'lucide-react';

interface SummaryCardsProps {
  logs: PouringLog[];
  site?: Site;
}

const REFRESH_MS = 30 * 60 * 1000;
const clock = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const degrees = (value: number | null) => value === null ? '-' : `${value}°`;
// 강수확률 of 60% and above takes the yellow of the 비 예보 line (red stays for 기상특보 경보).
const likelyRain = (pop: number | null | undefined) => pop != null && pop >= 60;
const popClass = (pop: number | null | undefined, plain: string) => likelyRain(pop) ? 'summary-compact-alert is-advisory' : plain;

// 기상청 날씨누리 레이더·낙뢰 page (whole country; the site's 기상 위치 is not passed), opened in a new tab from the PC and phone weather cards.
const RADAR_URL = 'https://www.weather.go.kr/w/weather/radar/radar.do';
const RadarLink = ({ className }: { className: string }) => (
  <a className={`weather-radar-link ${className}`} href={RADAR_URL} target="_blank" rel="noopener noreferrer">
    레이더<span className="sr-only"> (기상청 날씨누리, 새 탭)</span><ExternalLink aria-hidden="true" />
  </a>
);

// 오늘 날씨 for the site's 기상 위치: loaded on open and every 30 minutes, and again on return to the tab if that time has passed.
// A failed refresh keeps the last values on screen and says so.
function useTodayWeather(nx?: number, ny?: number) {
  const [state, setState] = useState<{ grid: string; weather: TodayWeather | null; at: number; error: string }>({ grid: '', weather: null, at: 0, error: '' });
  const grid = nx && ny ? `${nx},${ny}` : '';
  useEffect(() => {
    if (!grid) return;
    let alive = true, last = 0;
    const load = async () => {
      last = Date.now();
      try {
        const response = await fetch(`/api/weather?nx=${nx}&ny=${ny}`);
        const body = await response.json().catch(() => ({ error: '오늘 날씨를 불러오지 못했습니다.' }));
        if (!response.ok) throw new Error(body.error || '오늘 날씨를 불러오지 못했습니다.');
        if (alive) setState({ grid, weather: body as TodayWeather, at: Date.now(), error: '' });
      } catch (e) {
        const error = e instanceof Error && e.message !== 'Failed to fetch' ? e.message : '오늘 날씨를 불러오지 못했습니다. 연결을 확인해주세요.';
        if (alive) setState(prev => prev.grid === grid ? { ...prev, error } : { grid, weather: null, at: 0, error });
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - last >= REFRESH_MS) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [grid, nx, ny]);
  return state.grid === grid ? state : { grid, weather: null, at: 0, error: '' };
}

// 기상특보 for the site's 기상 위치, every 10 minutes (the server shares one 기상청 call per 10 minutes among all sites).
// A failed refresh keeps the last 특보 on screen.
const WARNING_REFRESH_MS = 10 * 60 * 1000;
function useWeatherWarnings(code?: string) {
  const [state, setState] = useState<{ code: string; data: SiteWarnings | null; error: string }>({ code: '', data: null, error: '' });
  useEffect(() => {
    if (!code) return;
    let alive = true, last = 0;
    const load = async () => {
      last = Date.now();
      try {
        const response = await fetch(`/api/weather-warning?code=${code}`);
        const body = await response.json().catch(() => ({ error: '기상특보를 불러오지 못했습니다.' }));
        if (!response.ok) throw new Error(body.error || '기상특보를 불러오지 못했습니다.');
        if (alive) setState({ code, data: body as SiteWarnings, error: '' });
      } catch (e) {
        const error = e instanceof Error && e.message !== 'Failed to fetch' ? e.message : '기상특보를 불러오지 못했습니다.';
        if (alive) setState(prev => prev.code === code ? { ...prev, error } : { code, data: null, error });
      }
    };
    void load();
    const timer = setInterval(() => void load(), WARNING_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - last >= WARNING_REFRESH_MS) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [code]);
  return state.code === code ? state : { code: code ?? '', data: null, error: '' };
}

// One line under 오늘 최저·최고: 경보·주의보 in force, then 예비특보, each with the 특보구역 it names.
function warningLine(data: SiteWarnings | null, error: string) {
  if (!data) return <p className="ui-note">{error || '기상특보 확인 중'}</p>;
  if (!data.warnings.length && !data.previews.length) return <p className="ui-note">{`기상특보 없음${data.issuedAt ? ` · 기상청 ${data.issuedAt} 발표 기준` : ''}`}</p>;
  return <ul className="weather-alerts" aria-label="기상특보">
    {data.warnings.map(w => <li key={`w-${w.kind}-${w.level}`} className={w.level === '주의보' ? 'is-advisory' : 'is-warning'}>
      <span className="weather-alert-badge">{w.level}</span><b>{`${w.kind}${w.level}`}</b><span>{w.zones.join(', ')}</span>
    </li>)}
    {data.previews.map(p => <li key={`p-${p.kind}-${p.when}`} className="is-preview">
      <span className="weather-alert-badge">예비</span><b>{`${p.kind} 예비특보`}</b><span>{`${p.when} · ${p.zones.join(', ')}`}</span>
    </li>)}
    {data.issuedAt && <li className="weather-alerts-source">{`기상청 ${data.issuedAt} 발표${error ? ' · 새로 불러오지 못해 이전 특보입니다' : ''}`}</li>}
  </ul>;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ logs, site }) => {
  const area = site?.weather_area ?? null;
  const today = useTodayWeather(area?.nx, area?.ny);
  const weather = today.weather;
  const alerts = useWeatherWarnings(area?.code);
  const firstAlert = alerts.data?.warnings[0];
  const totalCount = logs.length;
  const totalVolume = logs.reduce((sum, log) => sum + Number(log.volume || 0), 0);
  
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
    <div className="summary-cards grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      
      {/* 1. Record count & poured volume (the site name already sits in the header) */}
      <div className="summary-card-full bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">타설 기록</span>
          <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
            <Building className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-400">조회된 타설/양생 기록</span>
            <span className="text-xl font-extrabold text-slate-100">{totalCount} <span className="text-xs font-normal text-slate-400">건</span></span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs"><span className="text-slate-400">타설물량 합계</span><span className="summary-card-value font-bold text-slate-100">{totalVolume.toLocaleString('ko-KR')} m³</span></div>
          <div className="mt-1 flex items-center justify-between text-xs"><span className="text-slate-400">기록 온도</span><span className="summary-card-value font-bold">{minTemp === null && maxTemp === null ? <span className="text-slate-100">-</span> : <><span className="text-blue-400">{`${minTemp ?? '-'}°C`}</span><span className="text-slate-400"> ~ </span><span className="text-red-400">{`${maxTemp ?? '-'}°C`}</span></>}</span></div>
          {missingTemperatureCount > 0 && <p className="ui-note mt-1">온도 미입력 {missingTemperatureCount}건 포함</p>}
        </div>
      </div>

      {/* 2. 오늘 날씨 at the site (기상청 초단기실황 + 단기예보); the 일지 temperatures moved to the first card. */}
      <div className="summary-card-full today-weather-card bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">{`오늘 날씨${area ? ` · ${shortAreaLabel(area)}` : ''}`}</span>
          <div className="flex items-center gap-2">
            <RadarLink className="is-full" />
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg"><Thermometer className="w-4 h-4" /></div>
          </div>
        </div>
        <div className="mt-3">
          {!area ? <>
            <div className="flex items-center justify-between text-xs"><span className="text-slate-400">현재 기온</span><span className="font-bold text-slate-100">-</span></div>
            <p className="ui-note mt-2">{site?.address ? '현장 관리에서 ⋯ › 주소 수정으로 기상 위치를 고르면 표시됩니다.' : '현장 관리에서 현장 주소를 넣으면 표시됩니다.'}</p>
          </> : !weather ? <p className="ui-note">{today.error || '오늘 날씨를 불러오는 중입니다.'}</p> : <>
            {/* Temperatures on the left, 강수 on the right when the card is wide enough (stacked otherwise), so the row keeps its height.
                Each line is its own cell numbered by --row, so 현재 기온 and 오늘 강수확률 share a text line, as do 최저/최고 and the next 강수 line. */}
            {(() => {
              const left = [
                <div key="now" className="flex items-baseline justify-between text-xs"><span className="text-slate-400">{`현재 기온${weather.observedAt ? ` (${weather.observedAt} 관측)` : ''}`}</span><span className="today-weather-now font-extrabold text-slate-100">{degrees(weather.temp)}</span></div>,
                <div key="range" className="flex items-center justify-between text-xs"><span className="text-slate-400">오늘 최저 / 최고 (예보)</span><span className="summary-card-value font-bold"><span className="text-blue-400">{degrees(weather.min)}</span><span className="text-slate-400"> / </span><span className="text-red-400">{degrees(weather.max)}</span></span></div>,
              ];
              // 강수 for the rest of today and for tomorrow, from the newest 단기예보 issue; wet hours get their own warning line.
              const right = [
                weather.pop != null && <div key="pop" className="flex items-center justify-between text-xs" title="지금부터 자정까지 시간별 강수확률 중 가장 높은 값"><span className="text-slate-400">오늘 강수확률</span><span className={`today-weather-pop ${popClass(weather.pop, 'text-slate-100')}`}>{`${weather.pop}%`}</span></div>,
                weather.rain && <p key="rain" className="summary-compact-alert is-advisory text-xs">{`오늘 ${weather.rain.hours} ${weather.rain.kind} 예보${weather.rain.amount ? ` · ${weather.rain.amount}` : ''}`}</p>,
                weather.popTomorrow != null && <div key="pop-next" className="flex items-center justify-between text-xs" title="내일 0시~23시 시간별 강수확률 중 가장 높은 값"><span className="text-slate-400">내일 강수확률</span><span className={`today-weather-pop ${popClass(weather.popTomorrow, 'text-slate-100')}`}>{`${weather.popTomorrow}%`}</span></div>,
                weather.rainTomorrow && <p key="rain-next" className="summary-compact-alert is-advisory text-xs">{`내일 ${weather.rainTomorrow.hours} ${weather.rainTomorrow.kind} 예보${weather.rainTomorrow.amount ? ` · ${weather.rainTomorrow.amount}` : ''}`}</p>,
              ].filter(Boolean);
              const cell = (side: string) => (el: React.ReactNode, i: number) => <div key={`${side}${i}`} className={`today-weather-cell is-${side}`} style={{ '--row': i + 1 } as React.CSSProperties}>{el}</div>;
              return <div className={`today-weather-grid${right.length ? ' has-rain' : ''}`} style={{ '--rows': Math.max(left.length, right.length) } as React.CSSProperties}>
                {left.map(cell('left'))}
                {right.length > 0 && <div className="today-weather-divider" aria-hidden="true" />}
                {right.map(cell('right'))}
              </div>;
            })()}
            {today.error && <p className="ui-note today-weather-stale mt-2">{`${clock(today.at)} 값 · 새로 불러오지 못해 이전 값을 보여 줍니다. ${today.error}`}</p>}
          </>}
          {area && <div className="mt-2">{warningLine(alerts.data, alerts.error)}</div>}
        </div>
      </div>

      {/* 4. Concrete Member Breakdown */}
      <div className="summary-card-full bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
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
                {member}: <strong className="text-slate-100">{count}</strong>
              </span>
            ))
          ) : (
            <span className="text-slate-500">기록 없음</span>
          )}
        </div>
      </div>

      {/* Phones show the same three figures as one short row of compact cards. */}
      <div className="summary-card-compact bg-slate-900 border border-slate-800 rounded-xl">
        <span className="text-slate-400">타설 기록</span>
        <strong className="text-slate-100">{totalCount}건</strong>
        <span className="text-slate-400">{totalVolume.toLocaleString('ko-KR')} m³</span>
        {(minTemp !== null || maxTemp !== null) && <span className="text-slate-400">{`기록 ${minTemp ?? '-'}~${maxTemp ?? '-'}°`}</span>}
      </div>
      <div className="summary-card-compact bg-slate-900 border border-slate-800 rounded-xl">
        {/* The big figure is the current temperature, as on the PC card; the forecast range sits below it. */}
        <span className="text-slate-400">{weather ? '현재 기온' : '오늘 날씨'}</span>
        <strong className="text-slate-100">{weather ? degrees(weather.temp) : '-'}</strong>
        {weather && <span className="text-slate-400">{`예보 ${weather.min ?? '-'}~${weather.max ?? '-'}°`}</span>}
        {weather?.pop != null && <span className={popClass(weather.pop, 'text-slate-400')}>{`강수 ${weather.pop}%`}</span>}
        {weather?.rain && <span className="summary-compact-alert is-advisory">{`${weather.rain.kind} ${weather.rain.hours}`}</span>}
        {weather?.rain?.amount && <span className="summary-compact-alert is-advisory">{weather.rain.amount}</span>}
        {weather?.popTomorrow != null && <span className={popClass(weather.popTomorrow, 'text-slate-400')}>{`내일 강수 ${weather.popTomorrow}%`}</span>}
        {firstAlert
          ? <span className={`summary-compact-alert ${firstAlert.level === '주의보' ? 'is-advisory' : 'is-warning'}`}>{`${firstAlert.kind}${firstAlert.level}${alerts.data!.warnings.length > 1 ? ` 외 ${alerts.data!.warnings.length - 1}` : ''}`}</span>
          : (!weather || today.error) && <span className="text-slate-400">{!area ? site?.address ? '위치 선택 필요' : '주소 미등록' : weather ? `${clock(today.at)} 값` : today.error ? '불러오지 못함' : '불러오는 중'}</span>}
        <RadarLink className="is-compact" />
      </div>
      <div className="summary-card-compact bg-slate-900 border border-slate-800 rounded-xl">
        <span className="text-slate-400">부위</span>
        {Object.keys(memberCounts).length > 0
          ? Object.entries(memberCounts).slice(0, 2).map(([member, count]) => <span key={member} className="summary-compact-member text-slate-100">{member} <strong>{count}</strong></span>)
          : <span className="text-slate-500">기록 없음</span>}
        {Object.keys(memberCounts).length > 2 && <span className="text-slate-400">외 {Object.keys(memberCounts).length - 2}종</span>}
      </div>

    </div>
  );
};
