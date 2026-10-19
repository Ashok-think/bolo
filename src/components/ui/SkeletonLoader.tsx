export function SkeletonLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-ink/5 ${className}`} aria-hidden="true" />
  );
}

export function InvoiceRowSkeleton() {
  return (
    <div className="bg-card border border-line rounded-2xl p-4 flex items-center gap-3">
      <SkeletonLoader className="w-11 h-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLoader className="h-4 w-2/3" />
        <SkeletonLoader className="h-3 w-1/3" />
      </div>
      <SkeletonLoader className="h-5 w-16" />
    </div>
  );
}

export function CustomerCardSkeleton() {
  return (
    <div className="bg-card border border-line rounded-2xl p-4 flex items-center gap-3">
      <SkeletonLoader className="w-11 h-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLoader className="h-4 w-1/2" />
        <SkeletonLoader className="h-3 w-1/3" />
      </div>
      <SkeletonLoader className="h-5 w-14" />
    </div>
  );
}
