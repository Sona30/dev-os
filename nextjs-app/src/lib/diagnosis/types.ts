import type { ReadingBand } from '@/lib/schemas/common'

// Shared by the server and the plan page (docs/specs/07 §3).
export type DataConfidenceLevel = 'high' | 'medium' | 'low'

export interface DiagnosisGap {
  domain: string
  skillId: string
  skillName: string
  evidence: string
  gapLevel: 'small' | 'moderate' | 'large'
  priority: number
  suggestedMathLevel: number
  likely: boolean
}

export interface DiagnosisStrength {
  skillId: string
  skillName: string
  note: string
}

export interface DiagnosisDto {
  id: string
  reportId: string
  createdAt: string
  dataConfidence: DataConfidenceLevel
  summary: string
  gaps: DiagnosisGap[]
  strengths: DiagnosisStrength[]
  recommendations: string[]
  unmapped: string[]
  readingBand: { band: ReadingBand | null; estimated: boolean }
  /** Grade, scores and window the analysis was based on, for the Key Data card. */
  basis: {
    grade: 1 | 2
    overallScore: number | null
    placement: string | null
    window: 'BOY' | 'MOY' | 'EOY' | null
    lexile: number | null
  }
  kbVersion: string
}
