import { Badge } from '@/components/ui/Badge'
import type { DataConfidenceLevel } from '@/lib/diagnosis/types'

const COPY: Record<DataConfidenceLevel, { tone: 'success' | 'warning' | 'danger'; label: string; detail: string }> = {
  high: { tone: 'success', label: 'High confidence', detail: 'From the domain-level report' },
  medium: { tone: 'warning', label: 'Medium confidence', detail: 'From the overall placement only' },
  low: { tone: 'danger', label: 'Low confidence', detail: 'From the score only' },
}

export function dataConfidenceDetail(level: DataConfidenceLevel) {
  return COPY[level].detail
}

export function DataConfidenceBadge({ level }: { level: DataConfidenceLevel }) {
  return <Badge tone={COPY[level].tone}>{COPY[level].label}</Badge>
}
