import { Badge } from '@/components/ui/Badge'
import type { FieldState } from '@/lib/reports/draft'

/** How sure we are about a value read from the report. Always text, never colour alone. */
export function ConfidenceBadge({ state }: { state: FieldState }) {
  if (state === 'clear') return <Badge tone="success">Read clearly</Badge>
  if (state === 'check') return <Badge tone="warning">Please check</Badge>
  return <Badge tone="danger">Couldn’t read this — enter it</Badge>
}
