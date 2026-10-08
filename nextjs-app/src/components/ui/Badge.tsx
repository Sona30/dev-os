import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Semantic status badge — docs/design.md "Reusable Patterns": tint background, 1px border,
// darker text, radius 4px, padding 2px 8px. Always carries text, never colour alone.
const badgeStyles = cva('inline-flex items-center rounded-sm border px-2 py-0.5 text-caption font-medium', {
  variants: {
    tone: {
      neutral: 'border-line bg-subtle text-text-secondary',
      info: 'border-brand-border bg-brand-subtle text-brand-hover',
      success: 'border-success-border bg-success-bg text-success-text',
      warning: 'border-warning-border bg-warning-bg text-warning-text',
      danger: 'border-danger-border bg-danger-bg text-danger-text',
      accent: 'border-accent-border bg-accent-bg text-accent-text',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeStyles> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeStyles({ tone }), className)} {...props} />
}
