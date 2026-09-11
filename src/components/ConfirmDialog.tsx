import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { openConfirmDialog, closeConfirmDialog } from '../utils/modalEscape';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  alternateLabel?: string;
  tone?: 'danger' | 'default';
  busy?: boolean;
  /** Disable only the destructive/primary action while leaving safer exits available. */
  confirmDisabled?: boolean;
  /** Choose the initially focused action; destructive dialogs can default to cancel. */
  initialFocus?: 'confirm' | 'cancel';
  onConfirm: () => void;
  onAlternate?: () => void;
  onCancel: () => void;
}

/**
 * Accessible, non-blocking confirmation dialog used in place of the native
 * window.confirm() for a consistent, on-brand delete/confirm experience.
 * Focus is trapped and the configured initial action is focused on open.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  alternateLabel,
  tone = 'default',
  busy = false,
  confirmDisabled = false,
  initialFocus = 'confirm',
  onConfirm,
  onAlternate,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Confirm dialogs sit above another modal, so they need their own focus trap
  // and Escape handler. This also restores focus to the triggering control when
  // the confirmation closes.
  useFocusTrap(
    dialogRef,
    open,
    undefined,
    initialFocus === 'cancel' ? cancelRef : confirmRef,
  );

  useEffect(() => {
    if (!open) return;
    openConfirmDialog();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      closeConfirmDialog();
      window.removeEventListener('keydown', onKey);
    };
  }, [busy, open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-600">{message}</p>
        <div className={`mt-6 flex gap-3 ${alternateLabel ? 'flex-col' : ''}`}>
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-wait disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          {alternateLabel && onAlternate && (
            <button
              type="button"
              onClick={onAlternate}
              disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-lg border border-[#4A1942]/30 text-sm font-medium text-[#4A1942] hover:bg-[#4A1942]/5 disabled:cursor-wait disabled:opacity-50"
            >
              {alternateLabel}
            </button>
          )}
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:cursor-wait disabled:opacity-50 ${
              tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#4A1942] hover:bg-[#3b1435]'
            }`}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
