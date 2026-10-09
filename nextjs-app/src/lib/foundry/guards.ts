import type { Mode, ModeInputs, ModeOutputs } from './types'

// Rules the application knows better than the model. The agent is told these in the mode prompt, but a model can
// still get them wrong, and a parent reads the result as "how sure are we". So the app sets them from the input.

type Confidence = ModeOutputs['diagnose']['dataConfidence']

/**
 * How much the result supports its gaps (prompts/v1.0/modes/diagnose.md):
 * "high" with domain-level results, "medium" with only an overall placement, "low" with only a scale score.
 */
export function diagnoseConfidence(input: ModeInputs['diagnose']): Confidence {
  const { domains, placement } = input.score_or_placement
  const hasDomainResults = domains.some((domain) => domain.placement !== null || domain.score !== null)
  if (hasDomainResults) return 'high'
  return placement ? 'medium' : 'low'
}

export interface GuardResult<T> {
  data: T
  /** What was changed, for the log. Empty when the model already followed the rules. */
  corrections: string[]
}

/** Sets the confidence from the input and marks every gap "likely" unless the confidence is high. */
export function guardDiagnose(
  input: ModeInputs['diagnose'],
  output: ModeOutputs['diagnose'],
): GuardResult<ModeOutputs['diagnose']> {
  const corrections: string[] = []
  const dataConfidence = diagnoseConfidence(input)
  if (output.dataConfidence !== dataConfidence) {
    corrections.push(`dataConfidence ${output.dataConfidence} -> ${dataConfidence}`)
  }
  const gaps = output.gaps.map((gap) => {
    if (dataConfidence === 'high' || gap.likely) return gap
    corrections.push(`gap ${gap.skillId ?? gap.domain} marked likely`)
    return { ...gap, likely: true }
  })
  return { data: { ...output, dataConfidence, gaps }, corrections }
}

/** Applies the guard that belongs to `mode`, if there is one. */
export function applyGuards<M extends Mode>(
  mode: M,
  input: ModeInputs[M],
  output: ModeOutputs[M],
): GuardResult<ModeOutputs[M]> {
  if (mode === 'diagnose') {
    return guardDiagnose(input as ModeInputs['diagnose'], output as ModeOutputs['diagnose']) as GuardResult<
      ModeOutputs[M]
    >
  }
  return { data: output, corrections: [] }
}
