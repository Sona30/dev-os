import * as React from 'react'
import { cn } from '@/lib/utils'

// Input spec — docs/design.md: radius 6px, Grey 200 border, brand border on focus, Red 500 on error.
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-11 w-full rounded-md border border-line-strong bg-canvas px-3 text-body text-text-primary',
        'placeholder:text-text-disabled transition-colors duration-fast ease-enter',
        'hover:bg-subtle focus:bg-canvas focus:border-brand',
        'disabled:bg-surface disabled:text-text-disabled disabled:border-line',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-bg',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
