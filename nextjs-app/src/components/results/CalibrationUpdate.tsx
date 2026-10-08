import { Card } from '@/components/ui/Card'
import type { ResultsDto } from '@/lib/results/types'

/** "What changes next": the explanation, and the reason for each change, in plain language. */
export function CalibrationUpdate({ calibration }: { calibration: ResultsDto['calibration'] }) {
  return (
    <section aria-labelledby="changes-heading" className="flex flex-col gap-4">
      <h2 id="changes-heading" className="text-h5">
        What changes next
      </h2>
      <Card className="flex flex-col gap-3">
        <p className="max-w-prose text-body text-text-primary">{calibration.text}</p>
        {calibration.events.length > 0 ? (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-caption text-text-secondary">
            {calibration.events.map((event) => (
              <li key={`${event.axis}-${event.skillName ?? 'reading'}-${event.to}`}>{event.reason}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    </section>
  )
}
