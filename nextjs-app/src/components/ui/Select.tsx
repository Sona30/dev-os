import * as React from 'react'
import { cn } from '@/lib/utils'

/** Native select: fully keyboard and screen-reader accessible, styled like Input. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-md border border-line-strong bg-canvas px-3 text-body text-text-primary',
        'transition-colors duration-fast ease-enter hover:bg-subtle focus:border-brand',
        'disabled:bg-surface disabled:text-text-disabled disabled:border-line',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
