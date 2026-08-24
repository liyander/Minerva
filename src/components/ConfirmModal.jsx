import React from 'react'

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="rounded-2xl bg-surface-container-lowest max-w-md w-full border border-outline-variant/30 border-t-4 border-t-error p-6 md:p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
        <h2 className="font-headline text-xl font-bold text-on-surface mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-error">warning</span>
          {title || 'Confirm Action'}
        </h2>
        <p className="text-sm font-body text-on-surface-variant mb-8">
          {message || 'Are you sure you want to proceed? This is a destructive move and cannot be reverted.'}
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            onClick={onCancel}
            type="button"
            className="rounded-lg px-5 py-2.5 text-xs font-headline font-bold border border-outline-variant hover:bg-surface-container transition-colors text-on-surface text-center"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            type="button"
            className="rounded-lg px-5 py-2.5 text-xs font-headline font-bold bg-error text-on-error hover:bg-error/90 transition-colors text-center"
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  )
}
