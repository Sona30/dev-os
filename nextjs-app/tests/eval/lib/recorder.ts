import { callAgent } from '@/lib/foundry/client'
import type { FoundryRequest, FoundryResult, Mode } from '@/lib/foundry/types'
import type { CallStat } from './report'

/** Wraps callAgent so every call's latency and cost is kept for E12 and E13. */
export class Recorder {
  readonly calls: CallStat[] = []
  readonly models = new Set<string>()
  promptVersion: string | null = null
  kbVersion: string | null = null

  async call<M extends Mode>(request: FoundryRequest<M>): Promise<FoundryResult<M>> {
    const result = await callAgent(request)
    this.calls.push({
      mode: request.mode,
      durationMs: result.durationMs,
      costUsd: result.usage.estCostUsd,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    })
    this.models.add(result.model)
    this.promptVersion = result.promptVersion
    this.kbVersion = result.kbVersion
    return result
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
