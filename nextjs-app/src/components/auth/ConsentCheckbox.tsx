import * as React from 'react'
import Link from 'next/link'

interface ConsentCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: string
}

/** Required adult-consent checkbox for sign-up. Works with react-hook-form's register(). */
export const ConsentCheckbox = React.forwardRef<HTMLInputElement, ConsentCheckboxProps>(
  ({ id = 'consent', error, ...props }, ref) => {
    const errorId = error ? `${id}-error` : undefined
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-3">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
            {...props}
          />
          <label htmlFor={id} className="text-body text-text-primary">
            I’m an adult, and I agree to the{' '}
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand underline">
              Privacy Policy
            </Link>
            .
          </label>
        </div>
        {error ? (
          <p id={errorId} className="text-caption text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    )
  },
)
ConsentCheckbox.displayName = 'ConsentCheckbox'
