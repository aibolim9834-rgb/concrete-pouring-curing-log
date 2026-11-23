'use client';
import React, { useEffect, useId, useRef, useState } from 'react';

// 내보내기 ▼: 인쇄·이미지·엑셀 as a small group of buttons in a popover, the same way as the ⋯ next to a site (SiteModal):
// not an ARIA menu, so Tab moves through the items. Placed under the button by script because CSS anchor positioning
// is not yet in every browser. Browsers without popover show the buttons on the row instead.
export type ExportItem = { text: string; run: () => void; disabled?: boolean; title?: string };

export function ExportMenu({ items, label = '내보내기', busy, className = '' }: { items: ExportItem[]; label?: string; busy?: string; className?: string }) {
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [inline, setInline] = useState(false);
  const panelId = useId();
  useEffect(() => {
    const menu = panel.current;
    if (!menu || !('popover' in HTMLElement.prototype)) { setInline(true); return; }
    const close = () => menu.hidePopover();
    const onToggle = (event: Event) => {
      const isOpen = (event as ToggleEvent).newState === 'open';
      setOpen(isOpen);
      if (isOpen) {
        // Below the button, left edges aligned; above it when the window bottom is too close.
        const box = trigger.current!.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
        const top = box.bottom + 4 + height > window.innerHeight - 8 ? Math.max(8, box.top - 4 - height) : box.bottom + 4;
        menu.style.top = `${top}px`;
        menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
        // The page scrolls under a fixed panel, so scrolling or resizing closes it instead of leaving it behind.
        window.addEventListener('scroll', close, { capture: true, once: true });
        window.addEventListener('resize', close, { once: true });
      } else {
        window.removeEventListener('scroll', close, { capture: true });
        window.removeEventListener('resize', close);
        // Esc or a click outside hides the focused item; put focus back on the button rather than losing it.
        if (document.activeElement === document.body || menu.contains(document.activeElement)) trigger.current?.focus();
      }
    };
    menu.addEventListener('toggle', onToggle);
    return () => { menu.removeEventListener('toggle', onToggle); window.removeEventListener('scroll', close, { capture: true }); window.removeEventListener('resize', close); };
  }, []);
  const buttons = items.map(item =>
    <button key={item.text} type="button" className={inline ? `ui-button ${className}`.trim() : undefined} disabled={item.disabled} title={item.title}
      onClick={() => { if (panel.current?.matches(':popover-open')) panel.current.hidePopover(); item.run(); }}>{item.text}</button>);
  if (inline) return <>{buttons}</>;
  return <>
    <button ref={trigger} type="button" className={`ui-button export-menu-trigger ${className}`.trim()} disabled={!!busy} aria-expanded={open} aria-controls={panelId}
      onClick={() => { const menu = panel.current; if (menu) { if (menu.matches(':popover-open')) menu.hidePopover(); else menu.showPopover(); } }}>
      {busy || <>{label}<span className="export-menu-caret" aria-hidden="true">▼</span></>}
    </button>
    {/* Right after its button so Tab moves from 내보내기 into the open panel. */}
    <div ref={panel} id={panelId} popover="auto" className="export-menu">{buttons}</div>
  </>;
}
