import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { callAgent } from '@/lib/foundry/client'
import type { AgentImage, AgentImageMime } from '@/lib/foundry/types'
import { uuid } from '@/lib/schemas/common'
import { createReadUrl } from '@/lib/storage/signed-urls'
import { recordUsage } from '@/lib/usage/record'
import type { JobRunner } from '../context'

const inputSchema = z.object({ reportId: uuid, childId: uuid }).passthrough()

const IMAGE_URL_TTL_SECONDS = 600
const AGENT_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** The database stores scores 0-1000; anything else the model returns is treated as unread. */
function scoreOrNull(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= 1000 ? value : null
}

/**
 * parse_report: reads the uploaded report pages with the vision agent and stores what it found.
 * Nothing is trusted yet — the parent confirms every value before a diagnosis can start (FR-03).
 * Idempotent: a report that is already parsed is returned unchanged.
 */
export const runParseReport: JobRunner = async ({ job, service, setProgress, assertChildExists }) => {
  const { reportId, childId } = inputSchema.parse(job.input)

  const { data: report, error: reportError } = await service
    .from('reports')
    .select('id, child_id, parse_status')
    .eq('id', reportId)
    .maybeSingle()
  if (reportError) throw new AppError('INTERNAL', { cause: reportError })
  if (!report || (report as { child_id: string }).child_id !== childId) throw new AppError('NOT_FOUND')
  if ((report as { parse_status: string }).parse_status === 'parsed') return { reportId }

  const { data: child, error: childError } = await service
    .from('children')
    .select('id, user_id, nickname, grade')
    .eq('id', childId)
    .maybeSingle()
  if (childError) throw new AppError('INTERNAL', { cause: childError })
  if (!child || (child as { user_id: string }).user_id !== job.user_id) throw new AppError('NOT_FOUND')
  const owner = child as { nickname: string; grade: 1 | 2 }

  await setProgress('reading_pages')
  const { data: pages, error: pagesError } = await service
    .from('uploads')
    .select('storage_path, mime, page_no')
    .eq('report_id', reportId)
    .eq('kind', 'report_page')
    .eq('confirmed_uploaded', true)
    .is('deleted_at', null)
    .order('page_no', { ascending: true })
  if (pagesError) throw new AppError('INTERNAL', { cause: pagesError })
  const uploads = (pages ?? []) as Array<{ storage_path: string; mime: string; page_no: number | null }>
  if (uploads.length === 0) throw new AppError('NOT_FOUND', { message: 'The report pages are no longer available.' })

  const images: AgentImage[] = []
  for (const upload of uploads) {
    // HEIC is converted in the browser before upload; anything else the model cannot read is refused here too.
    if (!AGENT_MIMES.includes(upload.mime)) throw new AppError('UNSUPPORTED_MEDIA')
    const url = await createReadUrl(service, 'uploads', upload.storage_path, IMAGE_URL_TTL_SECONDS)
    images.push({ url, mime: upload.mime as AgentImageMime, label: `Report page ${upload.page_no ?? images.length + 1}` })
  }

  await assertChildExists()
  await setProgress('extracting')
  const result = await callAgent({
    mode: 'parse',
    input: { grade: owner.grade, child_nickname: owner.nickname },
    images,
    usage: { userId: job.user_id, childId, jobId: job.id },
  })
  const parsed = result.data

  await setProgress('validating')
  if (parsed.status === 'rejected_input') {
    const { error } = await service
      .from('reports')
      .update({ parse_status: 'failed', parsed_values: parsed })
      .eq('id', reportId)
    if (error) throw new AppError('INTERNAL', { cause: error })
    return { reportId, rejected: true, reason: parsed.rejectReason }
  }

  const { error: updateError } = await service
    .from('reports')
    .update({
      parse_status: 'parsed',
      parsed_values: parsed,
      field_confidence: parsed.confidence,
      overall_score: scoreOrNull(parsed.overallScore),
      placement: parsed.placement,
      assessment_window: parsed.window,
      domain_results: parsed.domains,
    })
    .eq('id', reportId)
  if (updateError) throw new AppError('INTERNAL', { cause: updateError })
  await recordUsage({ userId: job.user_id, childId, jobId: job.id, event: 'report.parsed' })
  return { reportId, rejected: false }
}
