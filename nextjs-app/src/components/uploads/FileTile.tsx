'use client'

import { Check, Loader2, X } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import type { UploadItem } from '@/hooks/use-uploader'
import type { QualityIssue } from '@/lib/images/metrics'

const ISSUE_MESSAGES: Record<QualityIssue, string> = {
  blurry: 'This looks blurry. Hold the phone steady and tap the page to focus.',
  dark: 'This is quite dark. Move somewhere brighter.',
  bright: 'This is very bright or washed out. Avoid glare and direct light.',
  cropped: 'The page looks small or cut off. Fit the whole page in the frame.',
  blank: 'The page looks empty. Check you photographed the right side.',
}

interface FileTileProps {
  item: UploadItem
  onRemove: (id: string) => void
  onUseAnyway: (id: string) => void
  onUseFirstPages: (id: string) => void
}

export function FileTile({ item, onRemove, onUseAnyway, onUseFirstPages }: FileTileProps) {
  const busy = item.status === 'preparing' || item.status === 'uploading'

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle">
          {item.previewUrl ? (
            // Object URL created in the browser, so next/image optimisation does not apply.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewUrl} alt={`Preview of ${item.name}`} className="h-full w-full object-cover" />
          ) : busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden="true" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-body text-text-primary">{item.name}</p>
          <p className="flex items-center gap-1 text-caption text-text-secondary" aria-live="polite">
            {item.status === 'preparing' ? 'Getting ready…' : null}
            {item.status === 'ready' ? 'Ready to upload' : null}
            {item.status === 'attention' ? 'Needs a look' : null}
            {item.status === 'uploading' ? 'Uploading…' : null}
            {item.status === 'uploaded' ? (
              <>
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                Uploaded
              </>
            ) : null}
            {item.status === 'error' ? 'Couldn’t finish' : null}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={item.status === 'uploading'}
          aria-label={`Remove ${item.name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast ease-enter hover:bg-subtle disabled:pointer-events-none disabled:text-text-disabled"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {item.status === 'attention' ? (
        <Alert tone="warning">
          <ul className="m-0 list-none p-0">
            {item.issues.map((issue) => (
              <li key={issue}>{ISSUE_MESSAGES[issue]}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => onRemove(item.id)}>
              Remove and retake
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onUseAnyway(item.id)}>
              Use anyway
            </Button>
          </div>
        </Alert>
      ) : null}

      {item.status === 'error' && item.error ? (
        <Alert tone="danger">
          <p>{item.error}</p>
          {item.canTruncate ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => onUseFirstPages(item.id)}>
              Use the first 5 pages
            </Button>
          ) : null}
        </Alert>
      ) : null}
    </li>
  )
}
