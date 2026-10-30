'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface NavBuilding { id: string; label: string; summary: string }

// Header cells of the comparison table, read from the live layout so both helpers follow column widths as they change.
function tableHeader(wrap: HTMLElement | null) {
  const head = wrap?.querySelector('thead');
  const stage = head?.querySelector<HTMLElement>('tr:first-child > th:first-child');
  const groups = Array.from(head?.querySelectorAll<HTMLElement>('tr:first-child > th.comparison-building-header') ?? []);
  const leaves = Array.from(head?.querySelectorAll<HTMLElement>('tr:nth-child(2) > th') ?? []);
  return { head, stage, groups, leaves };
}
// Keeps work to one layout read per frame however fast scroll events arrive.
function useFrame(callback: () => void) {
  const frame = useRef(0), latest = useRef(callback);
  useEffect(() => { latest.current = callback; });
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // One stable function, so listeners attached with it are not re-attached on every render.
  const [run] = useState(() => () => { if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; latest.current(); }); });
  return run;
}

// ◀ ▶ and one button per building; the buttons for buildings now on screen are marked.
export function ProgressBuildingNav({ wrapRef, buildings }: { wrapRef: React.RefObject<HTMLDivElement | null>; buildings: NavBuilding[] }) {
  const [state, setState] = useState({ overflow: false, shown: [] as boolean[], first: 0, atStart: true, atEnd: true });
  const chipsRef = useRef<HTMLDivElement>(null);
  const measure = useFrame(() => {
    const wrap = wrapRef.current, { stage, groups } = tableHeader(wrap);
    if (!wrap || !stage) return;
    const left = wrap.scrollLeft, view = wrap.clientWidth - stage.offsetWidth;
    const shown = groups.map(g => { const a = g.offsetLeft - stage.offsetWidth - left, b = a + g.offsetWidth; return b > 8 && a < view - 8; });
    const next = { overflow: wrap.scrollWidth > wrap.clientWidth + 1, shown, first: Math.max(0, shown.indexOf(true)), atStart: left <= 1, atEnd: left + wrap.clientWidth >= wrap.scrollWidth - 1 };
    setState(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap); const table = wrap.querySelector('table'); if (table) observer.observe(table);
    wrap.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => { observer.disconnect(); wrap.removeEventListener('scroll', measure); };
  }, [wrapRef, buildings.length, measure]);
  // Keep the first marked button visible inside the button row without scrolling the page.
  useEffect(() => {
    const box = chipsRef.current, chip = box?.children[state.first] as HTMLElement | undefined;
    if (!box || !chip) return;
    const a = chip.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (a.left < b.left || a.right > b.right) box.scrollLeft += a.left - b.left;
  }, [state.first]);
  function goTo(index: number) {
    const wrap = wrapRef.current, { stage, groups } = tableHeader(wrap);
    const group = groups[Math.max(0, Math.min(groups.length - 1, index))];
    if (!wrap || !stage || !group) return;
    wrap.scrollTo({ left: group.offsetLeft - stage.offsetWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  if (buildings.length < 2 || !state.overflow) return null;
  return <div className="progress-building-nav" role="group" aria-label="동 이동">
    <span className="ui-label">동 이동</span>
    <button type="button" className="ui-button progress-building-step" aria-label="이전 동" disabled={state.atStart} onClick={() => goTo(state.first - 1)}>◀</button>
    <div ref={chipsRef} className="progress-building-chips">{buildings.map((b, i) =>
      <button type="button" key={b.id} className="progress-building-chip" data-shown={state.shown[i] || undefined} title={b.label} aria-label={`${b.label}${state.shown[i] ? ' · 화면에 보임' : ''}, 이 동으로 이동`} onClick={() => goTo(i)}>{b.label.replace(/\s*[(（].*$/, '') || b.label}</button>)}</div>
    <button type="button" className="ui-button progress-building-step" aria-label="다음 동" disabled={state.atEnd} onClick={() => goTo(state.first + 1)}>▶</button>
  </div>;
}

// A copy of the building header that sticks under the toolbar once the real header has scrolled away.
// It scrolls sideways with the table, so it also works as a scroll handle near the top of the screen.
export function ProgressFloatingHeader({ wrapRef, buildings }: { wrapRef: React.RefObject<HTMLDivElement | null>; buildings: NavBuilding[] }) {
  const [layout, setLayout] = useState<{ show: boolean; left: number; width: number; columns: number[]; groupHeight: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null), stripRef = useRef<HTMLDivElement>(null), syncing = useRef<'wrap' | 'strip' | null>(null);
  const measure = useFrame(() => {
    const wrap = wrapRef.current, anchor = anchorRef.current, { head, stage, groups, leaves } = tableHeader(wrap);
    if (!wrap || !anchor || !head || !stage) return;
    const top = anchor.getBoundingClientRect().top, show = head.getBoundingClientRect().bottom < top + 1;
    const next = { show, left: wrap.getBoundingClientRect().left - anchor.getBoundingClientRect().left, width: wrap.clientWidth,
      columns: [stage.offsetWidth, ...leaves.map(cell => cell.offsetWidth)], groupHeight: groups[0]?.offsetHeight ?? 0 };
    setLayout(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap); const table = wrap.querySelector('table'); if (table) observer.observe(table);
    window.addEventListener('scroll', measure, { passive: true }); window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [wrapRef, buildings.length, measure]);
  // Cells reached with the arrow keys scroll clear of this row too.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--progress-float-height', layout?.show ? `${stripRef.current?.offsetHeight ?? 0}px` : '0px');
    return () => root.setProperty('--progress-float-height', '0px');
  }, [layout?.show, layout?.groupHeight]);
  // Two-way scroll sync; each side ignores the echo of the scroll it caused.
  useEffect(() => {
    const wrap = wrapRef.current, strip = stripRef.current;
    if (!wrap || !strip || !layout?.show) return;
    strip.scrollLeft = wrap.scrollLeft;
    const follow = (from: HTMLElement, to: HTMLElement, side: 'wrap' | 'strip') => () => {
      if (syncing.current && syncing.current !== side) return;
      syncing.current = side; to.scrollLeft = from.scrollLeft;
      requestAnimationFrame(() => { syncing.current = null; });
    };
    const fromWrap = follow(wrap, strip, 'wrap'), fromStrip = follow(strip, wrap, 'strip');
    wrap.addEventListener('scroll', fromWrap, { passive: true }); strip.addEventListener('scroll', fromStrip, { passive: true });
    return () => { wrap.removeEventListener('scroll', fromWrap); strip.removeEventListener('scroll', fromStrip); };
  }, [wrapRef, layout?.show]);
  const columns = layout?.columns ?? [];
  return <div ref={anchorRef} className="progress-float-anchor print:hidden" aria-hidden="true">
    {layout?.show && columns.length === buildings.length * 3 + 1 && <div ref={stripRef} className="progress-float-header" style={{ left: layout.left, width: layout.width }}>
      <div className="progress-float-grid" style={{ gridTemplateColumns: columns.map(w => `${w}px`).join(' '), gridTemplateRows: `${layout.groupHeight}px auto` }}>
        <div className="progress-float-stage">층 / 단계</div>
        {buildings.map(b => <div key={b.id} className="progress-float-building"><span>{b.label}</span><small>{b.summary}</small></div>)}
        {buildings.map(b => <React.Fragment key={b.id}><div>예정일</div><div>타설일</div><div className="progress-float-end">차이</div></React.Fragment>)}
      </div>
    </div>}
  </div>;
}
