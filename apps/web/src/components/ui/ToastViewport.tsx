import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import type { Toast, ToastVariant } from '../../stores/toastStore'
import { useToastStore } from '../../stores/toastStore'

const iconByVariant: Record<ToastVariant, typeof AlertCircle> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
}

const accentByVariant: Record<ToastVariant, string> = {
  info: 'text-accent',
  success: 'text-success',
  error: 'text-error',
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useToastStore((state) => state.dismissToast)
  const Icon = iconByVariant[toast.variant]

  return (
    <div className="pointer-events-auto w-full rounded border border-border bg-bg-surface shadow-lg shadow-black/5">
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon size={16} className={`mt-0.5 shrink-0 ${accentByVariant[toast.variant]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{toast.title}</p>
          {toast.description && (
            <p className="mt-1 text-sm text-text-secondary">{toast.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismissToast(toast.id)}
          className="text-text-muted transition-colors hover:text-text-primary"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
