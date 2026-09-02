'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** If provided, renders confirm + cancel buttons */
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  confirmLoading?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  onConfirm,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  confirmLoading = false,
}: ModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-espresso/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full max-w-md bg-ivory border border-oat rounded-[10px] p-6 shadow-lg">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold font-serif text-espresso">{title}</h2>
          <button
            onClick={onClose}
            className="text-shadow hover:text-espresso transition-colors ml-4 shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <div className="text-sm text-espresso leading-relaxed">{children}</div>
        {onConfirm && (
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant={confirmVariant} onClick={onConfirm} loading={confirmLoading}>
              {confirmLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
