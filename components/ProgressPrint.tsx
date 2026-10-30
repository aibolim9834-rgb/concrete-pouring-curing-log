import React from 'react';
import { ProgressBuilding, buildingLabel } from '@/lib/pouring-progress';
import { progressPrintLayout } from '@/lib/progress-print';
import { progressColor } from '@/lib/progress-color';
import { pourDatesLabel } from '@/lib/progress-entries';
import { difference, gap, shortDate } from '@/lib/date-only';

export function ProgressPrint({ buildings, siteName, basis, ink }: {
  buildings: ProgressBuilding[]; siteName: string; basis: string; ink: (color: string) => string;
}) {
  if (!buildings.length) return null;
  const { rows, rowHeight, fontSize, stageWidth } = progressPrintLayout(buildings);
  return <div className="progress-print-only"><section className="progress-print-sheet">
    <h2>{siteName} · 동별 타설현황</h2>
    <p>{shortDate(basis)} 기준 · {buildings.length}개 동 · 층·단계 {rows.length}개</p>
    <table className="progress-print-grid" style={{ '--print-font': `${fontSize}px`, '--print-row': `${rowHeight}px` } as React.CSSProperties}>
      <colgroup><col style={{ width: `${stageWidth}px` }}/></colgroup>
      {buildings.map(b => <colgroup key={b.id}><col/><col/><col/></colgroup>)}
      <thead><tr><th rowSpan={2}>층 / 단계</th>{buildings.map(b => <th key={b.id} colSpan={3}>{buildingLabel(b.name)}</th>)}</tr>
        <tr>{buildings.map(b => <React.Fragment key={b.id}><th>예정일</th><th>실시일</th><th>차이</th></React.Fragment>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <th>{Array.from(new Set(buildings.flatMap(b => b.stages.filter(s => s.id === row.id).map(s => s.name)))).join(' / ')}</th>
        {buildings.map(b => {
          if (!b.stages.some(s => s.id === row.id)) return <td key={b.id} colSpan={3}>해당 없음</td>;
          const record = b.records[row.id], background = progressColor(record);
          const style = background ? { backgroundColor: background, color: ink(background) } : undefined;
          return <React.Fragment key={b.id}>
            <td style={style}>{record?.plannedDate ? shortDate(record.plannedDate, '.') : '—'}</td>
            <td style={style}>{record?.date ? pourDatesLabel(record) : '—'}</td>
            <td>{!record?.date && !record?.plannedDate ? '—' : gap(difference(record?.plannedDate || '', record?.date || ''))}</td>
          </React.Fragment>;
        })}</tr>)}</tbody>
    </table>
  </section></div>;
}
