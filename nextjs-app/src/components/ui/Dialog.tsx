'use client'

import * as React from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** When false the dialog cannot be dismissed (Escape, backdrop, close button), e.g. while a task runs. */
  dismissible?: boolean
  children: React.ReactNode
}

/**
 * Modal built on the native <dialog> element: focus is trapped, Escape closes, and the page behind
 * is inert while open. Radius 12px per docs/design.md (modals).
 */
export function Dialog({ open, onClose, title, description, dismissible = true, children }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  React.useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Escape: keep the dialog open when it must not be dismissed.
        if (!dismissible) event.preventDefault()
      }}
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself) dismisses.
        if (dismissible && event.target === ref.current) onClose()
      }}
      className="m-auto w-full max-w-md rounded-xl border border-line bg-canvas p-0 text-text-primary backdrop:bg-overlay"
    >
      {open ? (
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 id={titleId} className="text-h5">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-body text-text-secondary">
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast ease-enter hover:bg-subtle"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  )
}
