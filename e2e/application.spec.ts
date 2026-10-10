import { expect, test, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_CUSTODIAN, E2E_FORCED, E2E_VIEWER } from './global-setup'

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

test('Python auth enforces forced password change and invalidates the stale browser session', async ({ page }) => {
  const nextPassword = 'E2e-Forced-Password-Changed-2026!'
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Пользователь').fill(E2E_FORCED.username)
  await page.getByLabel('Пароль').fill(E2E_FORCED.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/account\/password/)

  const oldCookies = await page.context().cookies()
  const oldCookieHeader = oldCookies.map(({ name, value }) => `${name}=${value}`).join('; ')
  const blocked = await page.request.get('/api/users')
  expect(blocked.status()).toBe(403)
  expect(await blocked.json()).toMatchObject({ error: { code: 'PASSWORD_CHANGE_REQUIRED' } })

  await page.getByLabel('Текущий пароль').fill(E2E_FORCED.password)
  await page.getByLabel('Новый пароль').fill(nextPassword)
  const passwordResponse = page.waitForResponse('/api/account/password')
  await page.getByRole('button', { name: 'Изменить пароль' }).click()
  const passwordChange = await passwordResponse
  expect(passwordChange.status(), JSON.stringify(await passwordChange.json())).toBe(200)
  await expect(page).toHaveURL(/\/login\?passwordChanged=1/)

  const staleSession = await page.request.get('/api/users', {
    headers: { cookie: oldCookieHeader },
  })
  expect(staleSession.status()).toBe(401)

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Пользователь').fill(E2E_FORCED.username)
  await page.getByLabel('Пароль').fill(E2E_FORCED.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Неверный логин или пароль')).toBeVisible()

  await page.getByLabel('Пароль').fill(nextPassword)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/)
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

test('Stage 04 departments and catalogs use Python for admin CRUD and scoped MOL access', async ({ page }) => {
  await login(page)
  const suffix = Date.now().toString(36).toUpperCase()

  await page.goto('/admin/departments')
  await expect(page.getByRole('heading', { name: 'Подразделения', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Подразделение', exact: true }).click()
  await page.locator('#department-code').fill(`E2E-${suffix}`)
  await page.locator('#department-name').fill(`E2E подразделение ${suffix}`)
  const departmentCreate = page.waitForResponse((response) =>
    response.url().endsWith('/api/departments') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Сохранить' }).click()
  const createdDepartmentResponse = await departmentCreate
  const createdDepartmentBody = await createdDepartmentResponse.json()
  expect(createdDepartmentResponse.status(), JSON.stringify(createdDepartmentBody)).toBe(201)
  const department = createdDepartmentBody.data as { id: string; code: string; name: string }
  await expect(page.getByRole('row').filter({ hasText: department.code })).toContainText(department.name)

  const departmentRow = page.getByRole('row').filter({ hasText: department.code })
  await departmentRow.getByRole('button', { name: 'Редактировать' }).click()
  await page.locator('#department-name').fill(`E2E переименовано ${suffix}`)
  const departmentUpdate = page.waitForResponse((response) =>
    response.url().endsWith(`/api/departments/${department.id}`) && response.request().method() === 'PATCH',
  )
  await page.getByRole('button', { name: 'Сохранить' }).click()
  expect((await departmentUpdate).status()).toBe(200)
  await expect(page.getByRole('row').filter({ hasText: department.code })).toContainText(`E2E переименовано ${suffix}`)

  const duplicateDepartment = await page.request.post('/api/departments', {
    data: { code: department.code, name: 'E2E duplicate' },
  })
  expect(duplicateDepartment.status()).toBe(409)
  expect(await duplicateDepartment.json()).toMatchObject({ error: { code: 'CODE_EXISTS' } })

  await page.goto('/groups')
  await expect(page.getByRole('heading', { name: 'Группы имущества' })).toBeVisible()
  await page.getByRole('button', { name: 'Добавить группу' }).click()
  const groupCode = `E2E-${suffix}`
  await page.getByLabel('Код группы *').fill(groupCode)
  await page.getByLabel('Наименование *').fill(`E2E группа ${suffix}`)
  await page.getByRole('button', { name: 'Создать' }).click()
  const groupRow = page.getByRole('row').filter({ hasText: groupCode })
  await expect(groupRow).toContainText(`E2E группа ${suffix}`)
  await groupRow.getByRole('button').first().click()
  await page.getByLabel('Наименование *').fill(`E2E группа изменена ${suffix}`)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('row').filter({ hasText: groupCode })).toContainText(`E2E группа изменена ${suffix}`)
  const duplicateGroup = await page.request.post('/api/groups', {
    data: { code: groupCode, name: 'E2E duplicate' },
  })
  expect(duplicateGroup.status()).toBe(409)
  expect(await duplicateGroup.json()).toMatchObject({ error: { code: 'CODE_EXISTS' } })

  await page.goto('/mols')
  await expect(page.getByRole('heading', { name: /МОЛ \(Материально-ответственные лица\)/ })).toBeVisible()
  await page.getByRole('button', { name: 'Добавить МОЛ' }).click()
  const molCode = `E2E-${suffix}`
  await page.getByLabel('Код МОЛ *').fill(molCode)
  await page.getByLabel('ФИО *').fill(`E2E Иванов ${suffix}`)
  await page.getByLabel('Место хранения *').fill(`E2E кабинет ${suffix}`)
  await page.locator('#department').click()
  await page.getByRole('option', { name: 'QA (DEP-QA)' }).click()
  const molCreate = page.waitForResponse((response) =>
    response.url().endsWith('/api/mols') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Создать' }).click()
  const molCreateResponse = await molCreate
  expect(molCreateResponse.status()).toBe(201)
  const molsAfterCreate = (await (await page.request.get('/api/mols')).json()).data as Array<{
    id: string; code: string
  }>
  const mol = molsAfterCreate.find((item) => item.code === molCode)!
  const molRow = page.getByRole('row').filter({ hasText: mol.code })
  await expect(molRow).toContainText(`E2E Иванов ${suffix}`)
  await molRow.getByRole('button').first().click()
  await page.getByLabel('Место хранения *').fill(`E2E переехал ${suffix}`)
  const molUpdate = page.waitForResponse((response) =>
    response.url().endsWith(`/api/mols/${mol.id}`) && response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: 'Сохранить' }).click()
  expect((await molUpdate).status()).toBe(200)
  await expect(page.getByRole('row').filter({ hasText: mol.code })).toContainText(`E2E переехал ${suffix}`)
  const duplicateMol = await page.request.post('/api/mols', {
    data: {
      code: mol.code, fullName: 'E2E duplicate', storageLocation: 'E2E',
      departmentId: department.id, department: department.name,
    },
  })
  expect(duplicateMol.status()).toBe(409)
  expect(await duplicateMol.json()).toMatchObject({ error: { code: 'CODE_EXISTS' } })

  const knownMols = (await (await page.request.get('/api/mols')).json()).data as Array<{
    id: string; code: string; departmentId: string; department: string
  }>
  const qaMol = knownMols.find((item) => item.code === 'E2E-MOL-1')!
  const outsideMol = knownMols.find((item) => item.code === 'E2E-MOL-OUTSIDE')!
  const departments = (await (await page.request.get('/api/departments')).json()).data as Array<{
    id: string; code: string; name: string
  }>
  const qaDepartment = departments.find((item) => item.code === 'DEP-QA')!
  const scopedPage = await page.context().newPage()
  await login(scopedPage, E2E_CUSTODIAN)
  await scopedPage.goto('/mols')
  await expect(scopedPage.getByRole('heading', { name: /МОЛ \(Материально-ответственные лица\)/ })).toBeVisible()
  await expect(scopedPage.getByRole('cell', { name: 'E2E-MOL-1', exact: true })).toBeVisible()
  await expect(scopedPage.getByRole('cell', { name: 'E2E-MOL-OUTSIDE', exact: true })).toHaveCount(0)
  const scopedList = await scopedPage.request.get('/api/mols')
  expect(scopedList.status()).toBe(200)
  const scopedMols = (await scopedList.json()).data as Array<{ id: string; departmentId: string }>
  expect(scopedMols.map((item) => item.departmentId)).toContain(qaMol.departmentId)
  expect(scopedMols.some((item) => item.id === outsideMol.id)).toBe(false)
  const forbiddenRead = await scopedPage.request.get(`/api/mols/${outsideMol.id}`)
  expect(forbiddenRead.status()).toBe(403)
  expect(await forbiddenRead.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })

  const scopedCreate = await scopedPage.request.post('/api/mols', {
    data: {
      code: `E2E-SCOPED-${suffix}`, fullName: `E2E scoped ${suffix}`,
      storageLocation: 'QA', departmentId: qaMol.departmentId, department: qaMol.department,
    },
  })
  expect(scopedCreate.status()).toBe(201)
  const scopedMol = (await scopedCreate.json()).data as { id: string }
  const scopedUpdate = await scopedPage.request.put(`/api/mols/${scopedMol.id}`, {
    data: {
      code: `E2E-SCOPED-${suffix}`, fullName: `E2E scoped updated ${suffix}`,
      storageLocation: 'QA updated', departmentId: qaMol.departmentId, department: qaMol.department,
    },
  })
  expect(scopedUpdate.status()).toBe(200)
  expect(await scopedUpdate.json()).toMatchObject({ data: { fullName: `E2E scoped updated ${suffix}` } })
  const forbiddenCreate = await scopedPage.request.post('/api/mols', {
    data: {
      code: `E2E-FOREIGN-${suffix}`, fullName: 'E2E foreign', storageLocation: 'Outside',
      departmentId: outsideMol.departmentId, department: outsideMol.department,
    },
  })
  expect(forbiddenCreate.status()).toBe(403)
  expect(await forbiddenCreate.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
  await scopedPage.close()
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

test('timekeeping requires zero-hour confirmation and updates approval status', async ({ page }) => {
  await login(page)
  let sheetStatus = 'DRAFT'
  let submittedBody: Record<string, unknown> | null = null
  let decisionBody: Record<string, unknown> | null = null
  const employee = {
    id: 'employee-timesheet-e2e',
    code: 'E2E-TS-1',
    fullName: 'E2E сотрудник',
    department: 'QA',
    departmentId: 'department-timesheet-e2e',
  }

  await page.route((url) => url.pathname === '/api/time-entries', async (route) => {
    await route.fulfill({ json: { data: {
      year: 2099,
      month: 1,
      normativeHours: 160,
      entries: [],
      summaries: [],
      employees: [employee],
      projects: [],
      period: { status: 'OPEN' },
      timesheets: [{
        id: sheetStatus === 'DRAFT' ? 'draft:employee-timesheet-e2e:2099:1' : 'timesheet-e2e-1',
        employeeId: employee.id,
        year: 2099,
        month: 1,
        status: sheetStatus,
        zeroHoursConfirmed: sheetStatus !== 'DRAFT',
        employee,
        submittedBy: sheetStatus === 'DRAFT' ? null : { id: 'admin-e2e', name: 'E2E Admin' },
        decidedBy: sheetStatus === 'APPROVED' ? { id: 'admin-e2e', name: 'E2E Admin' } : null,
        decisionReason: null,
      }],
    } } })
  })
  await page.route('**/api/timekeeping/timesheets', async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>
    sheetStatus = 'SUBMITTED'
    await route.fulfill({ status: 201, json: { data: { id: 'timesheet-e2e-1', status: sheetStatus } } })
  })
  await page.route('**/api/timekeeping/timesheets/timesheet-e2e-1/decision', async (route) => {
    decisionBody = route.request().postDataJSON() as Record<string, unknown>
    sheetStatus = 'APPROVED'
    await route.fulfill({ json: { data: { id: 'timesheet-e2e-1', status: sheetStatus } } })
  })

  await page.goto('/timekeeping')
  await expect(page.getByRole('heading', { name: 'Согласование табелей' })).toBeVisible()
  const monthReload = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/time-entries' &&
      url.searchParams.get('year') === '2099' && url.searchParams.get('month') === '1'
  })
  await page.getByLabel('Месяц').fill('2099-01')
  await monthReload
  await expect(page.getByRole('button', { name: 'Отправить' })).toBeDisabled()
  await page.getByLabel('Подтверждаю нулевые часы').check()
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect.poll(() => submittedBody).toMatchObject({
    employeeId: employee.id,
    year: 2099,
    month: 1,
    zeroHoursConfirmed: true,
  })
  await expect(page.getByText('На согласовании')).toBeVisible()
  await page.getByRole('button', { name: 'Утвердить' }).click()
  await expect.poll(() => decisionBody).toMatchObject({ decision: 'APPROVE' })
  await expect(page.getByText('Утверждён')).toBeVisible()
})
