import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { callAgent } from '@/lib/foundry/client'

export const dynamic = 'force-dynamic'

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret || !header.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// A real (tiny) call to the AI agent for an on-call smoke check. It costs a little, so it needs the shared
// secret and is meant to be called by hand or by a monitor a few times a day, not on every uptime ping.
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const startedAt = Date.now()
  try {
    const result = await callAgent({ mode: 'explain', input: { events: [] } })
    return NextResponse.json(
      { status: 'ok', model: result.model, durationMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { status: 'down', durationMs: Date.now() - startedAt },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
