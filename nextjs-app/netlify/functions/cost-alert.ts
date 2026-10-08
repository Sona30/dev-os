import { collectMetrics, deliverAlerts, evaluateAlerts, thresholdsFromEnv } from '@/lib/observability/alerts'
import { getLogger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'

// Hourly health check on cost, quality and the job queue (docs/specs/14 §5). Quiet when everything is fine.
export const config = { schedule: '0 * * * *' }

export default async function handler(): Promise<Response> {
  const log = getLogger({ route: 'cost-alert' })
  const service = createServiceClient()

  try {
    const metrics = await collectMetrics(service)
    const alerts = evaluateAlerts(metrics, thresholdsFromEnv())
    if (alerts.length === 0) {
      log.info('no alerts')
      return new Response(null, { status: 200 })
    }
    const delivery = await deliverAlerts(service, alerts, log)
    log.info(delivery, 'alerts processed')
  } catch (error) {
    log.error({ err: error }, 'alert check failed')
  }
  return new Response(null, { status: 200 })
}
