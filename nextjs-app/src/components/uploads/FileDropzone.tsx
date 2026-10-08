'use client'

import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileDropzoneProps {
  /** Passed to the file input, e.g. "image/*,application/pdf". */
  accept: string
  multiple?: boolean
  /** On phones, "environment" opens the rear camera. */
  capture?: 'environment' | 'user'
  disabled?: boolean
  label: string
  hint?: string
  onFiles: (files: File[]) => void
}

/** Click, drag-and-drop or keyboard (Enter / Space) to choose files. */
export function FileDropzone({ accept, multiple = true, capture, disabled, label, hint, onFiles }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function open() {
    if (!disabled) inputRef.current?.click()
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            open()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled) onFiles(Array.from(event.dataTransfer.files))
        }}
        className={cn(
          'flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center',
          'transition-colors duration-fast ease-enter',
          dragging ? 'border-brand bg-brand-subtle' : 'border-line-strong bg-canvas hover:bg-subtle',
          disabled && 'cursor-not-allowed bg-surface text-text-disabled hover:bg-surface',
        )}
      >
        <UploadCloud className="h-6 w-6 text-text-secondary" aria-hidden="true" />
        <span className="text-body text-text-primary">{label}</span>
        {hint ? <span className="text-caption text-text-secondary">{hint}</span> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept}
        multiple={multiple}
        capture={capture}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          // Reset so choosing the same file again still fires onChange.
          event.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />
    </div>
  )
}
