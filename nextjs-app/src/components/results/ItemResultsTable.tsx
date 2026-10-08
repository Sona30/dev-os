import { Check, Circle, Minus, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { ItemStatus } from '@/lib/grading/types'
import { ERROR_LABEL, RESULT_LABEL, confidenceLabel } from '@/lib/results/format'
import type { ResultItemDto } from '@/lib/results/types'

const NOT_COUNTED: Record<NonNullable<ResultItemDto['notCountedReason']>, string> = {
  unconfirmed: 'Not counted: the answer was skipped in review',
  key_flagged: 'Not counted: you said the answer key looked wrong',
  no_attribution: 'Not counted towards levels: the sheet could not be matched to skills',
}

function ResultMark({ status }: { status: ItemStatus }) {
  const icon =
    status === 'correct' ? (
      <Check className="h-4 w-4 text-success" aria-hidden="true" />
    ) : status === 'partial' ? (
      <TriangleAlert className="h-4 w-4 text-warning-text" aria-hidden="true" />
    ) : status === 'blank' ? (
      <Minus className="h-4 w-4 text-text-secondary" aria-hidden="true" />
    ) : (
      <Circle className="h-4 w-4 text-text-secondary" aria-hidden="true" />
    )
  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      {RESULT_LABEL[status]}
    </span>
  )
}

/** Every question: how it went and why. Answers left out of the levels are marked, with the reason. */
export function ItemResultsTable({ items }: { items: ResultItemDto[] }) {
  return (
    <section aria-labelledby="items-heading" className="flex flex-col gap-4">
      <h2 id="items-heading" className="text-h5">
        Question by question
      </h2>

      <div className="hidden overflow-x-auto rounded-lg border border-line bg-canvas md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">How each question went</caption>
          <thead>
            <tr className="border-b border-line bg-surface">
              {['Q', 'Skill', 'Math level', 'Reading level', 'Result', 'What happened', 'Handwriting'].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-3 text-body">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.position}
                className={`border-b border-line align-top last:border-b-0 ${item.counted ? '' : 'bg-surface text-text-secondary'}`}
              >
                <td className="px-3 py-3 text-body">{item.position}</td>
                <td className="px-3 py-3 text-caption">{item.skillName}</td>
                <td className="px-3 py-3 text-caption">M{item.mathLevel}</td>
                <td className="px-3 py-3 text-caption">{item.readingBand}</td>
                <td className="px-3 py-3 text-caption">
                  <ResultMark status={item.result} />
                  {item.notCountedReason ? (
                    <span className="mt-1 block text-text-secondary">{NOT_COUNTED[item.notCountedReason]}</span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-caption">{item.errorType ? ERROR_LABEL[item.errorType] : '—'}</td>
                <td className="px-3 py-3 text-caption">{confidenceLabel(item.extractionConfidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {items.map((item) => (
          <li
            key={item.position}
            className={`flex flex-col gap-1 rounded-lg border border-line p-4 ${item.counted ? 'bg-canvas' : 'bg-surface'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-body text-text-primary">Question {item.position}</span>
              <Badge>
                M{item.mathLevel} · {item.readingBand}
              </Badge>
            </div>
            <p className="text-caption text-text-secondary">{item.skillName}</p>
            <p className="text-caption text-text-primary">
              <ResultMark status={item.result} />
            </p>
            {item.errorType ? <p className="text-caption text-text-secondary">{ERROR_LABEL[item.errorType]}</p> : null}
            {item.notCountedReason ? (
              <p className="text-caption text-text-secondary">{NOT_COUNTED[item.notCountedReason]}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
