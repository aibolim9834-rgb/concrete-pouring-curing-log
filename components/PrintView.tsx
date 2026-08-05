'use client';

import React from 'react';
import { PouringLog, Site } from '@/lib/types';
import { Printer, ArrowLeft } from 'lucide-react';

interface PrintViewProps {
  logs: PouringLog[];
  sites: Site[];
  currentSite: Site | undefined;
  onBack: () => void;
}

export const PrintView: React.FC<PrintViewProps> = ({
  logs,
  sites,
  currentSite,
  onBack,
}) => {
  const handlePrint = () => {
    window.print();
  };

  // Ensure table has at least 12 rows (filled with empty rows if logs are fewer) to preserve official sheet format
  const minRows = 12;
  const filledLogs = [...logs];
  while (filledLogs.length < minRows) {
    filledLogs.push({
      id: `empty-${filledLogs.length}`,
      site_id: currentSite?.id || '',
      category: '',
      date: '',
      building: '',
      floor: '',
      member_type: '',
      min_temp: null,
      max_temp: null,
      weather: '',
      remicon_company: '',
      curing_watering: '',
      curing_protection: '',
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 p-4 sm:p-8 print:p-0 print:bg-white">
      
      {/* Top Toolbar (Hidden on Print) */}
      <div className="max-w-[1100px] mx-auto mb-6 flex items-center justify-between print:hidden">
        <button
          onClick={onBack}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" /> 대시보드로 돌아가기
        </button>
        <button
          onClick={handlePrint}
          className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-lg"
        >
          <Printer className="w-4 h-4" /> 인쇄 / PDF 저장
        </button>
      </div>

      {/* Official A4 Sheet Document Container */}
      <div className="max-w-[1100px] mx-auto bg-white p-6 sm:p-10 shadow-2xl border border-slate-300 print:shadow-none print:border-none print:w-full print:p-0">
        
        {/* Title */}
        <div className="text-center mb-6 border-b-2 border-black pb-4">
          <h1 className="text-2xl font-black tracking-wider text-black">
            콘크리트 타설 및 양생 관리 일지
          </h1>
        </div>

        {/* Top Info Header */}
        <div className="mb-3 text-sm font-bold text-black flex items-center justify-between border-b border-gray-400 pb-2">
          <div>
            현장명 : <span className="underline ml-2">{currentSite?.name || '____________________'}</span>
          </div>
          <div className="text-xs font-normal text-gray-600">
            출력일자: {new Date().toLocaleDateString('ko-KR')}
          </div>
        </div>

        {/* Main Excel Sheet Table */}
        <table className="w-full border-collapse border border-black text-xs text-center text-black mb-8">
          <thead>
            {/* Header Row 1 */}
            <tr className="bg-gray-100 font-bold border-b border-black">
              <th rowSpan={2} className="border border-black px-2 py-2.5 w-12">
                구분
              </th>
              <th rowSpan={2} className="border border-black px-2 py-2.5 w-24">
                일자
              </th>
              <th colSpan={3} className="border border-black px-2 py-1.5">
                타설위치
              </th>
              <th rowSpan={2} className="border border-black px-1 py-2.5 w-16">
                최저온도
              </th>
              <th rowSpan={2} className="border border-black px-1 py-2.5 w-16">
                최고온도
              </th>
              <th rowSpan={2} className="border border-black px-2 py-2.5 w-28">
                기상(눈/비/맑음)
              </th>
              <th rowSpan={2} className="border border-black px-2 py-2.5 w-24">
                레미콘사
              </th>
              <th rowSpan={2} className="border border-black px-2 py-2.5 w-20">
                타설강도
              </th>
              <th rowSpan={2} className="border border-black px-2 py-2.5 w-20">
                타설물량
              </th>
              <th colSpan={2} className="border border-black px-2 py-1.5">
                양생방법
              </th>
            </tr>

            {/* Header Row 2 */}
            <tr className="bg-gray-100 font-bold border-b border-black text-[11px]">
              <th className="border border-black px-2 py-1.5">동(구역)</th>
              <th className="border border-black px-1 py-1.5">층</th>
              <th className="border border-black px-2 py-1.5">벽/슬라브</th>
              <th className="border border-black px-2 py-1.5">살수</th>
              <th className="border border-black px-2 py-1.5">보양</th>
            </tr>
          </thead>

          <tbody>
            {filledLogs.map((log, index) => (
              <tr key={log.id} className="h-8 border-b border-black">
                <td className="border border-black px-1 py-1 text-center font-medium">
                  {log.category || (log.date ? index + 1 : '')}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {log.date}
                </td>
                <td className="border border-black px-2 py-1 text-left">
                  {log.building}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {log.floor}
                </td>
                <td className="border border-black px-2 py-1 text-center">
                  {log.member_type}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {log.min_temp !== null && log.min_temp !== undefined ? `${log.min_temp}°C` : ''}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {log.max_temp !== null && log.max_temp !== undefined ? `${log.max_temp}°C` : ''}
                </td>
                <td className="border border-black px-2 py-1 text-center">
                  {log.weather}
                </td>
                <td className="border border-black px-2 py-1 text-left truncate">
                  {log.remicon_company}
                </td>
                <td className="border border-black px-1 py-1 text-center font-medium">
                  {log.strength}
                </td>
                <td className="border border-black px-1 py-1 text-center font-medium">
                  {log.volume !== null && log.volume !== undefined && log.volume !== '' ? `${log.volume} m³` : ''}
                </td>
                <td className="border border-black px-2 py-1 text-left truncate">
                  {log.curing_watering}
                </td>
                <td className="border border-black px-2 py-1 text-left truncate">
                  {log.curing_protection}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Bottom Section: 해당 현장명 목록 (Matching Excel sheet structure bottom section!) */}
        <div className="border border-black p-4 mt-6">
          <div className="grid grid-cols-12 gap-2 text-xs">
            <div className="col-span-3 font-bold border-r border-black pr-2 flex items-center justify-center bg-gray-50">
              해당현장명
            </div>
            <div className="col-span-9 pl-3 space-y-1">
              {sites.map((site) => (
                <div key={site.id} className="text-gray-900 font-medium">
                  • {site.name} {site.code ? `(${site.code})` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Approval Signatures */}
        <div className="mt-8 pt-4 flex justify-end gap-8 text-xs font-bold text-black border-t border-gray-300">
          <div>작성자: ________________ (인)</div>
          <div>검토자: ________________ (인)</div>
          <div>승인자: ________________ (인)</div>
        </div>

      </div>

    </div>
  );
};
