import { Badge } from '@/components/ui/Badge'
import type { MasteryStatus } from '@/lib/schemas/common'

const COPY: Record<MasteryStatus, { tone: 'success' | 'info' | 'warning' | 'neutral'; label: string }> = {
  secure: { tone: 'success', label: 'Secure' },
  developing: { tone: 'info', label: 'Developing' },
  not_yet: { tone: 'warning', label: 'Not yet' },
  not_enough_evidence: { tone: 'neutral', label: 'Not enough evidence yet' },
}

/** A skill's mastery label. Always words, so it never relies on colour alone. */
export function StatusBadge({ status }: { status: MasteryStatus }) {
  return <Badge tone={COPY[status].tone}>{COPY[status].label}</Badge>
}

export function masteryLabel(status: MasteryStatus): string {
  return COPY[status].label
}
