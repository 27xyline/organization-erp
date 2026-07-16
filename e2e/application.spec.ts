import { expect, test, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_VIEWER } from './global-setup'

async function login(page: Page, credentials = E2E_ADMIN) {
  await page.goto('/login')
  await page.getByLabel('Пользователь').fill(credentials.username)
  await page.getByLabel('Пароль').fill(credentials.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/)
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
