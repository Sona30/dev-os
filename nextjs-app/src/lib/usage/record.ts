import 'server-only'
import { getLogger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'

export interface UsageEntry {
  userId: string
  childId?: string | null
  jobId?: string
  /** e.g. "foundry.generate" (docs/specs/14 §2). */
  event: string
  inputTokens?: number
  outputTokens?: number
  estCostUsd?: number
}

/**
 * Writes one usage_events row. Telemetry must never break a parent's request, so failures are logged and swallowed.
 */
export async function recordUsage(entry: UsageEntry): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from('usage_events')
      .insert({
        user_id: entry.userId,
        child_id: entry.childId ?? null,
        job_id: entry.jobId ?? null,
        event: entry.event,
        input_tokens: entry.inputTokens ?? 0,
        output_tokens: entry.outputTokens ?? 0,
        est_cost_usd: entry.estCostUsd ?? 0,
      })
    if (error) throw error
  } catch (error) {
    getLogger({ jobId: entry.jobId }).warn({ err: error, event: entry.event }, 'could not record usage event')
  }
}
