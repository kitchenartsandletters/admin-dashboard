// src/components/ConfirmModal.tsx
import React, { useEffect, useRef } from 'react';

type Variant = 'primary' | 'danger';

export interface ConfirmModalProps {
  /** Controls visibility */
  open: boolean;
  /** Heading at the top of the modal */
  title: string;
  /** Main content/body (accepts JSX) */
  children?: React.ReactNode;
  /** Optional text under the title (if you don't pass children) */
  description?: string;
  /** Disable confirm button if items.length === 0 */
  confirmDisabled?: boolean;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Style of confirm button */
  variant?: Variant;
  /** Disable buttons + show “busy” state */
  busy?: boolean;

  /** Called when user confirms */
  onConfirm: () => void | Promise<void>;
  /** Called when user cancels or clicks outside/presses ESC */
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  children,
  description,
  confirmDisabled = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Close on ESC and focus management
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);

    // Set initial focus to confirm button (or dialog)
    const t = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 0);

    // Optional: prevent body scroll while modal is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBtnClasses =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
      : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Centered panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          ref={dialogRef}
          className="
            w-full max-w-md rounded-2xl shadow-xl
            bg-white dark:bg-gray-900 border dark:border-gray-700
            transform transition-all duration-200
            animate-[fadeIn_.2s_ease-out,scaleIn_.2s_ease-out]
          "
        >
          {/* Header */}
          <div className="px-5 pt-5">
            <h3
              id="confirm-modal-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {title}
            </h3>
            {description && !children && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {description}
              </p>
            )}
          </div>

          {/* Body */}
          {children && (
            <div className="px-5 pt-3 text-sm text-gray-700 dark:text-gray-200">
              {children}
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="
                px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800
                hover:bg-gray-50 dark:hover:bg-gray-700
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-gray-400
                disabled:opacity-60
              "
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              ref={confirmBtnRef}
              onClick={onConfirm}
              disabled={busy || confirmDisabled}
              className={`
                px-3.5 py-2 rounded-lg text-white
                focus:outline-none focus:ring-2 focus:ring-offset-0
                disabled:opacity-60
                ${confirmBtnClasses}
              `}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Tiny keyframes (fade + scale) without adding global CSS files) */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { transform: scale(.98) } to { transform: scale(1) } }
      `}</style>
    </>
  );
};

export default ConfirmModal;