import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Status colours: tint background, 1px border, darker text (docs/design.md "State Colors").
const alertStyles = cva('rounded-lg border px-4 py-3 text-body', {
  variants: {
    tone: {
      info: 'border-brand-border bg-brand-subtle text-text-primary',
      success: 'border-success-border bg-success-bg text-success-text',
      warning: 'border-warning-border bg-warning-bg text-warning-text',
      danger: 'border-danger-border bg-danger-bg text-danger-text',
    },
  },
  defaultVariants: { tone: 'info' },
})

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertStyles> {}

/** Errors and warnings announce immediately (role="alert"); everything else is polite (role="status"). */
export function Alert({ className, tone, ...props }: AlertProps) {
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status'
  return <div role={role} className={cn(alertStyles({ tone }), className)} {...props} />
}
