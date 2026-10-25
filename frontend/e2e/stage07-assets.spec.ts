import { expect, test, type Browser } from '@playwright/test'
import { E2E_ADMIN, E2E_CUSTODIAN } from './global-setup'
import { authenticatedPost } from './authenticated-request'

async function openSignedInPage(browser: Browser, credentials = E2E_ADMIN) {
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

type MolReference = { id: string; code: string }
type AssetGroupReference = { id: string; code: string }
type AssetResponse = {
  id: string
  isArchived: boolean
  quantity: string
  holdings: Array<{ molId: string; quantity: string }>
}

test('Stage 07 UI transfers stock, inventories it, archives/restores it, and enforces asset scope', async ({ browser }) => {
  const { context: adminContext, page: admin } = await openSignedInPage(browser)
  const suffix = Date.now().toString(36).toUpperCase()
  const inventoryNumber = `E2E-S07-${suffix}`
  const [molsResponse, groupsResponse] = await Promise.all([
    admin.request.get('/api/mols'),
    admin.request.get('/api/groups'),
  ])
  expect(molsResponse.status()).toBe(200)
  expect(groupsResponse.status()).toBe(200)
  const mols = (await molsResponse.json()).data as MolReference[]
  const groups = (await groupsResponse.json()).data as AssetGroupReference[]
  const sourceMol = mols.find((mol) => mol.code === 'E2E-MOL-1')
  const destinationMol = mols.find((mol) => mol.code === 'E2E-MOL-2')
  const outsideMol = mols.find((mol) => mol.code === 'E2E-MOL-OUTSIDE')
  const group = groups.find((item) => item.code === 'E2E')
  expect(sourceMol && destinationMol && outsideMol && group, 'Stage 07 catalog fixtures should exist').toBeTruthy()

  const createdResponse = await authenticatedPost(admin, '/api/assets', {
    data: {
      name: `Stage07 UI ${suffix}`, inventoryNumber, unitPrice: '10.25', unitOfMeasure: 'шт',
      quantity: '10', molId: sourceMol!.id, groupId: group!.id, recordingDate: '2026-07-16',
      documentType: 'E2E документ', documentDetails: `E2E-${suffix}`, documentFiles: [], photos: [],
      isExistingAsset: false, status: 'IN_STOCK', accountingForm: '145',
    },
  })
  const createdBody = await createdResponse.json()
  expect(createdResponse.status(), JSON.stringify(createdBody)).toBe(201)
  const assetId = (createdBody.data as { id: string }).id

  await admin.goto(`/assets/${assetId}/transfer`)
  await expect(admin.getByRole('heading', { name: 'Передача объекта' })).toBeVisible()
  const quantity = admin.locator('#quantity')
  await expect(quantity).toHaveAttribute('max', '10')
  await expect(admin.getByText(/Максимум: 10/)).toBeVisible()
  const destinationSelect = admin.getByRole('combobox').nth(1)
  await destinationSelect.click()
  await admin.getByRole('option', { name: /E2E-MOL-2/ }).click()
  await quantity.fill('4')
  await admin.locator('#documentDetails').fill(`Stage07 transfer ${suffix}`)
  const transferResponseWait = admin.waitForResponse((response) =>
    response.url().endsWith(`/api/assets/${assetId}/transfers`) && response.request().method() === 'POST',
  )
  await admin.getByRole('button', { name: 'Выполнить передачу' }).click()
  const transferResponse = await transferResponseWait
  expect(transferResponse.status()).toBe(201)
  const afterTransfer = (await (await admin.request.get(`/api/assets/${assetId}`)).json()).data as AssetResponse
  expect(afterTransfer).toMatchObject({ quantity: '10', holdings: expect.arrayContaining([
    expect.objectContaining({ molId: sourceMol!.id, quantity: '6' }),
    expect.objectContaining({ molId: destinationMol!.id, quantity: '4' }),
  ]) })

  await admin.goto('/assets/inventory')
  await expect(admin.getByRole('heading', { name: 'Инвентаризация имущества' })).toBeVisible()
  await admin.getByRole('button', { name: 'Новая инвентаризация' }).click()
  const inventoryName = `Stage07 inventory ${suffix}`
  await admin.locator('#asset-inventory-name').fill(inventoryName)
  await admin.locator('#asset-inventory-mol').selectOption(destinationMol!.id)
  const createInventoryWait = admin.waitForResponse((response) =>
    response.url().endsWith('/api/assets/inventories') && response.request().method() === 'POST',
  )
  await admin.getByRole('button', { name: 'Создать ведомость' }).click()
  const inventoryResponse = await createInventoryWait
  expect(inventoryResponse.status()).toBe(201)
  const inventory = (await inventoryResponse.json()).data as { id: string }
  await expect(admin.getByRole('link', { name: new RegExp(inventoryName) })).toBeVisible()

  await admin.goto(`/assets/inventory/${inventory.id}`)
  await expect(admin.getByText(new RegExp(inventoryNumber))).toBeVisible()
  const inventoryEntry = admin.locator('.space-y-3.p-4').filter({ hasText: inventoryNumber })
  await expect(inventoryEntry.getByText('4,00 шт', { exact: true })).toBeVisible()
  await admin.locator('#count-inventory-number').fill(inventoryNumber)
  await admin.locator('#count-found-quantity').fill('4')
  const scanResponseWait = admin.waitForResponse((response) =>
    response.url().endsWith(`/api/assets/inventories/${inventory.id}/scan`) && response.request().method() === 'POST',
  )
  await admin.getByRole('button', { name: 'Сохранить результат проверки' }).click()
  const scanResponse = await scanResponseWait
  expect(scanResponse.status()).toBe(200)
  await expect(admin.getByRole('status')).toContainText(`Сохранён факт по позиции ${inventoryNumber}`)
  await expect(inventoryEntry.getByText('Совпадает', { exact: true })).toBeVisible()
  const afterInventory = (await (await admin.request.get(`/api/assets/${assetId}`)).json()).data as AssetResponse
  expect(afterInventory.quantity).toBe('10')
  expect(afterInventory.holdings).toEqual(expect.arrayContaining([
    expect.objectContaining({ molId: sourceMol!.id, quantity: '6' }),
    expect.objectContaining({ molId: destinationMol!.id, quantity: '4' }),
  ]))

  await admin.getByRole('button', { name: 'Завершить' }).click()
  await expect(admin.getByRole('dialog')).toContainText('Завершить инвентаризацию?')
  const completeWait = admin.waitForResponse((response) =>
    response.url().endsWith(`/api/assets/inventories/${inventory.id}/complete`) && response.request().method() === 'POST',
  )
  await admin.getByRole('button', { name: 'Закрыть ведомость' }).click()
  const completeResponse = await completeWait
  expect(completeResponse.status()).toBe(200)
  await expect(admin.getByText('Завершена', { exact: true })).toBeVisible()

  await admin.goto(`/assets?search=${encodeURIComponent(inventoryNumber)}`)
  const assetRow = admin.getByRole('row').filter({ hasText: inventoryNumber })
  await expect(assetRow).toBeVisible()
  admin.once('dialog', (dialog) => dialog.accept())
  const archiveWait = admin.waitForResponse((response) =>
    response.url().endsWith(`/api/assets/${assetId}/archive`) && response.request().method() === 'POST',
  )
  await assetRow.getByRole('button').last().click()
  const archiveResponse = await archiveWait
  expect(archiveResponse.ok()).toBeTruthy()
  await admin.goto(`/archive?search=${encodeURIComponent(inventoryNumber)}`)
  const archivedRow = admin.getByRole('row').filter({ hasText: inventoryNumber })
  await expect(archivedRow).toBeVisible()
  admin.once('dialog', (dialog) => dialog.accept())
  const restoreWait = admin.waitForResponse((response) =>
    response.url().endsWith(`/api/assets/${assetId}/restore`) && response.request().method() === 'POST',
  )
  await archivedRow.getByRole('button').last().click()
  const restoreResponse = await restoreWait
  expect(restoreResponse.ok()).toBeTruthy()
  const restored = (await (await admin.request.get(`/api/assets/${assetId}`)).json()).data as AssetResponse
  expect(restored).toMatchObject({ isArchived: false, quantity: '10' })

  const outsideAssetResponse = await authenticatedPost(admin, '/api/assets', {
    data: {
      name: `Stage07 scoped ${suffix}`, inventoryNumber: `${inventoryNumber}-OUT`, unitPrice: '1',
      unitOfMeasure: 'шт', quantity: '1', molId: outsideMol!.id, groupId: group!.id,
      recordingDate: '2026-07-16', documentType: 'E2E документ', documentDetails: 'E2E scoped',
      documentFiles: [], photos: [], isExistingAsset: false, status: 'IN_STOCK', accountingForm: '145',
    },
  })
  expect(outsideAssetResponse.status()).toBe(201)
  const outsideAssetId = ((await outsideAssetResponse.json()).data as { id: string }).id

  const { context: custodianContext, page: custodian } = await openSignedInPage(browser, E2E_CUSTODIAN)
  const denied = await custodian.request.get(`/api/assets/${outsideAssetId}`)
  expect(denied.status()).toBe(403)
  expect(await denied.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })

  await custodianContext.close()
  await adminContext.close()
})
