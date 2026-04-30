'use client'

import { useEffect } from 'react'

interface Props {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'warning' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

const VARIANTS = {
  warning: {
    title: 'text-yellow-600',
    button: 'border-yellow-600 bg-yellow-600/10 text-yellow-600 hover:bg-yellow-600/20',
  },
  danger: {
    title: 'text-red-500',
    button: 'border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500/20',
  },
} as const

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel,
}: Readonly<Props>) {
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onCancel, onConfirm])

  if (!isOpen) return null

  const styles = VARIANTS[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[#3D3229]/80" onClick={onCancel} />
      <div className="relative bg-brown-800 border-2 border-cream-500/20 max-w-md w-full mx-4 font-mono">
        <div className="px-4 py-3 border-b border-cream-500/20 flex items-center justify-between">
          <h2 className={`${styles.title} text-lg uppercase tracking-wide`}>{title}</h2>
          <button
            onClick={onCancel}
            className="text-cream-50 hover:text-orange-500 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-cream-50 text-sm leading-relaxed whitespace-pre-wrap">{message}</p>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onConfirm}
              autoFocus
              className={`px-4 py-2 text-sm uppercase tracking-wider border transition-colors cursor-pointer ${styles.button}`}
            >
              {confirmLabel}
              <span className="ml-2 text-xs opacity-60 hidden sm:inline">Enter</span>
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm uppercase tracking-wider border border-cream-500/20 bg-brown-900 text-cream-50 hover:bg-cream-500/10 cursor-pointer"
            >
              {cancelLabel}
              <span className="ml-2 text-xs opacity-60 hidden sm:inline">Esc</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
