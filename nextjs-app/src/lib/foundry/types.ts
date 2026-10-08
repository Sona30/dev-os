import type { ToolName } from './config'
import type { Mode, ModeInputs, ModeOutputs } from './schemas'

export type { Mode, ModeInputs, ModeOutputs }

export type AgentImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface AgentImage {
  /** Time-limited signed URL, or a data: URL. */
  url: string
  mime: AgentImageMime
  /** Human label the model sees, e.g. "Report page 2" or "Completed sheet, page 1". */
  label: string
}

/** Who the cost of this call is attributed to (usage_events). */
export interface UsageContext {
  userId: string
  childId?: string | null
  jobId?: string
}

export interface FoundryRequest<M extends Mode> {
  mode: M
  input: ModeInputs[M]
  images?: AgentImage[]
  usage?: UsageContext
  /** Overrides the mode's default output-token cap (never above it in practice). */
  maxOutputTokens?: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  codeInterpreterSessions: number
  estCostUsd: number
}

export interface ToolEvent {
  tool: ToolName | string
  status: string
}

export interface FoundryResult<M extends Mode> {
  data: ModeOutputs[M]
  /** The short human-readable write-up that precedes the JSON block. */
  narrative: string
  raw: string
  usage: TokenUsage
  model: string
  durationMs: number
  toolEvents: ToolEvent[]
  promptVersion: string
  kbVersion: string
}

// ---- Transport abstraction: one conversation with the agent (real REST thread or a test fixture) ----

export type MessagePart = { type: 'text'; text: string } | { type: 'image'; url: string }

export interface TurnOptions {
  temperature: number
  maxOutputTokens: number
  tools: readonly ToolName[]
  /** Deployment (model) name for this call. */
  model: string
}

export interface TurnResult {
  text: string
  inputTokens: number
  outputTokens: number
  codeInterpreterSessions: number
  toolEvents: ToolEvent[]
  model: string
}

export interface AgentSession {
  send(parts: MessagePart[], options: TurnOptions): Promise<TurnResult>
  /** Releases the conversation (deletes the thread). Never throws. */
  close(): Promise<void>
}
