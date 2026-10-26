import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { E2E_ADMIN, E2E_EMPLOYEE, E2E_HR } from './global-setup'
import { authenticatedPost, authenticatedPut } from './authenticated-request'
import { seedApprovedZeroHoursForOtherEmployees } from './payroll-fixtures'

async function signedInUser(
  browser: Browser,
  credentials: { username: string; password: string } = E2E_ADMIN,
) {
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

async function signedInEmployee(browser: Browser) {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
  })
  const page = await context.newPage()
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Пользователь').fill(E2E_EMPLOYEE.username)
  await page.getByLabel('Пароль').fill(E2E_EMPLOYEE.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  return { context, page }
}

async function unusedPayrollPeriod() {
  const prisma = new PrismaClient()
  try {
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { code: 'E2E-EMPLOYEE-SCOPE' },
      select: { id: true },
    })
    const [timesheets, entries, periods] = await Promise.all([
      prisma.timesheet.findMany({ select: { year: true, month: true } }),
      prisma.timeEntry.findMany({ select: { workDate: true } }),
      prisma.payrollPeriod.findMany({ select: { year: true, month: true } }),
    ])
    const used = new Set([
      ...timesheets.map(({ year, month }) => `${year}-${month}`),
      ...entries.map(({ workDate }) => `${workDate.getUTCFullYear()}-${workDate.getUTCMonth() + 1}`),
      ...periods.map(({ year, month }) => `${year}-${month}`),
    ])
    const available: Array<{ year: number; month: number }> = []
    for (let year = 2000; year <= 2100; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        if (!used.has(`${year}-${month}`)) available.push({ year, month })
      }
    }
    if (!available.length) throw new Error('No unused payroll period remains for the Payroll E2E employee')
    const selected = available[Math.floor(Math.random() * available.length)]!
    await seedApprovedZeroHoursForOtherEmployees(prisma, selected.year, selected.month, employee.id)
    return selected
  } finally {
    await prisma.$disconnect()
  }
}

async function expectXlsxDownload(
  page: Page,
  linkName: string,
  expectedFilename: string,
  scope?: Locator,
) {
  const downloadReady = page.waitForEvent('download')
  await (scope ?? page).getByRole('link', { name: linkName }).click()
  const download = await downloadReady
  expect(download.suggestedFilename()).toBe(expectedFilename)
  const path = await download.path()
  expect(path).toBeTruthy()
  const content = await readFile(path!)
  expect(content.subarray(0, 2).toString()).toBe('PK')
  expect(content.byteLength).toBeGreaterThan(1000)
}

