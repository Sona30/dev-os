import * as React from 'react'

interface EmptyStateProps {
  title: string
  description: string
  /** A single next action (button or link). */
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-line-strong bg-canvas p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-h5">{title}</h2>
        <p className="max-w-prose text-body text-text-secondary">{description}</p>
      </div>
      {action}
    </div>
  )
}
