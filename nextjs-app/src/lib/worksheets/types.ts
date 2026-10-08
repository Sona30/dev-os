import type { MasteryStatus, ReadingBand } from '@/lib/schemas/common'

// Planner and wire types shared by the server and the browser (docs/specs/08 §3-4).

export type PlanRole = 'gap' | 'near_mastery' | 'review' | 'stretch' | 'reading_probe'
export type PairRole = 'low_reading' | 'target_reading'

export interface PlanItem {
  position: number
  skillId: string
  domain: string
  mathLevel: number
  readingBand: ReadingBand
  role: PlanRole
  pairId: string | null
  pairRole: PairRole | null
  /** True for the gentlest R1 template (the low-reading half of a pair for an R1 reader). */
  minimalReading: boolean
  /** A suggested first name, to vary worksheets. */
  nameHint: string
}

export interface AxisPlan {
  items: PlanItem[]
  domains: string[]
  bias: -1 | 0 | 1
}

export interface PlannerSkill {
  skillId: string
  domain: string
  mathLevel: number
  status: MasteryStatus
  /** The skill's math level changed in the previous cycle, so it is left out of stretch and probe items. */
  changedLastCycle: boolean
}

export interface PaperChoice {
  paperSize: 'letter' | 'a4'
}

/** A question as the child's copy shows it. Never contains an answer, skill or level. */
export interface StudentItemDto {
  id: string
  position: number
  questionText: string
  answerType: 'integer' | 'text' | 'choice'
}

export interface WorksheetDto {
  id: string
  sheetId: string
  cycleId: string
  childId: string
  cycleNumber: number
  paperSize: 'letter' | 'a4'
  version: number
  verifiedAt: string
  createdAt: string
  itemCount: number
  domainCount: number
}

export interface WorksheetDetailDto {
  worksheet: WorksheetDto
  items: StudentItemDto[]
  studentPdfUrl: string
  keyPdfUrl: string
  expiresAt: string
  regenerationsUsed: number
  difficultyFeedback: 'too_hard' | 'too_easy' | null
  readAloud: boolean
  cycleStatus: string
}

/** What the plan page needs to decide between "generate", "generating…" and "preview". */
export interface WorksheetStateDto {
  cycle: { id: string; number: number; status: string; generateJobId: string | null } | null
  detail: WorksheetDetailDto | null
}