test('Payroll timekeeping approval, payroll close, denied edit, and reopen', async ({ browser }) => {
  test.setTimeout(45_000)
  const admin = await signedInUser(browser)
  const { year, month } = await unusedPayrollPeriod()
  const monthValue = `${year}-${String(month).padStart(2, '0')}`
  const workDate = `${monthValue}-05`
  const initialLoad = admin.page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/time-entries' && response.request().method() === 'GET'
  })

  await admin.page.goto('/timekeeping')
  await initialLoad
  const timekeepingLoad = admin.page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/time-entries' &&
      url.searchParams.get('year') === String(year) &&
      url.searchParams.get('month') === String(month)
  })
  await admin.page.getByLabel('Месяц').fill(monthValue)
  const timekeepingResponse = await timekeepingLoad
  const timekeepingPayload = await timekeepingResponse.json()
  const employee = (timekeepingPayload.data.employees as Array<{
    id: string
    fullName: string
    code: string
  }>).find((item) => item.code === 'E2E-EMPLOYEE-SCOPE')
  expect(employee, 'global setup employee must be visible to the E2E admin').toBeTruthy()

  await admin.page.getByRole('button', { name: 'Добавить' }).click()
  const entryDialog = admin.page.getByRole('dialog')
  await entryDialog.locator('#time-employee').selectOption(employee!.id)
  await entryDialog.locator('#time-date').fill(workDate)
  await entryDialog.locator('#time-hours').fill('8')
  await entryDialog.locator('#time-type').selectOption('REGULAR')
  const entryCreated = admin.page.waitForResponse((response) =>
    response.url().endsWith('/api/time-entries') && response.request().method() === 'POST',
  )
  await entryDialog.getByRole('button', { name: 'Сохранить' }).click()
  const entryResponse = await entryCreated
  expect(entryResponse.status()).toBe(201)
  const entry = (await entryResponse.json()).data as { id: string; hours: number }
  expect(entry.hours).toBe(8)

  const employeeSession = await signedInEmployee(browser)
  const employeeInitialLoad = employeeSession.page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/time-entries' && response.request().method() === 'GET'
  })
  await employeeSession.page.goto('/timekeeping')
  await employeeInitialLoad
  const employeeMonthLoad = employeeSession.page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/time-entries' &&
      url.searchParams.get('year') === String(year) &&
      url.searchParams.get('month') === String(month)
  })
  await employeeSession.page.getByLabel('Месяц').fill(monthValue)
  await employeeMonthLoad
  const employeeCard = employeeSession.page.locator('div.rounded-md.border.p-3').filter({ hasText: employee!.fullName })
  const submittedEmployee = employeeSession.page.waitForResponse((response) =>
    response.url().endsWith('/api/timekeeping/timesheets') && response.request().method() === 'POST',
  )
  await employeeCard.getByRole('button', { name: 'Отправить' }).click()
  const submittedResponse = await submittedEmployee
  expect(submittedResponse.status()).toBe(201)
  const submittedTimesheet = (await submittedResponse.json()).data as { id: string }
  await employeeSession.context.close()
  await admin.page.reload()
  const adminMonthLoad = admin.page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/time-entries' &&
      url.searchParams.get('year') === String(year) &&
      url.searchParams.get('month') === String(month)
  })
  await admin.page.getByLabel('Месяц').fill(monthValue)
  await adminMonthLoad
  const reviewerEmployeeCard = admin.page.locator('div.rounded-md.border.p-3').filter({ hasText: employee!.fullName })
  await expect(reviewerEmployeeCard.getByText('На согласовании')).toBeVisible()

  const reviewer = await signedInUser(browser, E2E_HR)
  const approved = await authenticatedPost(reviewer.page,
    `/api/timekeeping/timesheets/${submittedTimesheet.id}/decision`,
    { data: { decision: 'APPROVE', reason: 'Payroll E2E assigned reviewer approval' } },
  )
  expect(approved.ok(), await approved.text()).toBeTruthy()
  await reviewer.context.close()
  await admin.page.reload()
  await admin.page.waitForLoadState('networkidle')
  const approvedMonthLoad = admin.page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/time-entries' &&
      url.searchParams.get('year') === String(year) &&
      url.searchParams.get('month') === String(month)
  })
  await admin.page.getByLabel('Месяц').fill(monthValue)
  await approvedMonthLoad
  const approvedEmployeeCard = admin.page.locator('div.rounded-md.border.p-3').filter({ hasText: employee!.fullName })
  await expect(approvedEmployeeCard.getByText('Утверждён')).toBeVisible()

  await admin.page.goto('/finance/payroll')
  await admin.page.waitForLoadState('networkidle')
  const payrollLoad = admin.page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/payroll' &&
      url.searchParams.get('year') === String(year) &&
      url.searchParams.get('month') === String(month)
  })
  await admin.page.getByLabel('Месяц').fill(monthValue)
  const payrollResponse = await payrollLoad
  expect(payrollResponse.ok()).toBeTruthy()
  const payroll = (await payrollResponse.json()).data
  const payrollRow = payroll.rows.find((row: { employeeId: string }) => row.employeeId === employee!.id)
  expect(payrollRow).toMatchObject({ actualBase: 100000, gross: 100000, tax: 13000, payable: 87000 })
  await expect(admin.page.getByText(employee!.fullName, { exact: true })).toBeVisible()

  await expectXlsxDownload(admin.page, 'Excel', `payroll-${year}-${String(month).padStart(2, '0')}.xlsx`)
  const employeeRow = admin.page.locator('tr').filter({ hasText: employee!.fullName })
  await expect(employeeRow).toHaveCount(1)
  await expectXlsxDownload(
    admin.page,
    'Скачать расчетный лист',
    `payslip-${employee!.code}-${year}-${String(month).padStart(2, '0')}.xlsx`,
    employeeRow,
  )

  const closed = admin.page.waitForResponse((response) =>
    response.url().endsWith('/api/payroll/period') && response.request().method() === 'PUT',
  )
  await admin.page.getByRole('button', { name: 'Закрыть месяц' }).click()
  const closedResponse = await closed
  expect(closedResponse.ok()).toBeTruthy()
  const apiResponse = await authenticatedPut(admin.page, '/api/payroll/period', {
    data: { year, month, status: 'CLOSED' },
    timeout: 5_000,
  })
  expect(apiResponse.ok()).toBeTruthy()
  const apiBody = await apiResponse.json()
  expect(apiBody.data).toMatchObject({ year, month, status: 'CLOSED' })
  await expect(admin.page.getByText('Месяц закрыт')).toBeVisible()

  const deniedEdit = await authenticatedPut(admin.page, `/api/time-entries/${entry.id}`, { data: { hours: 9 } })
  expect(deniedEdit.status()).toBe(409)
  expect((await deniedEdit.json()).error.code).toBe('PERIOD_CLOSED')
  const unchanged = await admin.page.request.get(`/api/time-entries?year=${year}&month=${month}`)
  const unchangedEntries = (await unchanged.json()).data.entries as Array<{ id: string; hours: number }>
  expect(unchangedEntries.find((item) => item.id === entry.id)?.hours).toBe(8)

  admin.page.once('dialog', (dialog) => dialog.accept('Payroll E2E повторное открытие'))
  const reopened = admin.page.waitForResponse((response) =>
    response.url().endsWith('/api/payroll/period') && response.request().method() === 'PUT',
  )
  await admin.page.getByRole('button', { name: 'Открыть месяц' }).click()
  expect((await reopened).ok()).toBeTruthy()
  await expect(admin.page.getByText('Месяц открыт')).toBeVisible()
  await admin.context.close()
})
