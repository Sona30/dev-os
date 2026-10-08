// Page geometry for the printable sheets. Pure functions (no PDF library) so the rules can be tested:
//   - at most 10 questions in total, each in its own numbered box (docs/specs/08 §4.5),
//   - body text 14 pt or larger,
//   - the "Show your work" area is at least 40% of each question box's height.

export type PaperSize = 'letter' | 'a4'

export const PAPER: Record<PaperSize, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
}

export const MARGIN = 36 // 12.7 mm, above the 12 mm minimum printers need
export const BODY_PT = 14
export const LINE_PT = 18
export const BOX_PAD = 10
export const NUMBER_COLUMN = 32
export const ANSWER_ROW = 34
export const WORK_LABEL = 16
export const BOX_GAP = 10
export const FIRST_HEADER = 92
export const OTHER_HEADER = 34
export const FOOTER = 26
export const MIN_WORK_SHARE = 0.4
export const MIN_WORK_HEIGHT = 56
export const MAX_ITEMS = 10

export type Measure = (text: string, size: number, bold?: boolean) => number

/** Greedy word wrap; a single word longer than the line is broken so nothing is ever cut off. */
export function wrapLines(text: string, maxWidth: number, size: number, measure: Measure, bold = false): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (measure(candidate, size, bold) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    let remainder = word
    while (measure(remainder, size, bold) > maxWidth && remainder.length > 1) {
      let cut = remainder.length - 1
      while (cut > 1 && measure(remainder.slice(0, cut), size, bold) > maxWidth) cut--
      lines.push(remainder.slice(0, cut))
      remainder = remainder.slice(cut)
    }
    current = remainder
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

export interface QuestionBlock {
  position: number
  lines: string[]
  textHeight: number
  workHeight: number
  boxHeight: number
}

export interface SheetPage {
  header: number
  blocks: QuestionBlock[]
}

export function textWidthFor(paper: PaperSize): number {
  return PAPER[paper].width - 2 * MARGIN - 2 * BOX_PAD - NUMBER_COLUMN
}

/** Sizes one question box so the work area is at least 40% of the box. */
export function sizeQuestion(position: number, text: string, paper: PaperSize, measure: Measure): QuestionBlock {
  const lines = wrapLines(text, textWidthFor(paper), BODY_PT, measure)
  const textHeight = lines.length * LINE_PT
  const fixed = BOX_PAD * 2 + textHeight + 8 + ANSWER_ROW + 8 + WORK_LABEL
  // work / (fixed + work) >= 0.4  →  work >= fixed * 0.4 / 0.6
  const workHeight = Math.max(MIN_WORK_HEIGHT, Math.ceil((fixed * MIN_WORK_SHARE) / (1 - MIN_WORK_SHARE)))
  return { position, lines, textHeight, workHeight, boxHeight: fixed + workHeight }
}

/** Splits questions across as many pages as needed (never more than 10 questions in total). */
export function layoutStudentSheet(
  questions: Array<{ position: number; text: string }>,
  paper: PaperSize,
  measure: Measure,
): SheetPage[] {
  if (questions.length > MAX_ITEMS) throw new Error(`A sheet may have at most ${MAX_ITEMS} questions.`)

  const pageHeight = PAPER[paper].height
  const pages: SheetPage[] = []
  let current: SheetPage | null = null
  let used = 0

  for (const question of questions) {
    const block = sizeQuestion(question.position, question.text, paper, measure)
    const header = pages.length === 0 ? FIRST_HEADER : OTHER_HEADER
    const available = pageHeight - 2 * MARGIN - FOOTER - header

    if (block.boxHeight > available) {
      throw new Error(`Question ${question.position} is too long to fit on a page.`)
    }
    const needed = used === 0 ? block.boxHeight : used + BOX_GAP + block.boxHeight
    const currentAvailable = current ? pageHeight - 2 * MARGIN - FOOTER - current.header : 0

    if (!current || needed > currentAvailable) {
      current = { header: pages.length === 0 ? FIRST_HEADER : OTHER_HEADER, blocks: [] }
      pages.push(current)
      used = 0
    }
    used = used === 0 ? block.boxHeight : used + BOX_GAP + block.boxHeight
    current.blocks.push(block)
  }
  return pages
}
