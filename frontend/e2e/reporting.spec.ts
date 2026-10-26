import { expect, test } from '@playwright/test'
import { E2E_ADMIN } from './global-setup'

test('Reporting dashboard, reports, global search and scoped binary export', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Пользователь').fill(E2E_ADMIN.username)
  await page.getByLabel('Пароль').fill(E2E_ADMIN.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })

  await expect(page.getByRole('heading', { name: 'Рабочий обзор' })).toBeVisible()
  await page.getByRole('button', { name: 'Открыть поиск' }).click()
  const searchResponse = page.waitForResponse((response) =>
    response.url().includes('/api/search?q=E2E%20Scoped%20Employee'),
  )
  await page.getByRole('combobox', { name: 'Поиск по системе' }).fill('E2E Scoped Employee')
  expect((await searchResponse).status()).toBe(200)
  await expect(page.getByRole('option', { name: /E2E Scoped Employee/ })).toBeVisible()

  await page.goto('/reports')
  await expect(page.getByRole('heading', { name: 'Отчётность и аналитика' })).toBeVisible()
  const turnoverResponse = page.waitForResponse((response) =>
    response.url().includes('/api/reports/turnover?'),
  )
  await page.getByRole('tab', { name: 'Текучесть кадров' }).click()
  expect((await turnoverResponse).status()).toBe(200)

  for (const [tab, endpoint] of [
    ['Рентабельность проектов', '/api/reports/profitability?'],
    ['Амортизация и ОС', '/api/reports/depreciation?'],
    ['Календарь отпусков', '/api/reports/vacations?'],
  ]) {
    const reportResponse = page.waitForResponse((response) => response.url().includes(endpoint))
    await page.getByRole('tab', { name: tab }).click()
    expect((await reportResponse).status()).toBe(200)
  }

  const customRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/reports/custom') customRequests.push(request.postData() || '')
  })
  const customResponse = page.waitForResponse((response) => response.url().endsWith('/api/reports/custom'))
  await page.getByRole('tab', { name: 'Конструктор', exact: true }).click()
  expect((await customResponse).status()).toBe(200)
  const buildReport = page.getByRole('button', { name: 'Сформировать отчет' })
  await expect(buildReport).toBeEnabled()
  expect(customRequests).toHaveLength(1)
  await page.getByRole('checkbox', { name: 'Численность штата' }).uncheck()
  await page.waitForLoadState('networkidle')
  expect(customRequests).toHaveLength(1)
  const rebuiltResponse = page.waitForResponse((response) => response.url().endsWith('/api/reports/custom'))
  await buildReport.click()
  expect((await rebuiltResponse).status()).toBe(200)
  expect(JSON.parse(customRequests[1]).preset.metrics).toEqual(['occupiedRate'])

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Скачать Excel' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/)

  const pdf = await page.request.get(
    '/api/reports/export?dateFrom=2026-01-01&dateTo=2026-12-31&format=pdf',
  )
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
  expect(pdf.headers()['content-disposition']).toMatch(/\.pdf/)
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')
})
