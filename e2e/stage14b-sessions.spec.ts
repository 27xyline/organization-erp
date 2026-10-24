import { expect, test } from '@playwright/test'

test('Python session survives SSR reload, rejects CSRF, and logout revokes the old cookie', async ({ page }) => {
  const username = process.env.STAGE14B_E2E_USERNAME
  const password = process.env.STAGE14B_E2E_PASSWORD
  if (!username || !password) throw new Error('Stage 14B E2E credentials are required')

  await page.goto('/login')
  await page.getByLabel('Пользователь').fill(username)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })

  const oldCookies = await page.context().cookies()
  const oldSession = oldCookies.find((cookie) => cookie.name === 'erp_session')
  expect(oldSession).toMatchObject({ httpOnly: true, path: '/', sameSite: 'Lax' })
  expect(oldSession?.domain).toBe('127.0.0.1')

  await page.reload()
  await expect(page).toHaveURL(/\/$/)
  expect((await page.request.get('/api/account/me')).status()).toBe(200)

  const csrfResponse = await page.request.get('/api/auth/csrf')
  const csrfToken = (await csrfResponse.json()).csrfToken as string
  const blocked = await page.request.post('/api/auth/logout', {
    headers: { origin: 'http://attacker.example', 'x-csrf-token': csrfToken },
  })
  expect(blocked.status()).toBe(403)
  expect((await page.request.get('/api/account/me')).status()).toBe(200)

  const logout = await page.request.post('/api/auth/logout', {
    headers: { origin: 'http://127.0.0.1:3301', 'x-csrf-token': csrfToken },
  })
  expect(logout.status()).toBe(200)
  const oldCookieHeader = oldCookies.map(({ name, value }) => `${name}=${value}`).join('; ')
  const stale = await page.request.get('/api/account/me', { headers: { cookie: oldCookieHeader } })
  expect(stale.status()).toBe(401)
})
