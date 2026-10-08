import { Info } from 'lucide-react'

interface CoverNameTipProps {
  subject: 'report' | 'sheet'
}

/** Data-minimisation nudge shown on every upload surface (docs/specs/13 §2.1). */
export function CoverNameTip({ subject }: CoverNameTipProps) {
  return (
    <p className="flex items-start gap-2 text-caption text-text-secondary">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {subject === 'report'
          ? 'Tip: if you can, cover or crop your child’s full name on the report before uploading. We only need the scores.'
          : 'Tip: if you can, cover or crop your child’s name before taking the photo. We only need the answers and the Sheet ID.'}
      </span>
    </p>
  )
}
