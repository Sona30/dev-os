import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { paperSize, uuid } from '@/lib/schemas/common'
import { assertCatalogUsable, getCatalog, indexBySkillId } from '@/lib/skills/catalog'
import { buildPdfs, pdfPaths, type StoredItem } from '@/lib/worksheets/build-pdfs'
import type { JobRunner } from '../context'
import { uploadPdf } from './generate-worksheet'

const inputSchema = z.object({ worksheetId: uuid, childId: uuid, paperSize }).passthrough()

/** Switches a worksheet between Letter and A4: same questions, new PDFs, no model call. */
export const runRerenderPdf: JobRunner = async ({ job, service, setProgress, assertChildExists }) => {
  const { worksheetId, childId, paperSize: paper } = inputSchema.parse(job.input)

  const { data: sheetRow, error: sheetError } = await service
    .from('worksheets')
    .select('id, child_id, cycle_id, sheet_id, verified_at')
    .eq('id', worksheetId)
    .maybeSingle()
  if (sheetError) throw new AppError('INTERNAL', { cause: sheetError })
  const sheet = sheetRow as { child_id: string; cycle_id: string; sheet_id: string; verified_at: string | null } | null
  if (!sheet || sheet.child_id !== childId || !sheet.verified_at) throw new AppError('NOT_FOUND')

  const [{ data: childRow, error: childError }, { data: cycleRow, error: cycleError }] = await Promise.all([
    service.from('children').select('user_id, nickname, grade').eq('id', childId).maybeSingle(),
    service.from('cycles').select('cycle_number').eq('id', sheet.cycle_id).maybeSingle(),
  ])
  if (childError || cycleError) throw new AppError('INTERNAL', { cause: childError ?? cycleError })
  const child = childRow as { user_id: string; nickname: string; grade: 1 | 2 } | null
  const cycle = cycleRow as { cycle_number: number } | null
  if (!child || child.user_id !== job.user_id || !cycle) throw new AppError('NOT_FOUND')

  await assertChildExists()
  await setProgress('loading')
  const { data: rows, error: itemsError } = await service
    .from('worksheet_items')
    .select(
      'position, skill_id, math_level, reading_band, pair_id, is_stretch, is_reading_probe, question_text, correct_answer, accepted_answers, working, verification',
    )
    .eq('worksheet_id', worksheetId)
    .order('position', { ascending: true })
  if (itemsError) throw new AppError('INTERNAL', { cause: itemsError })

  const catalog = await getCatalog()
  assertCatalogUsable(catalog)

  await setProgress('building_pdf')
  const pdfs = await buildPdfs(
    { nickname: child.nickname, grade: child.grade, cycleNumber: cycle.cycle_number, sheetId: sheet.sheet_id, paper },
    (rows ?? []) as StoredItem[],
    indexBySkillId(catalog),
  )
  const paths = pdfPaths(job.user_id, childId, sheet.sheet_id)
  await uploadPdf(service, paths.student, pdfs.student)
  await uploadPdf(service, paths.key, pdfs.key)

  const { error: updateError } = await service
    .from('worksheets')
    .update({ paper_size: paper, student_pdf_path: paths.student, key_pdf_path: paths.key })
    .eq('id', worksheetId)
  if (updateError) throw new AppError('INTERNAL', { cause: updateError })
  return { worksheetId }
}
