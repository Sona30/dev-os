import { PriorityBadge, SkillTag } from '@/components/plan/SkillTag'
import { Badge } from '@/components/ui/Badge'
import type { DiagnosisGap } from '@/lib/diagnosis/types'

const GAP_COPY = {
  small: { tone: 'neutral', label: 'Small step' },
  moderate: { tone: 'warning', label: 'Moderate step' },
  large: { tone: 'danger', label: 'Bigger step' },
} as const

function GapBadge({ level }: { level: DiagnosisGap['gapLevel'] }) {
  return <Badge tone={GAP_COPY[level].tone}>{GAP_COPY[level].label}</Badge>
}

function LikelyChip() {
  return (
    <span title="We only had a summary of the result, so the first worksheet will check this.">
      <Badge tone="accent">Likely</Badge>
    </span>
  )
}

/** The concept gaps in practice order. A real table on wide screens; stacked cards on phones. */
export function ConceptGapsTable({ gaps }: { gaps: DiagnosisGap[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-line bg-canvas sm:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Concepts your child is still building, in the order to practise them</caption>
          <thead>
            <tr className="border-b border-line bg-surface">
              <th scope="col" className="px-4 py-3 text-body">Domain</th>
              <th scope="col" className="px-4 py-3 text-body">Skill</th>
              <th scope="col" className="px-4 py-3 text-body">What we noticed</th>
              <th scope="col" className="px-4 py-3 text-body">Size</th>
              <th scope="col" className="px-4 py-3 text-body">Order</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((gap) => (
              <tr key={gap.skillId} className="border-b border-line align-top last:border-b-0">
                <td className="px-4 py-3 text-caption text-text-secondary">{gap.domain}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <SkillTag skillId={gap.skillId} skillName={gap.skillName} />
                    {gap.likely ? <LikelyChip /> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-caption text-text-secondary">{gap.evidence}</td>
                <td className="px-4 py-3">
                  <GapBadge level={gap.gapLevel} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={gap.priority} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0 sm:hidden">
        {gaps.map((gap) => (
          <li key={gap.skillId} className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-4">
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={gap.priority} />
              <GapBadge level={gap.gapLevel} />
              {gap.likely ? <LikelyChip /> : null}
            </div>
            <SkillTag skillId={gap.skillId} skillName={gap.skillName} />
            <p className="text-caption text-text-secondary">{gap.domain}</p>
            <p className="text-caption text-text-secondary">{gap.evidence}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
