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

// Two-way scroll sync; each side ignores the echo of the scroll it caused. Returns the cleanup.
function linkScroll(a: HTMLElement, b: HTMLElement) {
  let leader: HTMLElement | null = null;
  const follow = (from: HTMLElement, to: HTMLElement) => () => {
    if (leader && leader !== from) return;
    leader = from; to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { leader = null; });
  };
  const fromA = follow(a, b), fromB = follow(b, a);
  b.scrollLeft = a.scrollLeft;
  a.addEventListener('scroll', fromA, { passive: true }); b.addEventListener('scroll', fromB, { passive: true });
  return () => { a.removeEventListener('scroll', fromA); b.removeEventListener('scroll', fromB); };
}

// One button per building (the one in focus is marked) and a horizontal scrollbar that moves the table,
// both in the fixed toolbar block so the table can be moved sideways from the top of the screen.
export function ProgressBuildingNav({ wrapRef, buildings }: { wrapRef: React.RefObject<HTMLDivElement | null>; buildings: NavBuilding[] }) {
  const [state, setState] = useState({ overflow: false, active: 0, left: 0, width: 0, inner: 0 });
  const chipsRef = useRef<HTMLDivElement>(null), trackRef = useRef<HTMLDivElement>(null), picked = useRef<number | null>(null), settling = useRef(0);
  const measure = useFrame(() => {
    // The scrollbar is lined up with the table relative to the row it sits in.
    const wrap = wrapRef.current, holder = trackRef.current?.parentElement, { stage, groups } = tableHeader(wrap);
    if (!wrap || !stage) return;
    // One marked building: the one last picked while it is still at least half on screen, otherwise the one nearest the middle.
    const from = wrap.scrollLeft + stage.offsetWidth, to = wrap.scrollLeft + wrap.clientWidth, middle = (from + to) / 2;
    const onScreen = (g: HTMLElement) => Math.min(to, g.offsetLeft + g.offsetWidth) - Math.max(from, g.offsetLeft) >= g.offsetWidth / 2;
    // The smooth scroll toward a picked building starts with it off screen; give it time to arrive before letting go.
    if (picked.current !== null && performance.now() > settling.current && !(groups[picked.current] && onScreen(groups[picked.current]))) picked.current = null;
    const nearest = groups.reduce((best, g, i) => Math.abs(g.offsetLeft + g.offsetWidth / 2 - middle) < Math.abs(groups[best].offsetLeft + groups[best].offsetWidth / 2 - middle) ? i : best, 0);
    const next = { overflow: wrap.scrollWidth > wrap.clientWidth + 1, active: picked.current ?? nearest,
      left: holder ? Math.round(wrap.getBoundingClientRect().left - holder.getBoundingClientRect().left) : 0, width: wrap.clientWidth, inner: wrap.scrollWidth };
    setState(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap); const table = wrap.querySelector('table'); if (table) observer.observe(table);
    wrap.addEventListener('scroll', measure, { passive: true }); window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); wrap.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [wrapRef, buildings.length, measure]);
  const visible = buildings.length > 1 && state.overflow;
  // The navigator only exists while the table overflows; measure again once it is on screen so the scrollbar lines up.
  useEffect(() => { if (visible) measure(); }, [visible, measure]);
  useEffect(() => {
    const wrap = wrapRef.current, track = trackRef.current;
    return wrap && track && visible ? linkScroll(wrap, track) : undefined;
  }, [wrapRef, visible]);
  // Keep the marked button visible inside the button row without scrolling the page.
  useEffect(() => {
    const box = chipsRef.current, chip = box?.children[state.active] as HTMLElement | undefined;
    if (!box || !chip) return;
    const a = chip.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (a.left < b.left || a.right > b.right) box.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
  }, [state.active]);
  // A picked building moves to the middle of the visible table area (the table's ends stop it at the edges).
  function goTo(index: number) {
    const wrap = wrapRef.current, { stage, groups } = tableHeader(wrap), group = groups[index];
    if (!wrap || !stage || !group) return;
    picked.current = index; settling.current = performance.now() + 1200;
    const view = wrap.clientWidth - stage.offsetWidth;
    wrap.scrollTo({ left: group.offsetLeft + group.offsetWidth / 2 - stage.offsetWidth - view / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    measure();
  }
  if (!visible) return null;
  // Two pieces for the parent's grid: the buttons beside 작업일·구역 내역, the scrollbar on its own row under them.
  return <>
    <div className="progress-building-row" role="group" aria-label="동 이동">
      <span className="ui-label">동 이동</span>
      <div ref={chipsRef} className="progress-building-chips">{buildings.map((b, i) =>
        <button type="button" key={b.id} className="progress-building-chip" aria-current={state.active === i || undefined} title={b.label} aria-label={`${b.label}, 가운데로 이동`} onClick={() => goTo(i)}>{b.label.replace(/\s*[(（].*$/, '') || b.label}</button>)}</div>
    </div>
    <div ref={trackRef} className="progress-building-scroll" aria-hidden="true" style={{ marginInlineStart: state.left, inlineSize: state.width }}><div style={{ inlineSize: state.inner }}/></div>
  </>;
}

// A copy of the building header that sticks under the toolbar once the real header has scrolled away.
// It scrolls sideways with the table (wheel or drag), without a scrollbar of its own: the toolbar block has one.
export function ProgressFloatingHeader({ wrapRef, buildings }: { wrapRef: React.RefObject<HTMLDivElement | null>; buildings: NavBuilding[] }) {
  const [layout, setLayout] = useState<{ show: boolean; left: number; width: number; columns: number[]; groupHeight: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null), stripRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    const wrap = wrapRef.current, strip = stripRef.current;
    return wrap && strip && layout?.show ? linkScroll(wrap, strip) : undefined;
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
