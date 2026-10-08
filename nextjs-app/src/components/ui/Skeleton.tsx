import { cn } from '@/lib/utils'

/** Loading placeholder: flat subtle block, gentle pulse (disabled for reduced-motion users globally). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-subtle', className)} />
}
