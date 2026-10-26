import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_CUSTODIAN, E2E_EMPLOYEE, E2E_HR } from './global-setup'
import { authenticatedPost, authenticatedPut } from './authenticated-request'
import { seedApprovedZeroHoursForOtherEmployees } from './payroll-fixtures'
import { resolveE2EDocumentStorageRoot } from '../src/lib/e2e-storage'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3301'
const statePath = path.join(resolveE2EDocumentStorageRoot(undefined), '..', 'flow-state.json')

type FlowState = {
  projectId: string
  taskId: string
  procurementId: string
  documentId: string
  procurementDocumentId: string
  inventoryNumber: string
  documentSha256: string
  year: number
  month: number
  timesheetId: string
  timeEntryId: string
}

async function unusedPayrollPeriod(employeeId: string) {
  const prisma = new PrismaClient()
  try {
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
    if (!available.length) throw new Error('No unused payroll period remains for the Full flow fixture')
    const selected = available[Math.floor(Math.random() * available.length)]!
    await seedApprovedZeroHoursForOtherEmployees(prisma, selected.year, selected.month, employeeId)
    return selected
  } finally {
    await prisma.$disconnect()
  }
}

async function signIn(browser: Browser, credentials: typeof E2E_ADMIN) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Пользователь').fill(credentials.username)
  await page.getByLabel('Пароль').fill(credentials.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  return { context, page }
}

async function post(page: Page, url: string, data: unknown) {
  const response = await authenticatedPost(page, url, { data })
  const payload = await response.json()
  expect(response.status(), `${url}: ${JSON.stringify(payload)}`).toBeLessThan(300)
  return payload.data
}

