import React from 'react';
import { ProgressBuilding, buildingLabel } from '@/lib/pouring-progress';
import { progressPrintPages } from '@/lib/progress-print';
import { progressColor } from '@/lib/progress-color';
import { difference, gap, shortDate } from '@/lib/date-only';

export function ProgressPrint({ buildings, siteName, basis, ink }: {
  buildings: ProgressBuilding[]; siteName: string; basis: string; ink: (color: string) => string;
}) {
  const pages = progressPrintPages(buildings);
  return <div className="progress-print-only">{pages.map((page, index) => <section className="progress-print-sheet" key={index}>
    <h2>{siteName} · 동별 타설현황</h2>
    <p>{shortDate(basis)} 기준 · {page.buildings.map(b => buildingLabel(b.name)).join(', ')} · {index + 1} / {pages.length}</p>
    <table className="progress-print-grid">
      <colgroup><col style={{ width: '8%' }}/></colgroup>
      {page.buildings.map(b => <colgroup key={b.id}><col/><col/><col/></colgroup>)}
      <thead><tr><th rowSpan={2}>층 / 단계</th>{page.buildings.map(b => <th key={b.id} colSpan={3}>{buildingLabel(b.name)}</th>)}</tr>
        <tr>{page.buildings.map(b => <React.Fragment key={b.id}><th>예정일</th><th>실시일</th><th>차이</th></React.Fragment>)}</tr></thead>
      <tbody>{page.rows.map(row => <tr key={row.id}>
        <th>{Array.from(new Set(page.buildings.flatMap(b => b.stages.filter(s => s.id === row.id).map(s => s.name)))).join(' / ')}</th>
        {page.buildings.map(b => {
          if (!b.stages.some(s => s.id === row.id)) return <td key={b.id} colSpan={3}>해당 없음</td>;
          const record = b.records[row.id], background = progressColor(record);
          const style = background ? { backgroundColor: background, color: ink(background) } : undefined;
          return <React.Fragment key={b.id}>
            <td style={style}>{record?.plannedDate ? shortDate(record.plannedDate, '.') : '—'}</td>
            <td style={style}>{record?.date ? shortDate(record.date, '.') : '—'}</td>
            <td>{!record?.date && !record?.plannedDate ? '—' : gap(difference(record?.plannedDate || '', record?.date || ''))}</td>
          </React.Fragment>;
        })}</tr>)}</tbody>
    </table>
  </section>)}</div>;
}
