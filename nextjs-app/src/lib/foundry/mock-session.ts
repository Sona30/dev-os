import diagnoseOk from '../../../tests/fixtures/foundry/diagnose.ok.json'
import explainOk from '../../../tests/fixtures/foundry/explain.ok.json'
import generateOk from '../../../tests/fixtures/foundry/generate.ok.json'
import gradeOk from '../../../tests/fixtures/foundry/grade.ok.json'
import parseOk from '../../../tests/fixtures/foundry/parse.ok.json'
import parseRejected from '../../../tests/fixtures/foundry/parse.rejected.json'
import type { AgentSession, Mode, TurnOptions, TurnResult } from './types'

// A stand-in for the real agent used by automated tests and local development (FOUNDRY_MOCK=true).
// It returns golden fixtures and supports a few failure variants chosen with `input._fixture`:
//   invalid_then_valid  → first reply has broken JSON, the corrective retry succeeds
//   always_invalid      → every reply has broken JSON
//   rejected            → (parse mode) the upload is not an i-Ready Math report

interface MockPlanItem {
  position: number
  skillId: string
  domain: string
  mathLevel: number
  readingBand: 'R1' | 'R2' | 'R3' | 'R4'
  role: string
  pairId: string | null
  minimalReading?: boolean
  nameHint?: string
}

const NOUNS = ['ducks', 'cars', 'hats', 'pens', 'books', 'balls', 'cups', 'stars']
const PLACES = ['park', 'store', 'school', 'kitchen']
const STRUCTURES = ['join', 'part-part-whole', 'add-on']
const MAX_SUM = [10, 20, 50, 100]

/**
 * A stand-in generator so the whole worksheet pipeline can run without Azure: it follows the plan exactly and
 * writes simple addition stories that satisfy each reading band. It is arithmetic-only and for development and
 * tests; the real agent writes problems for every skill.
 */
function mockWorksheet(input: unknown): unknown {
  const body = input as {
    plan?: { items?: MockPlanItem[]; cycleNumber?: number }
    rework?: Array<{ position: number }>
  }
  const cycle = body.plan?.cycleNumber ?? 1
  const wanted = body.rework ? new Set(body.rework.map((entry) => entry.position)) : null
  const perturbation = body.rework ? 13 : 0

  const items = (body.plan?.items ?? [])
    .filter((item) => !wanted || wanted.has(item.position))
    .map((item) => {
      const span = Math.max(3, Math.floor((MAX_SUM[item.mathLevel - 1] ?? 20) / 2) - 1)
      const a = 1 + ((item.position * 7 + cycle * 5 + item.mathLevel * 3 + perturbation) % span)
      const b = 1 + ((item.position * 11 + cycle * 3 + perturbation * 2) % span)
      const name = item.nameHint ?? 'Mia'
      const noun = NOUNS[(item.position + cycle + perturbation) % NOUNS.length] ?? 'ducks'
      const place = PLACES[(item.position * 3 + cycle + perturbation) % PLACES.length] ?? 'park'

      let text: string
      if (item.readingBand === 'R1' && item.minimalReading) text = `${name} has ${a} and gets ${b}. How many?`
      else if (item.readingBand === 'R1') text = `${name} has ${a} ${noun} and gets ${b} more. How many now?`
      else if (item.readingBand === 'R2') text = `${name} has ${a} ${noun}. ${name} gets ${b} more. How many now?`
      else {
        text = `${name} is at the ${place}. ${name} has ${a} ${noun}. Then ${name} gets ${b} more. How many ${noun} does ${name} have now?`
        if (item.readingBand === 'R4') text += ` The ${place} is very busy today.`
      }
      const sum = a + b
      return {
        position: item.position,
        skillId: item.skillId,
        domain: item.domain,
        mathLevel: item.mathLevel,
        readingBand: item.readingBand,
        pairId: item.pairId,
        isStretch: item.role === 'stretch',
        isReadingProbe: item.role === 'reading_probe',
        structure: STRUCTURES[(item.position + cycle) % STRUCTURES.length] ?? 'join',
        context: `${place} ${noun}`,
        numberSet: [a, b],
        questionText: text,
        answerType: 'integer',
        correctAnswer: String(sum),
        acceptedAnswers: [],
        working: `${a} + ${b} = ${sum}`,
        verification: { expression: `${a} + ${b}`, expected: String(sum), passed: true, method: 'code_interpreter' },
        ambiguous: false,
      }
    })
  return { items, flags: [] }
}

/**
 * Reads the sheet the way a careful grader would: every answer matches the key, except that question 2 is
 * written unclearly (low confidence) so the parent review queue can be tried without Azure.
 */
function mockGrading(input: unknown): unknown {
  const body = input as {
    sheet_id?: string
    key?: Array<{ position: number; correct_answer: string }>
  }
  const items = (body.key ?? []).map((row) => {
    const unclear = row.position === 2
    return {
      position: row.position,
      extractedAnswer: row.correct_answer,
      extractionConfidence: unclear ? 0.6 : 0.96,
      boundingBox: { x: 0.55, y: Math.min(0.9, 0.12 + (row.position - 1) * 0.08), w: 0.2, h: 0.06, page: 1 },
      status: 'correct',
      errorType: null,
      methodEvidence: unclear ? 'The digits are hard to tell apart.' : 'Showed the counting.',
      methodSound: unclear ? null : true,
    }
  })
  return { sheetId: body.sheet_id ?? null, sheetIdConfidence: 0.95, qualityAssessment: 'good', items, flags: [] }
}

const FIXTURES: Record<Mode, unknown> = {
  parse: parseOk,
  diagnose: diagnoseOk,
  generate: generateOk,
  grade: gradeOk,
  explain: explainOk,
}

function reply(mode: Mode, variant: string | undefined, turn: number, input: unknown): string {
  if (variant === 'always_invalid' || (variant === 'invalid_then_valid' && turn === 1)) {
    return 'Here is the result.\n```json\n{ "this": "is not valid json", \n```'
  }
  const data =
    mode === 'parse' && variant === 'rejected' ? parseRejected : mode === 'generate' ? mockWorksheet(input) : mode === 'grade' ? mockGrading(input) : FIXTURES[mode]
  return `Here is the ${mode} result (mock).\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
}

export function createMockSession(mode: Mode, input: unknown): AgentSession {
  const variant = (input as { _fixture?: string } | null)?._fixture
  let turn = 0

  return {
    async send(parts, options: TurnOptions): Promise<TurnResult> {
      turn += 1
      const promptChars = parts.reduce((total, part) => total + (part.type === 'text' ? part.text.length : 200), 0)
      const text = reply(mode, variant, turn, input)
      return {
        text,
        inputTokens: Math.ceil(promptChars / 4),
        outputTokens: Math.ceil(text.length / 4),
        codeInterpreterSessions: mode === 'generate' ? 1 : 0,
        toolEvents: mode === 'generate' ? [{ tool: 'code_interpreter', status: 'completed' }] : [],
        model: `${options.model}-mock`,
      }
    },
    async close() {
      // nothing to release
    },
  }
}
