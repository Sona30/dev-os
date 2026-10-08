import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/results/format'
import type { ChangeDto } from '@/lib/results/types'

/** Every change to a level, newest first, with the reason in plain language. */
export function ChangeReasonList({ changes }: { changes: ChangeDto[] }) {
  return (
    <section aria-labelledby="changes-heading" className="flex flex-col gap-4">
      <h2 id="changes-heading" className="text-h5">
        Why things changed
      </h2>
      {changes.length === 0 ? (
        <p className="max-w-prose text-body text-text-secondary">
          Changes will appear here after your first completed worksheet, each with the reason.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {changes.map((change, index) => (
            <li key={`${change.date}-${index}`} className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={change.axis === 'reading' ? 'accent' : 'info'}>{change.axis === 'reading' ? 'Reading' : 'Maths'}</Badge>
                <span className="text-caption text-text-secondary">
                  {change.cycle ? `Worksheet ${change.cycle} · ` : ''}
                  {formatDate(change.date)}
                </span>
              </div>
              <p className="text-body text-text-primary">{change.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
