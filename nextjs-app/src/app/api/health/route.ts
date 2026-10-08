import { NextResponse } from 'next/server'
import { KB_VERSION } from '@/lib/foundry/kb-version.generated'
import { assertCatalogUsable, getCatalog } from '@/lib/skills/catalog'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// For uptime monitors (docs/specs/14 §6). Checks the database, file storage and the skills catalogue. It never
// calls the AI service (that costs money; see /api/health/ai). Answers 503 if anything is down so a monitor
// notices, and reveals nothing beyond yes/no per check.
export async function GET() {
  const checks = { db: false, storage: false, catalogue: false }

  try {
    const service = createServiceClient()
    const { error } = await service.from('skills_catalog').select('skill_id', { head: true, count: 'exact' })
    checks.db = !error

    const { error: storageError } = await service.storage.from('uploads').list('', { limit: 1 })
    checks.storage = !storageError

    try {
      assertCatalogUsable(await getCatalog())
      checks.catalogue = true
    } catch {
      checks.catalogue = false
    }
  } catch {
    // Missing configuration shows up as every check being false.
  }

  const healthy = checks.db && checks.storage && checks.catalogue
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', ...checks, kbVersion: KB_VERSION },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
