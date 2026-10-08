import { parseOutput } from '@/lib/foundry/schemas/outputs'
import type { ConfirmedValues } from '@/lib/schemas/reports'

// Turns what the agent read (or what the parent typed) into the editable "please confirm" form.
// Fields the agent was unsure about are flagged; fields it could barely read are cleared so a
// misread value can never drive the plan (PRD s9, docs/specs/06 §1).

export type FieldState = 'clear' | 'check' | 'missing'

export interface ReportDraft {
  values: ConfirmedValues
  fieldStates: { window: FieldState; overallScore: FieldState; placement: FieldState; domains: FieldState }
}

const CLEAR_AT = 0.85
const CLEARED_BELOW = 0.5

function stateFor(confidence: number, hasValue: boolean): FieldState {
  if (!hasValue || confidence < CLEARED_BELOW) return 'missing'
  return confidence >= CLEAR_AT ? 'clear' : 'check'
}

const EMPTY: ReportDraft = {
  values: { window: null, overallScore: null, placement: null, domainResults: [], lexile: null },
  fieldStates: { window: 'missing', overallScore: 'missing', placement: 'missing', domains: 'missing' },
}

interface ManualParsed {
  manual: true
  window?: 'BOY' | 'MOY' | 'EOY' | null
  overallScore?: number | null
  placement?: string | null
  lexile?: number | null
}

export function draftFromParsed(parsed: unknown, childLexile: number | null): ReportDraft {
  const manual = parsed as ManualParsed | null
  if (manual && manual.manual === true) {
    const state = (value: unknown): FieldState => (value === null || value === undefined ? 'missing' : 'clear')
    return {
      values: {
        window: manual.window ?? null,
        overallScore: manual.overallScore ?? null,
        placement: manual.placement ?? null,
        domainResults: [],
        lexile: manual.lexile ?? childLexile,
      },
      fieldStates: {
        window: state(manual.window),
        overallScore: state(manual.overallScore),
        placement: state(manual.placement),
        domains: 'missing',
      },
    }
  }

  const result = parseOutput.safeParse(parsed)
  if (!result.success || result.data.status !== 'ok') return { ...EMPTY, values: { ...EMPTY.values, lexile: childLexile } }

  const data = result.data
  const keep = (confidence: number) => confidence >= CLEARED_BELOW
  const domainsUsable = keep(data.confidence.domains) && data.domains.length > 0

  return {
    values: {
      window: keep(data.confidence.window) ? data.window : null,
      overallScore: keep(data.confidence.overallScore) ? data.overallScore : null,
      placement: keep(data.confidence.placement) ? data.placement : null,
      domainResults: domainsUsable ? data.domains : [],
      lexile: childLexile,
    },
    fieldStates: {
      window: stateFor(data.confidence.window, data.window !== null),
      overallScore: stateFor(data.confidence.overallScore, data.overallScore !== null),
      placement: stateFor(data.confidence.placement, data.placement !== null),
      domains: stateFor(data.confidence.domains, data.domains.length > 0),
    },
  }
}
