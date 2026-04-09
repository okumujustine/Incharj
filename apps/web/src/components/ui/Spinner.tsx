import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 16, className = '' }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      className={['animate-spin text-text-muted', className].join(' ')}
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={24} className="text-accent" />
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    </div>
  )
}
