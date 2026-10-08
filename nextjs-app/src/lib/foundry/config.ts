import type { Mode } from './schemas'

// Per-mode settings (PRD s6 / docs/specs/05 §5). Temperatures are low where determinism matters
// (reading reports, grading) and higher only for problem wording variety.

export type ToolName = 'file_search' | 'code_interpreter'

export interface ModeConfig {
  deployment: 'default' | 'grader'
  temperature: number
  maxOutputTokens: number
  tools: readonly ToolName[]
  /** Hard cap on images attached to one call. */
  maxImages: number
}

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  parse: { deployment: 'default', temperature: 0.1, maxOutputTokens: 1500, tools: [], maxImages: 5 },
  diagnose: { deployment: 'default', temperature: 0.2, maxOutputTokens: 1500, tools: ['file_search'], maxImages: 0 },
  generate: {
    deployment: 'default',
    temperature: 0.6,
    maxOutputTokens: 4000,
    tools: ['file_search', 'code_interpreter'],
    maxImages: 0,
  },
  grade: { deployment: 'grader', temperature: 0.1, maxOutputTokens: 2500, tools: [], maxImages: 4 },
  explain: { deployment: 'default', temperature: 0.3, maxOutputTokens: 600, tools: [], maxImages: 0 },
}

export const RETRY_DELAYS_MS = [1000, 3000, 8000] as const
export const MAX_TRANSPORT_ATTEMPTS = 3
export const DEFAULT_API_VERSION = '2025-05-01'
export const DEFAULT_TIMEOUT_MS = 120_000
