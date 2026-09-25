import { expect, test, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_VIEWER } from './global-setup'

async function login(page: Page, credentials = E2E_ADMIN) {
  await page.goto('/login')
  // SessionProvider can issue overlapping requests that rotate the CSRF cookie.
  // Submit credentials only after those initial requests have settled.
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Пользователь').fill(credentials.username)
  await page.getByLabel('Пароль').fill(credentials.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
}

test('unauthenticated API is rejected and viewer cannot mutate', async ({ request, page }) => {
  const response = await request.get('/api/assets')
  expect(response.status()).toBe(401)
  expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
  await login(page, E2E_VIEWER)
  await expect(page.getByRole('heading', { name: 'Имущество' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить' })).toHaveCount(0)
  const forbidden = await page.request.post('/api/assets', {
    data: {},
  })
  expect(forbidden.status()).toBe(403)
})

test('admin creates, partially transfers and archives an asset', async ({ page }) => {
  await login(page)
  const [molsResponse, groupsResponse] = await Promise.all([
    page.request.get('/api/mols'),
    page.request.get('/api/groups'),
  ])
  const mols = (await molsResponse.json()).data as { id: string; code: string }[]
  const groups = (await groupsResponse.json()).data as { id: string; code: string }[]
  const fromMol = mols.find((mol) => mol.code === 'E2E-MOL-1')!
  const toMol = mols.find((mol) => mol.code === 'E2E-MOL-2')!
  const group = groups.find((item) => item.code === 'E2E')!
  const inventoryNumber = `E2E-${Date.now()}`

  const createdResponse = await page.request.post('/api/assets', {
    data: {
      name: 'E2E тестовый объект', inventoryNumber, unitPrice: '10.25', unitOfMeasure: 'шт',
      quantity: '10', molId: fromMol.id, groupId: group.id, recordingDate: '2026-07-16',
      documentType: 'E2E документ', documentDetails: 'E2E-1', documentFiles: [], photos: [],
      isExistingAsset: false, status: 'IN_STOCK', accountingForm: '145',
    },
  })
  const createdBody = await createdResponse.json()
  expect(createdResponse.status(), JSON.stringify(createdBody)).toBe(201)
  const created = createdBody.data as { id: string }

  const transferResponse = await page.request.post(`/api/assets/${created.id}/transfers`, {
    data: {
      fromMolId: fromMol.id, toMolId: toMol.id, quantity: '4', date: new Date().toISOString(),
      reason: 'E2E частичная передача', documentType: 'Акт', documentDetails: 'E2E-2', documentFiles: [],
    },
  })
  expect(transferResponse.status()).toBe(201)
  const transferred = (await transferResponse.json()).data as { holdings: { molId: string; quantity: string }[] }
  expect(transferred.holdings).toEqual(expect.arrayContaining([
    expect.objectContaining({ molId: fromMol.id, quantity: '6' }),
    expect.objectContaining({ molId: toMol.id, quantity: '4' }),
  ]))

  const archiveResponse = await page.request.post(`/api/assets/${created.id}/archive`, {
    data: { reason: 'E2E завершение сценария' },
  })
  expect(archiveResponse.ok()).toBeTruthy()
  await page.goto(`/archive?search=${inventoryNumber}`)
  await expect(page.locator('td:visible').filter({ hasText: inventoryNumber })).toBeVisible()
})

test('employee and finance sections render after login', async ({ page }) => {
  await login(page)
  await page.goto('/employees')
  await expect(page.getByRole('main').getByRole('heading', { name: 'Сотрудники', exact: true, level: 1 })).toBeVisible()
  await page.goto('/finance/oklad')
  await expect(page.getByRole('main').getByRole('heading', { name: 'Оклад', exact: true, level: 1 })).toBeVisible()
})

test('procurement uses URL filters, 25-row pages, full-result metrics and direct approval links', async ({ page }) => {
  const requestedPages: string[] = []
  await login(page)
  for (const status of ['SUBMITTED', 'APPROVED']) {
    const response = await page.request.get(`/api/procurement?page=1&pageSize=25&status=${status}`)
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({
      pagination: { page: 1, pageSize: 25 },
      summary: { active: expect.any(Number), awaiting: expect.any(Number), overdue: expect.any(Number), budget: expect.any(Number) },
    })
  }
  await page.route('**/api/procurement/options', async (route) => {
    await route.fulfill({ json: { data: { projects: [], suppliers: [], approvers: [], groups: [], mols: [], documents: [] } } })
  })
  await page.route(/\/api\/procurement\?/, async (route) => {
    const query = new URL(route.request().url()).searchParams
    requestedPages.push(query.toString())
    const currentPage = Number(query.get('page'))
    const data = Array.from({ length: 25 }, (_, index) => ({
      id: `procurement-${currentPage}-${index}`,
      number: `ЗК-${String((currentPage - 1) * 25 + index + 1).padStart(3, '0')}`,
      title: `Закупка ${index + 1}`,
      description: null,
      status: 'APPROVED',
      budgetLimit: 120_000,
      totalPlanned: 100_000,
      neededBy: '2026-10-20T00:00:00.000Z',
      project: null,
      document: null,
      approvalRequest: { id: 'approval-e2e', status: 'APPROVED', currentStep: 1 },
      requestedBy: { id: 'requester-e2e', name: 'Инициатор' },
      items: [], contract: null, deliveries: [],
    }))
    await route.fulfill({ json: {
      data,
      pagination: { page: currentPage, pageSize: 25, total: 110, totalPages: 5 },
      summary: { active: 73, awaiting: 12, overdue: 4, budget: 13_200_000 },
    } })
  })

  await page.goto('/procurement?page=4&search=E2E&status=APPROVED')
  await expect(page.getByRole('heading', { name: 'Закупки' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Подробнее' })).toHaveCount(25)
  await expect(page.getByText('Страница 4 из 5 · всего 110')).toBeVisible()
  await expect(page.getByText('73', { exact: true })).toBeVisible()
  await expect(page.getByText(/13[\s\u00a0]?200[\s\u00a0]?000/)).toBeVisible()
  expect(requestedPages[0]).toContain('page=4')
  expect(requestedPages[0]).toContain('pageSize=25')
  expect(requestedPages[0]).toContain('search=E2E')
  expect(requestedPages[0]).toContain('status=APPROVED')

  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page).toHaveURL(/page=5/)
  await expect(page.getByText('ЗК-101 · Закупка 1')).toBeVisible()
  await page.getByRole('button', { name: 'Подробнее' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Согласование' })).toHaveAttribute('href', '/approvals/approval-e2e')
  expect(requestedPages.at(-1)).toContain('page=5')
  expect(requestedPages.at(-1)).toContain('status=APPROVED')
})
