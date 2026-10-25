import { expect, test, type Browser, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_HR } from './global-setup'
import { authenticatedPost } from './authenticated-request'

async function signedInPage(browser: Browser, credentials: typeof E2E_ADMIN) {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
  })
  const page = await context.newPage()
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Пользователь').fill(credentials.username)
  await page.getByLabel('Пароль').fill(credentials.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  return { context, page }
}

async function createApproval(page: Page, title: string, approvers: [string, string]) {
  const response = await authenticatedPost(page, '/api/approvals', {
    data: {
      title,
      description: 'Сценарий Stage09 E2E',
      steps: [
        { approverId: approvers[0], name: 'Первый этап' },
        { approverId: approvers[1], name: 'Второй этап' },
      ],
    },
  })
  const payload = await response.json()
  expect(response.status(), JSON.stringify(payload)).toBe(201)
  return payload.data as { id: string }
}

async function notifications(page: Page) {
  const response = await page.request.get('/api/notifications?page=1&pageSize=100')
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data as Array<{
    eventType: string
    title: string
    body: string
    readAt: string | null
  }>
}

test('Stage 09 approval transitions, notification ownership and cancellation', async ({ browser }) => {
  const admin = await signedInPage(browser, E2E_ADMIN)
  const suffix = Date.now().toString(36)
  const title = `S09 workflow ${suffix}`
  const cancelledTitle = `S09 cancelled ${suffix}`
  const optionsResponse = await admin.page.request.get('/api/approvals/options')
  expect(optionsResponse.ok()).toBeTruthy()
  const options = (await optionsResponse.json()).data as Array<{ id: string; username: string }>
  const hrId = options.find((item) => item.username === E2E_HR.username)?.id
  const secondApproverId = options.find((item) => item.username === E2E_ADMIN.username)?.id
  expect(hrId).toBeTruthy()
  expect(secondApproverId).toBeTruthy()
  const ids: [string, string] = [hrId!, secondApproverId!]
  const approval = await createApproval(admin.page, title, ids)

  const hr = await signedInPage(browser, E2E_HR)
  await expect.poll(async () => (await notifications(hr.page)).some((item) =>
    item.eventType === 'APPROVAL_REQUESTED' && item.body === title,
  )).toBeTruthy()
  await hr.page.goto(`/approvals/${approval.id}`)
  await expect(hr.page.getByRole('heading', { name: title })).toBeVisible()
  await hr.page.getByRole('button', { name: 'Согласовать' }).click()
  await expect(hr.page.getByText('Согласование сохранено')).toHaveCount(0)

  await expect.poll(async () => (await notifications(admin.page)).some((item) =>
    item.eventType === 'APPROVAL_REQUESTED' && item.body === title,
  )).toBeTruthy()
  await admin.page.goto(`/approvals/${approval.id}`)
  await expect(admin.page.getByRole('heading', { name: title })).toBeVisible()
  admin.page.once('dialog', (dialog) => dialog.accept('Нужны исправления'))
  await admin.page.getByRole('button', { name: 'Отклонить' }).click()
  await expect.poll(async () => (await admin.page.request.get(`/api/approvals/${approval.id}`)).json()).toMatchObject({
    data: { status: 'REJECTED', currentStep: 2 },
  })
  await expect.poll(async () => (await notifications(admin.page)).some((item) =>
    item.eventType === 'APPROVAL_DECIDED' && item.body === title,
  )).toBeTruthy()

  const cancelled = await createApproval(admin.page, cancelledTitle, ids)
  await admin.page.goto('/approvals')
  const card = admin.page.locator('div.rounded-lg.border').filter({
    has: admin.page.getByRole('heading', { name: cancelledTitle }),
  })
  await card.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => (await admin.page.request.get(`/api/approvals/${cancelled.id}`)).json()).toMatchObject({
    data: { status: 'CANCELLED' },
  })

  await Promise.all([admin.context.close(), hr.context.close()])
})
