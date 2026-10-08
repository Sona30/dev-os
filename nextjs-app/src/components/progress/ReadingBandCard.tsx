import { Card } from '@/components/ui/Card'
import type { ProgressDto } from '@/lib/results/types'

const CONFIDENCE = { low: 'low', med: 'medium', high: 'high' } as const

export function ReadingBandCard({ reading }: { reading: ProgressDto['reading'] }) {
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="text-body text-text-primary">Reading level</h3>
      {reading.band ? (
        <>
          <p className="text-caption text-text-primary">
            {reading.band}
            {reading.estimated ? ' (estimated)' : ' (set from worksheets and the Lexile score)'}
          </p>
          <p className="text-caption text-text-secondary">
            How sure we are: {CONFIDENCE[reading.confidence]}.{' '}
            {reading.estimated ? 'The first few worksheets help us pin this down.' : 'It adjusts only when the wording clearly helps or gets in the way.'}
          </p>
          {reading.history.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-caption text-text-secondary">
              {reading.history.map((point, index) => (
                <li key={`${point.cycle}-${index}`}>
                  {point.cycle > 0 ? `After worksheet ${point.cycle}` : 'Set from a Lexile score'}: {point.band}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="text-caption text-text-secondary">Not set yet.</p>
      )}
    </Card>
  )
}
