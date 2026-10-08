import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import {
  ANSWER_ROW,
  BODY_PT,
  BOX_GAP,
  BOX_PAD,
  FOOTER,
  LINE_PT,
  MARGIN,
  NUMBER_COLUMN,
  PAPER,
  WORK_LABEL,
  layoutStudentSheet,
  wrapLines,
  type Measure,
  type PaperSize,
} from './layout'
import { toWinAnsi } from './winansi'

// Builds the two printable PDFs with pdf-lib: black-and-white, standard fonts, no images (docs/specs/08 §4.5).

const BLACK = rgb(0, 0, 0)
const DARK_GREY = rgb(0.25, 0.25, 0.25)

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  measure: Measure
}

async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const measure: Measure = (text, size, isBold = false) => (isBold ? bold : regular).widthOfTextAtSize(text, size)
  return { regular, bold, measure }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export interface StudentSheetInput {
  nickname: string
  grade: 1 | 2
  cycleNumber: number
  sheetId: string
  paper: PaperSize
  questions: Array<{ position: number; text: string }>
  date?: Date
}

/** The child's copy: header, up to 10 numbered question boxes, an answer box and work space for each. No answers. */
export async function renderStudentSheet(input: StudentSheetInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`TestReady practice sheet ${input.sheetId}`)
  doc.setProducer('TestReady')
  const fonts = await loadFonts(doc)
  const { width, height } = PAPER[input.paper]

  const questions = input.questions.map((question) => ({ position: question.position, text: toWinAnsi(question.text) }))
  const pages = layoutStudentSheet(questions, input.paper, fonts.measure)
  const nickname = toWinAnsi(input.nickname)
  const date = formatDate(input.date ?? new Date())

  pages.forEach((sheetPage, pageIndex) => {
    const page = doc.addPage([width, height])
    let y = height - MARGIN

    if (pageIndex === 0) {
      page.drawText('TestReady practice sheet', { x: MARGIN, y: y - 16, size: 18, font: fonts.bold, color: BLACK })
      y -= 36
      page.drawText(`Name: ${nickname}`, { x: MARGIN, y: y - 12, size: BODY_PT, font: fonts.regular, color: BLACK })
      page.drawText(`Date: ${date}`, { x: MARGIN + (width - 2 * MARGIN) * 0.55, y: y - 12, size: BODY_PT, font: fonts.regular, color: BLACK })
      y -= 22
      page.drawText(`Grade ${input.grade}  -  Cycle ${input.cycleNumber}`, { x: MARGIN, y: y - 12, size: BODY_PT, font: fonts.regular, color: BLACK })
      const idText = `Sheet ID: ${input.sheetId}`
      page.drawText(idText, {
        x: width - MARGIN - fonts.measure(idText, BODY_PT, true),
        y: y - 12,
        size: BODY_PT,
        font: fonts.bold,
        color: BLACK,
      })
      y -= 24
      page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 1, color: BLACK })
      y -= 8
    } else {
      page.drawText(`TestReady practice sheet  -  ${nickname}`, { x: MARGIN, y: y - 12, size: 11, font: fonts.regular, color: BLACK })
      const idText = `Sheet ID: ${input.sheetId}`
      page.drawText(idText, { x: width - MARGIN - fonts.measure(idText, 11, true), y: y - 12, size: 11, font: fonts.bold, color: BLACK })
      y -= sheetPage.header
    }

    for (const block of sheetPage.blocks) {
      const top = y
      page.drawRectangle({
        x: MARGIN,
        y: top - block.boxHeight,
        width: width - 2 * MARGIN,
        height: block.boxHeight,
        borderColor: BLACK,
        borderWidth: 1.2,
      })
      page.drawText(`${block.position}.`, {
        x: MARGIN + BOX_PAD,
        y: top - BOX_PAD - BODY_PT,
        size: 16,
        font: fonts.bold,
        color: BLACK,
      })
      block.lines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: MARGIN + BOX_PAD + NUMBER_COLUMN,
          y: top - BOX_PAD - BODY_PT - lineIndex * LINE_PT,
          size: BODY_PT,
          font: fonts.regular,
          color: BLACK,
        })
      })

      // Boxed final-answer line (open decision 2: free work area plus a boxed final answer).
      const answerTop = top - BOX_PAD - block.textHeight - 8
      page.drawText('Answer:', { x: MARGIN + BOX_PAD + NUMBER_COLUMN, y: answerTop - 22, size: BODY_PT, font: fonts.bold, color: BLACK })
      page.drawRectangle({
        x: MARGIN + BOX_PAD + NUMBER_COLUMN + 70,
        y: answerTop - ANSWER_ROW + 2,
        width: 130,
        height: ANSWER_ROW - 4,
        borderColor: BLACK,
        borderWidth: 1.2,
      })

      const workTop = answerTop - ANSWER_ROW - 8
      page.drawText('Show your work', { x: MARGIN + BOX_PAD, y: workTop - 11, size: 10, font: fonts.regular, color: DARK_GREY })
      y = top - block.boxHeight - BOX_GAP
    }

    const footer = `Sheet ID: ${input.sheetId}   -   Page ${pageIndex + 1} of ${pages.length}`
    page.drawText(footer, {
      x: (width - fonts.measure(footer, 10)) / 2,
      y: MARGIN - 6,
      size: 10,
      font: fonts.regular,
      color: DARK_GREY,
    })
  })

  return doc.save()
}

export interface KeyItem {
  position: number
  questionText: string
  correctAnswer: string
  acceptedAnswers: string[]
  working: string
  skillId: string
  skillName: string
  mathLevel: number
  readingBand: string
  pairId: string | null
  pairRole: 'low_reading' | 'target_reading' | null
  role: 'gap' | 'near_mastery' | 'review' | 'stretch' | 'reading_probe'
}

