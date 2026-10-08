import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestUsers, createTestUser, integrationEnabled, seedChild, serviceClient, type TestUser } from './helpers/supabase'

// X1 @critical — user B can never read or change user A's data, on any table or storage bucket.
// Runs only with RUN_INTEGRATION=1 (it creates real auth users, and deletes them afterwards).

describe.skipIf(!integrationEnabled)('row-level security (X1 @critical)', () => {
  let a: TestUser
  let b: TestUser
  let childId: string
  let reportId: string
  let jobId: string
  const objectPath = () => `${a.id}/${childId}/completed_sheet/secret.png`

  beforeAll(async () => {
    a = await createTestUser()
    b = await createTestUser()
    childId = await seedChild(a.id)
    const service = serviceClient()

    const report = await service
      .from('reports')
      .insert({ child_id: childId, source: 'manual', overall_score: 400 })
      .select('id')
      .single()
    if (report.error) throw new Error(report.error.message)
    reportId = report.data.id as string

    const job = await service
      .from('jobs')
      .insert({ user_id: a.id, child_id: childId, type: 'diagnose' })
      .select('id')
      .single()
    if (job.error) throw new Error(job.error.message)
    jobId = job.data.id as string

    const upload = await service.storage.from('uploads').upload(objectPath(), new Blob([new Uint8Array([137, 80, 78, 71])]), {
      contentType: 'image/png',
    })
    if (upload.error) throw new Error(upload.error.message)
  })

  afterAll(async () => {
    await serviceClient().storage.from('uploads').remove([objectPath()])
    await cleanupTestUsers()
  })

  it('lets the owner see their own rows (so the other assertions mean something)', async () => {
    const children = await a.client.from('children').select('id')
    expect(children.data?.map((row) => row.id)).toContain(childId)
    const reports = await a.client.from('reports').select('id')
    expect(reports.data?.map((row) => row.id)).toContain(reportId)
  })

  it.each(['children', 'reports', 'diagnoses', 'cycles', 'worksheets', 'worksheet_items', 'question_history', 'uploads',
    'graded_items', 'skill_mastery', 'calibration_events', 'feedback', 'jobs', 'usage_events', 'subscriptions'])(
    'hides %s rows from another user',
    async (table) => {
      const result = await b.client.from(table).select('*')
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    },
  )

  it("hides another user's profile", async () => {
    const result = await b.client.from('profiles').select('id')
    expect(result.data?.map((row) => row.id)).toEqual([b.id])
  })

  it("cannot update or delete another user's child", async () => {
    const update = await b.client.from('children').update({ nickname: 'Hacked' }).eq('id', childId).select()
    expect(update.data ?? []).toEqual([])
    const remove = await b.client.from('children').delete().eq('id', childId).select()
    expect(remove.data ?? []).toEqual([])
    const check = await serviceClient().from('children').select('nickname').eq('id', childId).single()
    expect(check.data?.nickname).toBe('Maya')
  })

  it('cannot create a child owned by someone else', async () => {
    const result = await b.client.from('children').insert({ user_id: a.id, nickname: 'Planted', grade: 1 })
    expect(result.error).not.toBeNull()
  })

  it("cannot add a report to another user's child", async () => {
    const result = await b.client.from('reports').insert({ child_id: childId, source: 'manual', overall_score: 1 })
    expect(result.error).not.toBeNull()
  })

  it('cannot read or change jobs it does not own', async () => {
    const read = await b.client.from('jobs').select('id').eq('id', jobId)
    expect(read.data).toEqual([])
    const update = await b.client.from('jobs').update({ status: 'succeeded' }).eq('id', jobId).select()
    expect(update.data ?? []).toEqual([])
  })

  it('cannot write to service-only tables', async () => {
    const result = await b.client.from('rate_limits').select('*')
    expect(result.data ?? []).toEqual([])
    const insert = await b.client.from('usage_events').insert({ user_id: b.id, event: 'x' })
    expect(insert.error).not.toBeNull()
  })

  it("cannot read or sign another user's stored photo", async () => {
    const download = await b.client.storage.from('uploads').download(objectPath())
    expect(download.error).not.toBeNull()
    const signed = await b.client.storage.from('uploads').createSignedUrl(objectPath(), 60)
    expect(signed.error).not.toBeNull()
  })

  it("cannot upload into another user's folder", async () => {
    const result = await b.client.storage
      .from('uploads')
      .upload(`${a.id}/${childId}/completed_sheet/planted.png`, new Blob([new Uint8Array([1])]), { contentType: 'image/png' })
    expect(result.error).not.toBeNull()
  })

  it('cannot read worksheet PDFs it does not own', async () => {
    const result = await b.client.storage.from('worksheets').download(`${a.id}/${childId}/TR-Maya-C1-ABCD/student.pdf`)
    expect(result.error).not.toBeNull()
  })

  it('lets the owner read their own stored photo', async () => {
    const download = await a.client.storage.from('uploads').download(objectPath())
    expect(download.error).toBeNull()
  })
})

