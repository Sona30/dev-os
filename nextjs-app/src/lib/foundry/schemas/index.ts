import type { ZodType, ZodTypeDef } from 'zod'
import { diagnoseInput, explainInput, generateInput, gradeInput, parseInput } from './inputs'
import type { DiagnoseInput, ExplainInput, GenerateInput, GradeInput, ParseInput } from './inputs'
import { diagnoseOutput, explainOutput, generateOutput, gradeOutput, parseOutput } from './outputs'
import type { DiagnoseOutput, ExplainOutput, GenerateOutput, GradeOutput, ParseOutput } from './outputs'

export type Mode = 'parse' | 'diagnose' | 'generate' | 'grade' | 'explain'

export interface ModeInputs {
  parse: ParseInput
  diagnose: DiagnoseInput
  generate: GenerateInput
  grade: GradeInput
  explain: ExplainInput
}

export interface ModeOutputs {
  parse: ParseOutput
  diagnose: DiagnoseOutput
  generate: GenerateOutput
  grade: GradeOutput
  explain: ExplainOutput
}

type Schema<T> = ZodType<T, ZodTypeDef, unknown>

export const INPUT_SCHEMAS: { [M in Mode]: Schema<ModeInputs[M]> } = {
  parse: parseInput,
  diagnose: diagnoseInput,
  generate: generateInput,
  grade: gradeInput,
  explain: explainInput,
}

export const OUTPUT_SCHEMAS: { [M in Mode]: Schema<ModeOutputs[M]> } = {
  parse: parseOutput,
  diagnose: diagnoseOutput,
  generate: generateOutput,
  grade: gradeOutput,
  explain: explainOutput,
}
