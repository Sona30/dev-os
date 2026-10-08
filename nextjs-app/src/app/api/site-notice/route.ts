import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Incident banner text (docs/specs/13 §6). Served from a tiny endpoint, not baked into pages at build time, so
// changing SITE_NOTICE_TEXT in Netlify and re-deploying the env is enough to show or clear a notice quickly.
export async function GET() {
  const text = process.env.SITE_NOTICE_TEXT?.trim() || null
  return NextResponse.json({ text }, { headers: { 'Cache-Control': 'no-store' } })
}