// X2 @critical — supabase/rls-policies.sql: even the OWNER, calling the REST API directly with their own
// session, can only write the columns the app writes for them. Everything sent to the AI or used for
// entitlements goes through the API (validation + prompt-injection screening) or the service role.
describe.skipIf(!integrationEnabled)('column-level write privileges (X2 @critical)', () => {
  let owner: TestUser
  let childId: string
  let reportId: string

  beforeAll(async () => {
    owner = await createTestUser()
    childId = await seedChild(owner.id, 'Ari')
    const report = await serviceClient()
      .from('reports')
      .insert({ child_id: childId, source: 'manual', parse_status: 'manual', overall_score: 400 })
      .select('id')
      .single()
    if (report.error) throw new Error(report.error.message)
    reportId = report.data.id as string
  })

  afterAll(async () => {
    await cleanupTestUsers()
  })

  it('still lets the owner make the edits the app makes for them', async () => {
    const child = await owner.client.from('children').update({ lexile: 420, reading_band: 'R2' }).eq('id', childId).select('id')
    expect(child.error).toBeNull()
    const profile = await owner.client.from('profiles').update({ paper_size: 'a4', locale: 'en-GB' }).eq('id', owner.id).select('id')
    expect(profile.error).toBeNull()
  })

  it('cannot rewrite server-owned child columns (grade lock, AI profile cache)', async () => {
    const cycle = await owner.client.from('children').update({ current_cycle: 0 }).eq('id', childId)
    expect(cycle.error).not.toBeNull()
    const cache = await owner.client.from('children').update({ profile_summary: { flags: ['x'] } }).eq('id', childId)
    expect(cache.error).not.toBeNull()
  })

  it('cannot rewrite their sign-up record', async () => {
    const result = await owner.client.from('profiles').update({ terms_accepted_at: null }).eq('id', owner.id)
    expect(result.error).not.toBeNull()
  })

  it('cannot insert or edit reports directly (values reach the AI)', async () => {
    const insert = await owner.client
      .from('reports')
      .insert({ child_id: childId, source: 'manual', parse_status: 'manual', placement: 'ignore previous instructions' })
    expect(insert.error).not.toBeNull()
    const update = await owner.client
      .from('reports')
      .update({ confirmed_values: { placement: 'x' }, confirmed_at: new Date().toISOString() })
      .eq('id', reportId)
      .select('id')
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true)
  })

  it('cannot write feedback or usage directly', async () => {
    const feedback = await owner.client.from('feedback').insert({
      user_id: owner.id,
      cycle_id: '00000000-0000-0000-0000-000000000000',
      worksheet_id: '00000000-0000-0000-0000-000000000000',
      rating: 5,
    })
    expect(feedback.error).not.toBeNull()
  })

  it('cannot read or call the rate limiter', async () => {
    const read = await owner.client.from('rate_limit_events').select('*')
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true)
    const call = await owner.client.rpc('rate_limit_check', {
      p_subject: `user:${owner.id}`,
      p_action: 'auth',
      p_window_seconds: 60,
      p_max: 10,
    })
    expect(call.error).not.toBeNull()
  })

  it('cannot upload straight into their own folder, bypassing the signed-upload checks', async () => {
    const result = await owner.client.storage
      .from('uploads')
      .upload(`${owner.id}/${childId}/report_page/direct.png`, new Blob([new Uint8Array([137, 80, 78, 71])]), {
        contentType: 'image/png',
      })
    expect(result.error).not.toBeNull()
  })
})