export interface AnswerKeyInput {
  nickname: string
  grade: 1 | 2
  cycleNumber: number
  sheetId: string
  paper: PaperSize
  items: KeyItem[]
  date?: Date
}

const ROLE_NOTES: Record<KeyItem['role'], string | null> = {
  gap: null,
  near_mastery: 'Confidence question: a skill your child usually has.',
  review: 'Review question: re-checks a skill from earlier.',
  stretch: 'Stretch question: one step harder than usual. A miss here is fine.',
  reading_probe: 'Reading check: same maths as usual, with slightly harder wording.',
}

class Flow {
  page!: PDFPage
  y = 0
  pageNumber = 0
  private readonly width: number
  private readonly height: number

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    paper: PaperSize,
    private readonly footerText: string,
  ) {
    this.width = PAPER[paper].width
    this.height = PAPER[paper].height
    this.newPage()
  }

  private newPage() {
    this.page = this.doc.addPage([this.width, this.height])
    this.pageNumber += 1
    this.y = this.height - MARGIN
    const footer = `${this.footerText}   -   Page ${this.pageNumber}`
    this.page.drawText(footer, {
      x: (this.width - this.fonts.measure(footer, 9)) / 2,
      y: MARGIN - 6,
      size: 9,
      font: this.fonts.regular,
      color: DARK_GREY,
    })
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + FOOTER) this.newPage()
  }

  gap(amount: number) {
    this.y -= amount
  }

  text(content: string, options: { size?: number; bold?: boolean; indent?: number; leading?: number } = {}) {
    const size = options.size ?? 11
    const leading = options.leading ?? size + 4
    const indent = options.indent ?? 0
    const lines = wrapLines(toWinAnsi(content), this.width - 2 * MARGIN - indent, size, this.fonts.measure, options.bold)
    for (const line of lines) {
      this.ensure(leading)
      this.y -= leading
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y + 3,
        size,
        font: options.bold ? this.fonts.bold : this.fonts.regular,
        color: BLACK,
      })
    }
  }

  rule() {
    this.ensure(8)
    this.y -= 4
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: this.width - MARGIN, y: this.y },
      thickness: 0.6,
      color: DARK_GREY,
    })
    this.y -= 4
  }
}

/** The parent's copy: answers, worked solutions, skill and level tags, and how to tell a reading slip from a maths slip. */
export async function renderAnswerKey(input: AnswerKeyInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`TestReady parent answer key ${input.sheetId}`)
  doc.setProducer('TestReady')
  const fonts = await loadFonts(doc)
  const flow = new Flow(doc, fonts, input.paper, `Parent copy - do not give to your child   -   Sheet ID: ${input.sheetId}`)

  flow.text('Parent answer key', { size: 20, bold: true, leading: 26 })
  flow.text('Parent copy - please do not give this to your child before they finish the sheet.', { size: 11 })
  flow.gap(6)
  flow.text(
    `${input.nickname}  -  Grade ${input.grade}  -  Cycle ${input.cycleNumber}  -  Sheet ID: ${input.sheetId}  -  ${formatDate(input.date ?? new Date())}`,
    { size: 12, bold: true },
  )
  flow.rule()

  flow.text('What this sheet practises', { size: 14, bold: true, leading: 20 })
  const skills = new Map<string, KeyItem>()
  for (const item of input.items) if (!skills.has(item.skillId)) skills.set(item.skillId, item)
  for (const item of Array.from(skills.values())) {
    const count = input.items.filter((candidate) => candidate.skillId === item.skillId).length
    flow.text(`- ${item.skillName} (${item.skillId}), ${count} question${count === 1 ? '' : 's'}`, { indent: 8 })
  }
  flow.gap(4)
  flow.text(
    'Reading or maths? Some questions come in pairs: the same maths skill, written with easier and with usual wording. ' +
      'If the easier-wording question is right but the other is wrong, reading may be the barrier. If both are wrong, look at the maths. ' +
      'Please do not coach during the sheet. If you read questions aloud, tell us when you upload it.',
    { size: 10, leading: 14 },
  )
  flow.rule()

  const pairSeen = new Set<string>()
  for (const item of input.items) {
    flow.ensure(90)
    flow.gap(6)
    flow.text(`Question ${item.position}`, { size: 13, bold: true, leading: 18 })
    flow.text(`Answer: ${item.correctAnswer}`, { size: 13, bold: true, leading: 18 })
    const alternatives = item.acceptedAnswers.filter((answer) => answer !== item.correctAnswer)
    if (alternatives.length > 0) flow.text(`Also accept: ${alternatives.join(', ')}`, { size: 10 })
    flow.text(item.questionText, { size: 11, indent: 8 })
    flow.text(`How to solve it: ${item.working}`, { size: 11, indent: 8 })
    flow.text(`Skill: ${item.skillName} (${item.skillId})  -  Math level M${item.mathLevel}  -  Reading band ${item.readingBand}`, { size: 10 })
    const note = ROLE_NOTES[item.role]
    if (note) flow.text(note, { size: 10 })
    if (item.pairId && !pairSeen.has(item.pairId)) {
      pairSeen.add(item.pairId)
      const partner = input.items.find((other) => other.pairId === item.pairId && other.position !== item.position)
      if (partner) {
        flow.text(
          `Pair ${item.pairId}: questions ${Math.min(item.position, partner.position)} and ${Math.max(item.position, partner.position)} test the same skill with different reading loads.`,
          { size: 10 },
        )
      }
    }
    flow.rule()
  }

  return doc.save()
}
