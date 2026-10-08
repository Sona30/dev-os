import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Button spec — docs/design.md: radius 6px, brand blue for CTAs, transitions ≤ 100ms ease-out,
// visible focus ring (global :focus-visible), 44px minimum touch target on the default size.
export const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-body transition-colors duration-fast ease-enter ' +
    'disabled:pointer-events-none disabled:bg-surface disabled:border disabled:border-line disabled:text-text-disabled',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-text-on-brand hover:bg-brand-hover',
        secondary:
          'border border-line-strong bg-canvas text-text-primary hover:bg-subtle active:bg-pressed',
        ghost: 'text-text-primary hover:bg-subtle active:bg-pressed',
        danger: 'bg-danger text-text-on-brand hover:bg-danger-text',
      },
      size: {
        md: 'h-11 px-6',
        sm: 'h-9 px-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
