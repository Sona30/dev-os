import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TREND_LABEL } from '@/lib/results/format'
import type { MasteryResultDto, Trend } from '@/lib/results/types'

function TrendMark({ trend }: { trend: Trend }) {
  if (!trend) return null
  const Icon = trend === 'improving' ? TrendingUp : trend === 'slipping' ? TrendingDown : Minus
  return (
    <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {TREND_LABEL[trend]}
    </span>
  )
}

/** Each skill practised on this sheet: where it stands, the evidence, and any level change. */
export function MasteryBySkill({ mastery }: { mastery: MasteryResultDto[] }) {
  return (
    <section aria-labelledby="mastery-heading" className="flex flex-col gap-4">
      <h2 id="mastery-heading" className="text-h5">
        Skill by skill
      </h2>
      {mastery.length === 0 ? (
        <p className="max-w-prose text-body text-text-secondary">
          There wasn’t enough clear evidence on this sheet to say where any skill stands. That’s normal after a first
          sheet.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
          {mastery.map((skill) => (
            <li key={skill.skillId}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-body text-text-primary">{skill.skillName}</h3>
                  <StatusBadge status={skill.label} />
                </div>
                <p className="text-caption text-text-secondary">{skill.evidence}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <TrendMark trend={skill.trend} />
                  {skill.levelChange ? (
                    <span className="text-caption text-text-primary">
                      Level {skill.levelChange.from} → {skill.levelChange.to}
                    </span>
                  ) : null}
                </div>
                {skill.note ? <p className="text-caption text-text-secondary">{skill.note}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
