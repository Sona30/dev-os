import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '../helpers/fake-supabase'

// X2 @critical: the child's surfaces never contain answers.
// X3 @critical: a worksheet without verified_at is invisible to parents.

const service = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => service.client }))
vi.mock('@/lib/children/children.service', () => ({ requireChild: vi.fn() }))
vi.mock('@/lib/entitlements/entitlements.service', () => ({ assertCanStartCycle: vi.fn() }))
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: vi.fn() }))
vi.mock('@/lib/usage/record', () => ({ recordUsage: vi.fn() }))

const { getWorksheetDetail } = await import('@/lib/worksheets/worksheets.service')

const SECRET_ANSWER = 'SECRET-ANSWER-731'

const sheetRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'w1',
  cycle_id: 'cy1',
  child_id: 'c1',
  sheet_id: 'TR-Maya-C1-ABCD',
  version: 1,
  paper_size: 'letter',
  is_current: true,
  verified_at: '2026-01-01T00:00:00Z',
  student_pdf_path: 'u1/c1/TR-Maya-C1-ABCD/student.pdf',
  key_pdf_path: 'u1/c1/TR-Maya-C1-ABCD/key.pdf',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const cycleRow = {
  id: 'cy1',
  child_id: 'c1',
  cycle_number: 1,
  status: 'ready',
  diagnosis_id: null,
  regenerations_used: 0,
  parent_difficulty_feedback: null,
  read_aloud: false,
  focus: null,
}

// The database rows deliberately carry answer-bearing columns, as if a query had selected too much.
const itemRows = [
  {
    id: 'i1', position: 1, question_text: 'Mia has 4 ducks and gets 3 more. How many now?', answer_type: 'integer',
    domain: 'Number & Operations', correct_answer: SECRET_ANSWER, accepted_answers: [SECRET_ANSWER], working: SECRET_ANSWER,
    skill_id: 'G1.NO.02', math_level: 2,
  },
]

describe('getWorksheetDetail', () => {
  beforeEach(() => {
    service.client = fakeSupabase({})
  })

  it('returns only question text, position and answer type for each item (X2)', async () => {
    const supabase = fakeSupabase({ worksheets: { rows: [sheetRow()] }, cycles: { rows: [cycleRow] }, worksheet_items: { rows: itemRows } })
    const detail = await getWorksheetDetail(supabase, 'w1')
    expect(Object.keys(detail.items[0] ?? {}).sort()).toEqual(['answerType', 'id', 'position', 'questionText'])
    expect(JSON.stringify(detail.items)).not.toContain(SECRET_ANSWER)
    expect(JSON.stringify(detail)).not.toContain('G1.NO.02')
  })

  it('hides a worksheet that has not been verified (X3)', async () => {
    const supabase = fakeSupabase({ worksheets: { rows: [sheetRow({ verified_at: null })] }, cycles: { rows: [cycleRow] }, worksheet_items: { rows: itemRows } })
    await expect(getWorksheetDetail(supabase, 'w1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('behaves the same as a missing worksheet', async () => {
    const supabase = fakeSupabase({ worksheets: { rows: [] } })
    await expect(getWorksheetDetail(supabase, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('issues no download links while the kill switch is on', async () => {
    process.env.DISABLE_SIGNED_URLS = 'true'
    try {
      const supabase = fakeSupabase({ worksheets: { rows: [sheetRow()] }, cycles: { rows: [cycleRow] }, worksheet_items: { rows: itemRows } })
      await expect(getWorksheetDetail(supabase, 'w1')).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE' })
    } finally {
      delete process.env.DISABLE_SIGNED_URLS
    }
  })
})
