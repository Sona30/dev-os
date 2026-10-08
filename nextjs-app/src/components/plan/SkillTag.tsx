import { Badge } from '@/components/ui/Badge'

/** A skill's name with its catalogue id, so everything we show maps to a named skill (FR-04). */
export function SkillTag({ skillId, skillName }: { skillId: string; skillName: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-body text-text-primary">{skillName}</span>
      <span className="text-caption text-text-secondary">{skillId}</span>
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: number }) {
  return <Badge tone={priority === 1 ? 'info' : 'neutral'}>{priority === 1 ? 'Start here' : `Priority ${priority}`}</Badge>
}
