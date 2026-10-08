import { StatusBadge, masteryLabel } from '@/components/ui/StatusBadge'
import { TREND_LABEL } from '@/lib/results/format'
import type { SkillProgressDto } from '@/lib/results/types'

/** Each skill grouped by domain: its level now and how it has gone on each worksheet. */
export function SkillTimeline({ skills }: { skills: SkillProgressDto[] }) {
  const domains = Array.from(new Set(skills.map((skill) => skill.domain)))
  return (
    <section aria-labelledby="skills-heading" className="flex flex-col gap-6">
      <h2 id="skills-heading" className="text-h5">
        Skill by skill
      </h2>
      {skills.length === 0 ? (
        <p className="max-w-prose text-body text-text-secondary">Skills appear here once a gap analysis has been run.</p>
      ) : (
        domains.map((domain) => (
          <div key={domain} className="flex flex-col gap-2">
            <h3 className="text-body text-text-primary">{domain}</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {skills
                .filter((skill) => skill.domain === domain)
                .map((skill) => (
                  <li key={skill.skillId} className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-body text-text-primary">{skill.name}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-caption text-text-secondary">Level {skill.currentLevel}</span>
                        <StatusBadge status={skill.status} />
                        {skill.trend ? <span className="text-caption text-text-secondary">{TREND_LABEL[skill.trend]}</span> : null}
                      </span>
                    </div>
                    {skill.history.length > 0 ? (
                      <ol className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-caption text-text-secondary">
                        {skill.history.map((entry) => (
                          <li key={entry.cycle}>
                            Worksheet {entry.cycle}: {masteryLabel(entry.label)} (level {entry.level})
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-caption text-text-secondary">Not practised on a completed worksheet yet.</p>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
