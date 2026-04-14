import { createPortal } from 'react-dom'
import { Button } from './Button'

interface ModalProps {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function Modal({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ModalProps) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-bg-surface border border-border rounded-lg shadow-2xl animate-scale-in">
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {description && (
            <p className="mt-1.5 text-sm text-text-muted leading-relaxed">{description}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-4">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
