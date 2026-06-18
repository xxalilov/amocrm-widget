import React from 'react';

// In-widget confirmation dialog (replaces the browser's window.confirm, which
// is blocked/ugly inside the amoCRM iframe). Rendered only when `open` is true.
export default function ConfirmModal({
  open,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__body">{message}</div>
        <div className="modal__actions">
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn--danger" type="button" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
