import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

// The parent journey with a real Supabase project and the AI mocked: log in, add a child, reach the child's pages,
// and prove another parent's child is not reachable. Opt in with RUN_E2E_AUTH=1; it creates and removes real users.

const enabled = process.env.RUN_E2E_AUTH === '1'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

test.describe('parent journey', () => {
  test.skip(!enabled || !url || !serviceKey, 'Set RUN_E2E_AUTH=1 and Supabase keys in the environment to run this.')

  const admin = enabled && url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null
  const users: string[] = []

  async function newUser() {
    const email = `tr-e2e-${randomUUID()}@example.com`
    const password = `Tr-${randomUUID()}`
    const { data, error } = await admin!.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw new Error(error?.message ?? 'could not create user')
    users.push(data.user.id)
    return { id: data.user.id, email, password }
  }

  test.afterAll(async () => {
    for (const id of users) await admin?.auth.admin.deleteUser(id)
  })

  test('log in and add a child', async ({ page }) => {
    const user = await newUser()
    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/children/)

    // The form opens in a dialog from the children page (ChildList -> ChildForm).
    await page.getByRole('button', { name: /add a child/i }).first().click()
    await page.getByLabel('First name or nickname').fill('Maya')
    await page.getByLabel('1st grade').check()
    await page.getByRole('button', { name: 'Add child' }).click()
    await expect(page.getByText('Maya').first()).toBeVisible()
  })

  test("one parent cannot open another parent's child", async ({ page, context }) => {
    const owner = await newUser()
    const other = await newUser()
    const { data, error } = await admin!.from('children').insert({ user_id: owner.id, nickname: 'Ava', grade: 1 }).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'could not seed child')

    await context.clearCookies()
    await page.goto('/login')
    await page.getByLabel('Email').fill(other.email)
    await page.getByLabel('Password').fill(other.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/children/)

    const response = await page.goto(`/children/${data.id}/plan`)
    expect(response?.status()).toBe(404)
    await expect(page.getByText('Ava')).toHaveCount(0)

    const api = await page.request.get(`/api/children/${data.id}`)
    expect(api.status()).toBe(404)
  })
})
