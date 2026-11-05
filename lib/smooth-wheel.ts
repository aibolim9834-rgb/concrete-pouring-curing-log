// With Windows animation effects off, the browser reports prefers-reduced-motion and drops its own wheel smoothing,
// so each wheel notch jumps ~100px in one frame. On such machines this eases mouse-wheel steps over a short glide.
// Elsewhere it does nothing and the browser's own scrolling stays in charge.
// Use as a React 19 ref callback: <div ref={smoothWheel}> (the returned function is the ref cleanup).
const DURATION_MS = 150;
const LINE_PX = 40;

export function smoothWheel(el: HTMLElement | null) {
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, from = 0, target = 0, start = 0, lastSet = 0;

  const step = (now: number) => {
    // A scrollbar drag, key press or script moved the list mid-glide: stop and let that win.
    if (Math.abs(el.scrollTop - lastSet) > 1) { frame = 0; return; }
    // The frame time can be a little earlier than the wheel event's start time, so clamp at 0 as well.
    const t = Math.min(1, Math.max(0, (now - start) / DURATION_MS));
    el.scrollTop = from + (target - from) * (1 - (1 - t) ** 3);
    lastSet = el.scrollTop;
    frame = t < 1 ? requestAnimationFrame(step) : 0;
  };

  const onWheel = (e: WheelEvent) => {
    if (!reduced.matches || e.defaultPrevented || e.ctrlKey || e.shiftKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // Touchpads already send many small pixel steps; only whole wheel notches (or line/page deltas) need smoothing.
    if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(e.deltaY) < 50) return;
    // A scrollable box inside the list that can still move this way scrolls on its own.
    for (let node = e.target instanceof Element ? e.target : null; node && node !== el; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight
        && (e.deltaY < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1)) return;
    }
    const delta = e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_PX : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientHeight : 1);
    const max = el.scrollHeight - el.clientHeight;
    const gliding = frame !== 0 && Math.abs(el.scrollTop - lastSet) <= 1;
    const next = Math.max(0, Math.min(max, (gliding ? target : el.scrollTop) + delta));
    // Already at the top or bottom: leave the event alone (overscroll-behavior keeps the page still).
    if (!gliding && Math.abs(next - el.scrollTop) < 1) return;
    e.preventDefault();
    from = el.scrollTop; lastSet = from; target = next; start = performance.now();
    if (!frame) frame = requestAnimationFrame(step);
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  return () => { el.removeEventListener('wheel', onWheel); cancelAnimationFrame(frame); };
}
