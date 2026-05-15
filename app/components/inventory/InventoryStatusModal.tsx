'use client';

import type { ReactNode } from 'react';
import { OrderStatusBar, type StatusStep } from './OrderStatusBar';

export interface InventoryStatusAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'muted' | 'danger';
}

interface InventoryStatusModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  status: string;
  statusLabel?: string;
  steps: readonly StatusStep[];
  progressBetween?: {
    from: string;
    to: string;
    percent: number;
  };
  details?: ReactNode;
  actions?: InventoryStatusAction[];
  onClose: () => void;
}

export function InventoryStatusModal({
  isOpen,
  title,
  subtitle,
  eyebrow,
  status,
  statusLabel,
  steps,
  progressBetween,
  details,
  actions = [],
  onClose,
}: Readonly<InventoryStatusModalProps>) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-[#3D3229]/80" onClick={onClose} />
      <div className="relative w-[min(720px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto border-2 border-brown-800 bg-cream-100 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 text-brown-800/60 hover:text-brown-800 text-lg leading-none"
        >
          x
        </button>

        <div className="border-b border-cream-400 p-5 pr-10">
          {eyebrow && (
            <p className="text-xs uppercase tracking-wider text-brown-800/50">{eyebrow}</p>
          )}
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold uppercase tracking-wide text-brown-800">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-brown-800/60">{subtitle}</p>}
            </div>
            <span className="inline-block border border-orange-500 bg-orange-500 px-2 py-1 text-xs uppercase tracking-wider text-cream-50">
              {statusLabel ?? status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <OrderStatusBar
            status={status}
            steps={steps}
            progressBetween={progressBetween}
          />
          {details && (
            <div className="border border-cream-400 bg-cream-50 p-4 text-sm text-brown-800">
              {details}
            </div>
          )}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-cream-400 pt-4">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`px-4 py-2 text-sm uppercase tracking-wider transition-colors disabled:opacity-50 ${
                    action.variant === 'danger'
                      ? 'border-2 border-red-600 bg-red-600 text-cream-50 hover:bg-red-700'
                      : action.variant === 'muted'
                        ? 'border-2 border-brown-800 text-brown-800 hover:bg-cream-200'
                        : 'bg-orange-500 text-cream-50 hover:bg-orange-600'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
