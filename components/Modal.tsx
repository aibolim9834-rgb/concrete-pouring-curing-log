'use client';

import React, { useEffect, useRef } from 'react';

export function Modal({ onClose, labelledBy, children }: {
  onClose: () => void; labelledBy: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return <dialog ref={ref} aria-labelledby={labelledBy} className="app-modal"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    {children}
  </dialog>;
}