test('Full flow procurement-to-asset document flow and scoped permissions', async ({ browser }) => {
  test.skip(process.env.E2E_VERIFY_ONLY === '1', 'write phase already ran before container restart')
  test.setTimeout(90_000)
  const admin = await signIn(browser, E2E_ADMIN)
  const hr = await signIn(browser, E2E_HR)
  const custodian = await signIn(browser, E2E_CUSTODIAN)
  const employeeSession = await signIn(browser, E2E_EMPLOYEE)
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const title = `Full flow synthetic procurement ${suffix}`
  const documentBytes = Buffer.from(`full-flow synthetic acceptance ${suffix}\n`)
  const documentSha = createHash('sha256').update(documentBytes).digest('hex')

  try {
    const optionsResponse = await admin.page.request.get('/api/procurement/options')
    expect(optionsResponse.ok()).toBeTruthy()
    const options = (await optionsResponse.json()).data as {
      groups?: Array<{ id: string }>
      mols?: Array<{ id: string; fullName?: string }>
    }
    const groupId = options.groups?.[0]?.id
    const molId = options.mols?.find((item) => item.fullName?.includes('E2E'))?.id ?? options.mols?.[0]?.id
    expect(groupId, 'disposable fixture must expose an asset group').toBeTruthy()
    expect(molId, 'disposable fixture must expose a scoped MOL').toBeTruthy()

    const documentMetadata = Buffer.from(JSON.stringify({
      title: `Full flow document ${suffix}`,
      filename: `full-flow-${suffix}.pdf`,
      category: 'CONTRACT',
    })).toString('base64url')
    const documentResponse = await authenticatedPost(admin.page, '/api/documents', {
      headers: {
        'content-type': 'application/pdf',
        'x-document-metadata': documentMetadata,
      },
      data: documentBytes,
    })
    expect(documentResponse.status()).toBe(201)
    const document = (await documentResponse.json()).data as { id: string }

    const employee = await getEmployeeId(employeeSession.page)
    const period = await unusedPayrollPeriod(employee)
    const workDate = `${period.year}-${String(period.month).padStart(2, '0')}-05`
    const periodStart = `${period.year}-${String(period.month).padStart(2, '0')}-01`
    const periodEnd = new Date(Date.UTC(period.year, period.month, 0)).toISOString().slice(0, 10)
    const project = await post(admin.page, '/api/projects', {
      code: `S14C-${suffix}`,
      name: `Full flow project ${suffix}`,
      description: 'Disposable full-flow project',
      startDate: periodStart,
      endDate: periodEnd,
      status: 'ACTIVE',
      plannedBudget: 1000,
      actualBudget: 0,
    }) as { id: string }
    await post(admin.page, `/api/projects/${project.id}/members`, { employeeId: employee })
    const task = await post(admin.page, `/api/projects/${project.id}/tasks`, {
      name: `Full flow task ${suffix}`,
      employeeIds: [employee],
      startDate: workDate,
      endDate: `${period.year}-${String(period.month).padStart(2, '0')}-25`,
    }) as { id: string }

    const timeEntry = await post(admin.page, '/api/time-entries', {
      employeeId: employee,
      projectId: project.id,
      taskId: task.id,
      workDate,
      type: 'REGULAR',
      hours: 8,
      note: 'Full flow project task delivery',
    }) as { id: string }
    const submittedTimesheet = await post(employeeSession.page, '/api/timekeeping/timesheets', {
      employeeId: employee,
      year: period.year,
      month: period.month,
    }) as { id: string }
    await post(hr.page, `/api/timekeeping/timesheets/${submittedTimesheet.id}/decision`, {
      decision: 'APPROVE',
      reason: 'Full flow scoped HR approval',
    })

    const supplier = await post(admin.page, '/api/procurement/suppliers', {
      name: `Full flow supplier ${suffix}`,
    }) as { id: string }
    const request = await post(admin.page, '/api/procurement', {
      number: `S14C-${suffix}`,
      title,
      description: 'Изолированная сквозная проверка Full flow',
      budgetLimit: 1000,
      projectId: project.id,
      documentId: document.id,
      items: [{ name: `Synthetic asset ${suffix}`, quantity: 1, unit: 'шт.', unitPrice: 500, groupId }],
    }) as { id: string; items: Array<{ id: string }> }
    const approval = await post(admin.page, `/api/procurement/${request.id}/submit`, {
      steps: [{ name: 'Согласование Full flow', approverId: (await getActorId(hr.page)) }],
    }) as { approvalRequestId: string }
    const decision = await post(hr.page, `/api/approvals/${approval.approvalRequestId}/decision`, {
      decision: 'APPROVE', comment: 'Full flow synthetic approval',
    })
    expect(decision).toBeTruthy()
    await post(admin.page, `/api/procurement/${request.id}/contract`, {
      supplierId: supplier.id,
      number: `C-${suffix}`,
      amount: 500,
      signedAt: '2026-10-24',
      deliveryDueAt: '2026-10-25',
      documentId: document.id,
    })
    const delivery = await post(admin.page, `/api/procurement/${request.id}/deliveries`, {
      number: `D-${suffix}`,
      receivedAt: '2026-10-24',
      documentId: document.id,
      items: [{ procurementItemId: request.items[0]!.id, quantity: 1 }],
    }) as {
      id: string
      deliveries: Array<{ id: string; items: Array<{ id: string; assetId: string | null }> }>
    }
    expect(delivery.deliveries).toHaveLength(1)
    expect(delivery.deliveries[0]!.items).toHaveLength(1)
    const deliveryItem = delivery.deliveries[0]!.items[0]!
    expect(deliveryItem.id).toBeTruthy()
    expect(deliveryItem.assetId).toBeNull()
    const capitalized = await post(
      admin.page,
      `/api/procurement/delivery-items/${deliveryItem.id}/capitalize`,
      {
      inventoryNumber: `S14C-A-${suffix}`,
      molId,
      groupId,
      accountingForm: '145',
      },
    ) as { id: string }
    const assetDocumentMetadata = Buffer.from(JSON.stringify({
      title: `Full flow asset document ${suffix}`,
      filename: `full-flow-asset-${suffix}.pdf`,
      category: 'ASSET',
      assetId: capitalized.id,
    })).toString('base64url')
    const assetDocumentResponse = await authenticatedPost(admin.page, '/api/documents', {
      headers: {
        'content-type': 'application/pdf',
        'x-document-metadata': assetDocumentMetadata,
      },
      data: documentBytes,
    })
    expect(assetDocumentResponse.status()).toBe(201)
    const assetDocument = (await assetDocumentResponse.json()).data as { id: string; assetId: string }
    expect(assetDocument.assetId).toBe(capitalized.id)

    const downloaded = await admin.page.request.get(`/api/documents/${assetDocument.id}/download`)
    expect(downloaded.status()).toBe(200)
    expect(downloaded.headers().etag).toBe(`"sha256-${documentSha}"`)
    expect(createHash('sha256').update(await downloaded.body()).digest('hex')).toBe(documentSha)
    expect(project.id).toBeTruthy()
    expect(task).toBeTruthy()

    const notifications = await hr.page.request.get('/api/notifications?page=1&pageSize=100')
    expect(notifications.ok()).toBeTruthy()
    const visibleNotifications = (await notifications.json()).data as Array<{ body: string }>
    expect(visibleNotifications.some((item) => item.body.includes(title))).toBeTruthy()

    const qaAssets = await custodian.page.request.get('/api/assets?page=1&pageSize=100')
    expect(qaAssets.ok()).toBeTruthy()
    const custodianPayload = (await qaAssets.json()).data as Array<{ inventoryNumber: string }>
    expect(custodianPayload.some((item) => item.inventoryNumber === `S14C-A-${suffix}`)).toBeTruthy()

    const outside = await admin.page.request.get('/api/departments')
    expect(outside.ok()).toBeTruthy()
    const outsideDepartment = ((await outside.json()).data as Array<{ id: string; name: string }>).find(
      (item) => item.name === 'E2E Outside Scope',
    )
    expect(outsideDepartment).toBeTruthy()
    const scopedDepartments = await custodian.page.request.get('/api/departments')
    expect(scopedDepartments.ok()).toBeTruthy()
    const scopedNames = ((await scopedDepartments.json()).data as Array<{ name: string }>).map((item) => item.name)
    expect(scopedNames).toContain('QA')
    expect(scopedNames).not.toContain('E2E Outside Scope')

    const payroll = await admin.page.request.get(
      `/api/payroll?year=${period.year}&month=${period.month}`,
    )
    expect(payroll.ok()).toBeTruthy()
    const payrollPayload = (await payroll.json()).data as {
      rows: Array<{ employeeId: string; actualBase: number }>
    }
    expect(payrollPayload.rows.find((row) => row.employeeId === employee)?.actualBase).toBeGreaterThan(0)
    const payrollExport = await admin.page.request.get(
      `/api/payroll/export?year=${period.year}&month=${period.month}`,
    )
    expect(payrollExport.ok()).toBeTruthy()
    expect((await payrollExport.body()).subarray(0, 2).toString()).toBe('PK')
    const closed = await authenticatedPut(admin.page, '/api/payroll/period', {
      data: {
        year: period.year,
        month: period.month,
        status: 'CLOSED',
        reason: 'Full flow rehearsal close',
      },
    })
    const closePayload = await closed.json()
    expect(closed.status(), JSON.stringify(closePayload)).toBe(200)
    expect(closePayload.data).toMatchObject({
      year: period.year,
      month: period.month,
      status: 'CLOSED',
    })

    const state: FlowState = {
      projectId: project.id,
      taskId: task.id,
      procurementId: request.id,
      documentId: assetDocument.id,
      procurementDocumentId: document.id,
      inventoryNumber: `S14C-A-${suffix}`,
      documentSha256: documentSha,
      year: period.year,
      month: period.month,
      timesheetId: submittedTimesheet.id,
      timeEntryId: timeEntry.id,
    }
    await mkdir(path.dirname(statePath), { recursive: true })
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  } finally {
    await Promise.all([
      admin.context.close(), hr.context.close(), custodian.context.close(), employeeSession.context.close(),
    ])
  }
})

