import * as React from 'react'
import { cn } from '@/lib/utils'

// Card — docs/design.md: white elevated surface, 8px radius, flat (border, no shadow).
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-canvas p-6', className)} {...props} />
}
