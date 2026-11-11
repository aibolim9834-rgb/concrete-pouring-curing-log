'use client';

import React, { useEffect, useRef, useState } from 'react';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}
type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };

let open: ((request: ConfirmRequest) => void) | null = null;

/** Asks in the app's own dialog so the action sits left and 취소 right on every device; falls back to the browser's confirm before the host mounts. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    if (open) open({ ...options, resolve });
    else resolve(window.confirm(options.message ? `${options.title}\n${options.message}` : options.title));
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    open = next => setRequest(current => { current?.resolve(false); return next; });
    return () => { open = null; };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!request || !dialog || dialog.open) return;
    opener.current = document.activeElement;
    dialog.showModal();
    // A destructive action never runs from a stray Enter: focus starts on 취소.
    cancelRef.current?.focus();
  }, [request]);

  function finish(ok: boolean) {
    if (!request) return;
    dialogRef.current?.close();
    request.resolve(ok);
    setRequest(null);
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected) target.focus();
  }

  if (!request) return null;
  return <dialog ref={dialogRef} className="app-modal confirm-dialog" aria-labelledby="confirm-dialog-title"
    aria-describedby={request.message ? 'confirm-dialog-message' : undefined}
    onCancel={event => { event.preventDefault(); finish(false); }}>
    <div className="confirm-dialog-box">
      <h2 id="confirm-dialog-title">{request.title}</h2>
      {request.message && <p id="confirm-dialog-message">{request.message}</p>}
      <div className="confirm-dialog-buttons">
        <button type="button" className={`ui-button ${request.danger ? 'ui-danger' : 'ui-primary'}`} onClick={() => finish(true)}>{request.confirmLabel}</button>
        <button type="button" ref={cancelRef} className="ui-button" onClick={() => finish(false)}>{request.cancelLabel ?? '취소'}</button>
      </div>
    </div>
  </dialog>;
}
