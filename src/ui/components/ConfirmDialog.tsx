import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** Okno potwierdzenia na elemencie <dialog> (obsługa klawiatury i fokusu przez przeglądarkę). */
export function ConfirmDialog({
  open,
  title,
  tone,
  children,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  tone?: 'danger';
  children: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="confirm"
      data-tone={tone}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-title"
    >
      <h2 id="confirm-title">{title}</h2>
      {children}
      <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn" onClick={onCancel} autoFocus>
          Anuluj
        </button>
        <button type="button" className={tone === 'danger' ? 'btn danger' : 'btn primary'} disabled={confirmDisabled} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
