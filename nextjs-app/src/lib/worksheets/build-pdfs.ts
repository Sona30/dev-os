import type { Skill } from '@/lib/skills/catalog'
import { renderAnswerKey, renderStudentSheet, type KeyItem } from './pdf/render'
import type { PaperSize } from './pdf/layout'

// Builds both printable files from stored items. Shared by generation and by "switch paper size".

export interface StoredItem {
  position: number
  skill_id: string
  math_level: number
  reading_band: string
  pair_id: string | null
  is_stretch: boolean
  is_reading_probe: boolean
  question_text: string
  correct_answer: string
  accepted_answers: string[]
  working: string
  verification: { pairRole?: KeyItem['pairRole']; role?: KeyItem['role'] } | null
}

export interface SheetMeta {
  nickname: string
  grade: 1 | 2
  cycleNumber: number
  sheetId: string
  paper: PaperSize
}

function roleOf(item: StoredItem): KeyItem['role'] {
  if (item.verification?.role) return item.verification.role
  if (item.is_stretch) return 'stretch'
  if (item.is_reading_probe) return 'reading_probe'
  return 'gap'
}

export async function buildPdfs(
  meta: SheetMeta,
  items: StoredItem[],
  skills: Map<string, Skill>,
): Promise<{ student: Uint8Array; key: Uint8Array }> {
  const ordered = [...items].sort((a, b) => a.position - b.position)

  const student = await renderStudentSheet({
    ...meta,
    questions: ordered.map((item) => ({ position: item.position, text: item.question_text })),
  })

  const key = await renderAnswerKey({
    ...meta,
    items: ordered.map((item) => ({
      position: item.position,
      questionText: item.question_text,
      correctAnswer: item.correct_answer,
      acceptedAnswers: item.accepted_answers,
      working: item.working,
      skillId: item.skill_id,
      skillName: skills.get(item.skill_id)?.name ?? item.skill_id,
      mathLevel: item.math_level,
      readingBand: item.reading_band,
      pairId: item.pair_id,
      pairRole: item.verification?.pairRole ?? null,
      role: roleOf(item),
    })),
  })
  return { student, key }
}

export function pdfPaths(userId: string, childId: string, sheetId: string) {
  const base = `${userId}/${childId}/${sheetId}`
  return { student: `${base}-student.pdf`, key: `${base}-key.pdf` }
}
