interface SkeletonProps {
  className?: string
}

function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={[
        'bg-bg-elevated animate-pulse rounded',
        className,
      ].join(' ')}
    />
  )
}

interface SkeletonListProps {
  count?: number
  itemHeight?: string
}

export function SkeletonList({ count = 5, itemHeight = 'h-16' }: SkeletonListProps) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={['flex flex-col gap-2 px-4 py-3', itemHeight].join(' ')}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="border border-border rounded p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <div className="flex flex-col gap-1.5 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-2.5 w-full" />
      <Skeleton className="h-2.5 w-2/3" />
    </div>
  )
}

export { Skeleton }
