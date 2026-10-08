import * as React from 'react'

interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  /** A single form control (Input, Select, ...). It receives id, aria-invalid and aria-describedby. */
  children: React.ReactElement
}

/** Label + control + hint + error with correct ARIA wiring. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body text-text-primary">
        {label}
      </label>
      {React.cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint ? (
        <p id={hintId} className="text-caption text-text-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  )
}
