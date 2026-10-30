import React from 'react';
import { ProgressBuilding, buildingLabel } from '@/lib/pouring-progress';
import { progressPrintLayout } from '@/lib/progress-print';
import { progressColor } from '@/lib/progress-color';
import { pourDatesLabel } from '@/lib/progress-entries';
import { shortDate } from '@/lib/date-only';

export function ProgressPrint({ buildings, siteName, basis, ink }: {
  buildings: ProgressBuilding[]; siteName: string; basis: string; ink: (color: string) => string;
}) {
  const layout = progressPrintLayout(buildings);
  if (!layout) return null;
  const { groups } = layout;
  const lines = groups.reduce((sum, group) => sum + Math.max(...group.map(block => block.stages.length)) + 3, 0);
  // Sizes are set in page units in CSS, so the sheet fills the paper whatever scale or margins the print dialog uses.
  return <div className="progress-print-only"><section className="progress-print-sheet" style={{ '--print-per-row': groups[0].length, '--print-groups': groups.length, '--print-lines': lines } as React.CSSProperties}>
    <h2>{siteName} · 동별 타설현황</h2>
    <p>{shortDate(basis)} 기준 · {buildings.length}개 동</p>
    {groups.map((group, index) => {
      // Blocks in a row share a height; shorter buildings leave the top empty so 버림·기초·1F line up.
      const height = Math.max(...group.map(block => block.stages.length));
      return <div className="progress-print-row" key={index}>{group.map(({ building: b, stages }) => <table className="progress-print-block" key={b.id}>
        <colgroup><col className="progress-print-floor"/><col/></colgroup>
        <thead><tr><th colSpan={2}>{buildingLabel(b.name)}</th></tr><tr><th>층</th><th>타설일</th></tr></thead>
        <tbody>
          {Array.from({ length: height - stages.length }, (_, i) => <tr key={`pad-${i}`} className="is-pad"><th/><td/></tr>)}
          {stages.map(s => {
            const record = b.records[s.id], background = progressColor(record);
            return <tr key={s.id}><th>{s.name}</th>
              <td className={record?.dates && record.dates.length > 1 ? 'is-multi' : undefined} style={background ? { backgroundColor: background, color: ink(background) } : undefined}>{record?.date ? pourDatesLabel(record) : ''}</td></tr>;
          })}
        </tbody>
      </table>)}</div>;
    })}
  </section></div>;
}
