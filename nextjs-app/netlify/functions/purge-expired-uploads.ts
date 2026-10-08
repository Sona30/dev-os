import { purgeExpired, sweepOrphans } from '@/lib/privacy/retention'
import { getLogger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'

// Nightly at 03:00 UTC (docs/specs/13 §4): removes uploaded images after 30 days, abandoned upload slots,
// old audit rows and rate-limit counters. On Sundays it also sweeps files whose owner no longer exists.
// Logs counts only — never names, paths or file contents.

export const config = { schedule: '0 3 * * *' }

export default async function handler(): Promise<Response> {
  const log = getLogger({ route: 'purge-expired-uploads' })
  const service = createServiceClient()
  const now = new Date()

  try {
    const report = await purgeExpired(service, now)
    log.info(report, 'retention sweep finished')
  } catch (error) {
    log.error({ err: error }, 'retention sweep failed; it will run again tomorrow')
  }

  if (now.getUTCDay() === 0) {
    try {
      const swept = await sweepOrphans(service)
      log.info(swept, 'orphan sweep finished')
    } catch (error) {
      log.error({ err: error }, 'orphan sweep failed; it will run again next week')
    }
  }
  return new Response(null, { status: 200 })
}