test('Full flow persistence survives app/backend restart', async ({ browser }) => {
  test.skip(process.env.E2E_VERIFY_ONLY !== '1', 'runs only after restarting disposable app/backend')
  const admin = await signIn(browser, E2E_ADMIN)
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8')) as FlowState
    const [project, procurement, document, procurementDocument, download] = await Promise.all([
      admin.page.request.get(`/api/projects/${state.projectId}`),
      admin.page.request.get(`/api/procurement/${state.procurementId}`),
      admin.page.request.get(`/api/documents/${state.documentId}`),
      admin.page.request.get(`/api/documents/${state.procurementDocumentId}`),
      admin.page.request.get(`/api/documents/${state.documentId}/download`),
    ])
    for (const response of [project, procurement, document, procurementDocument, download]) {
      expect(response.status(), await response.text()).toBe(200)
    }
    const tasks = await admin.page.request.get(`/api/projects/${state.projectId}/tasks`)
    expect(tasks.ok()).toBeTruthy()
    expect(((await tasks.json()).data as Array<{ id: string }>).some((item) => item.id === state.taskId)).toBeTruthy()
    expect((await procurement.json()).data.status).toBe('CAPITALIZED')
    expect((await document.json()).data.id).toBe(state.documentId)
    expect((await document.json()).data.assetId).toBeTruthy()
    expect((await procurementDocument.json()).data.id).toBe(state.procurementDocumentId)
    expect(download.headers().etag).toBe(`"sha256-${state.documentSha256}"`)
    expect(createHash('sha256').update(await download.body()).digest('hex')).toBe(state.documentSha256)
    const payroll = await admin.page.request.get(`/api/payroll?year=${state.year}&month=${state.month}`)
    expect(payroll.ok()).toBeTruthy()
    expect((await payroll.json()).data.period.status).toBe('CLOSED')
    const timesheet = await admin.page.request.get(`/api/time-entries?year=${state.year}&month=${state.month}`)
    expect(timesheet.ok()).toBeTruthy()
    const entryPayload = (await timesheet.json()).data as {
      entries: Array<{ id: string; projectId: string; taskId: string }>
    }
    expect(entryPayload.entries.find((item) => item.id === state.timeEntryId)).toMatchObject({
      projectId: state.projectId,
      taskId: state.taskId,
    })
    const assets = await admin.page.request.get(`/api/assets?search=${encodeURIComponent(state.inventoryNumber)}`)
    expect(assets.ok()).toBeTruthy()
    const assetPayload = (await assets.json()).data as Array<{ inventoryNumber: string }>
    expect(assetPayload.some((item) => item.inventoryNumber === state.inventoryNumber)).toBeTruthy()
  } finally {
    await admin.context.close()
  }
})

async function getActorId(page: Page): Promise<string> {
  const response = await page.request.get('/api/account/me')
  expect(response.ok()).toBeTruthy()
  const payload = (await response.json()).data as { id: string }
  return payload.id
}

async function getEmployeeId(page: Page): Promise<string> {
  const response = await page.request.get('/api/account/me')
  expect(response.ok()).toBeTruthy()
  const payload = (await response.json()).data as { employeeId: string | null }
  expect(payload.employeeId).toBeTruthy()
  return payload.employeeId!
}
