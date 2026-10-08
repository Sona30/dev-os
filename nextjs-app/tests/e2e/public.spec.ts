import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Pages anyone can open. They must render, have one main heading, and have no serious accessibility violations
// (WCAG 2.1 AA, docs/specs/15 §1).

const PUBLIC_PAGES = [
  { path: '/', name: 'landing' },
  { path: '/pricing', name: 'pricing' },
  { path: '/privacy', name: 'privacy' },
  { path: '/terms', name: 'terms' },
  { path: '/trust', name: 'trust' },
  { path: '/login', name: 'log in' },
  { path: '/signup', name: 'sign up' },
]

for (const { path, name } of PUBLIC_PAGES) {
  test.describe(`${name} page`, () => {
    test('renders with one main heading and a skip link', async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveCount(1)
    })

    test('has no serious accessibility violations', async ({ page }) => {
      await page.goto(path)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
    })

    test('does not scroll sideways on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  })
}

test('signed-out visitors are sent to log in from the app area', async ({ page }) => {
  await page.goto('/children')
  await expect(page).toHaveURL(/\/login\?next=%2Fchildren/)
})

test('the child area and account are protected too', async ({ page }) => {
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login/)
})

test('log in shows field errors for empty input', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText(/email/i).first()).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('API routes reject signed-out calls without leaking details', async ({ request }) => {
  const response = await request.get('/api/children')
  expect(response.status()).toBe(401)
  const body = await response.json()
  expect(body.error.code).toBe('UNAUTHENTICATED')
  expect(JSON.stringify(body)).not.toMatch(/supabase|stack|at .*\.ts/i)
})

test('security headers are present', async ({ request }) => {
  const response = await request.get('/')
  const headers = response.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options'] ?? headers['content-security-policy']).toBeTruthy()
})
