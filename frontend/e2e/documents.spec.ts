import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test, type Browser } from '@playwright/test'
import { E2E_ADMIN, E2E_VIEWER } from './global-setup'
import { authenticatedPost } from './authenticated-request'

async function signedInPage(browser: Browser, credentials = E2E_ADMIN) {
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

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

test('Documents UI uploads, versions, streams, archives and denies document access', async ({ browser }) => {
  const { context: adminContext, page: admin } = await signedInPage(browser)
  const suffix = Date.now().toString(36)
  const filename1 = `s08-${suffix}-v1.pdf`
  const filename2 = `s08-${suffix}-v2.pdf`
  const bytes1 = Buffer.from(`Documents synthetic document v1\n${suffix}\0binary`)
  const bytes2 = Buffer.from(`Documents synthetic document v2\n${suffix}\0binary`)

  await admin.goto('/documents')
  await admin.getByRole('button', { name: 'Загрузить документ' }).click()
  await admin.locator('#document-title').fill(`S08 BFF ${suffix}`)
  await admin.locator('input[name="file"]').setInputFiles({
    name: filename1, mimeType: 'application/pdf', buffer: bytes1,
  })
  const uploadResponsePromise = admin.waitForResponse((response) =>
    response.url().endsWith('/api/documents') && response.request().method() === 'POST',
  )
  await admin.getByRole('button', { name: 'Загрузить', exact: true }).click()
  const uploadResponse = await uploadResponsePromise
  expect(uploadResponse.status()).toBe(201)
  const documentLink = admin.getByRole('link', { name: `S08 BFF ${suffix}`, exact: true })
  await expect(documentLink).toBeVisible({ timeout: 15_000 })
  await documentLink.click()
  await expect(admin.getByRole('heading', { name: `S08 BFF ${suffix}` })).toBeVisible()

  await admin.getByRole('button', { name: 'Новая версия' }).click()
  await admin.locator('input[name="file"]').setInputFiles({
    name: filename2, mimeType: 'application/pdf', buffer: bytes2,
  })
  await admin.locator('textarea[name="comment"]').fill('synthetic v2')
  await admin.getByRole('button', { name: 'Добавить версию' }).click()
  await expect(admin.getByText('Текущая версия № 2')).toBeVisible({ timeout: 15_000 })

  const downloadResponsePromise = admin.waitForResponse((response) =>
    response.url().includes('/api/documents/') && response.url().endsWith('/download'),
  )
  const downloadPromise = admin.waitForEvent('download')
  await admin.getByRole('link', { name: 'Скачать текущую' }).click()
  const [currentDownload, browserDownload] = await Promise.all([downloadResponsePromise, downloadPromise])
  expect(browserDownload.suggestedFilename()).toBe(filename2)
  expect(currentDownload.status()).toBe(200)
  const downloadedPath = await browserDownload.path()
  expect(downloadedPath).toBeTruthy()
  const currentBytes = await readFile(downloadedPath!)
  const currentHash = sha256(currentBytes)
  expect(currentBytes).toEqual(bytes2)
  expect(currentHash).toBe(sha256(bytes2))
  expect(currentDownload.headers()['etag']).toBe(`"sha256-${currentHash}"`)
  expect(currentDownload.headers()['content-length']).toBe(String(bytes2.byteLength))
  expect(currentDownload.headers()['content-type']).toBe('application/pdf')
  expect(currentDownload.headers()['content-disposition']).toContain(filename2)
  expect(currentDownload.headers()['cache-control']).toBe('private, no-store')
  expect(currentDownload.headers()['x-content-type-options']).toBe('nosniff')
  expect(currentDownload.headers()['x-request-id']).toBeTruthy()

  const documentId = new URL(admin.url()).pathname.split('/').pop()
  expect(documentId).toBeTruthy()
  const version1Download = await admin.request.get(`/api/documents/${documentId}/download?version=1`)
  expect(version1Download.status()).toBe(200)
  const version1Bytes = await version1Download.body()
  expect(version1Bytes).toEqual(bytes1)
  expect(sha256(version1Bytes)).toBe(sha256(bytes1))

  admin.on('dialog', (dialog) => dialog.accept())
  await admin.getByRole('button', { name: 'В архив' }).click()
  await expect(admin.getByText('Документ в архиве')).toBeVisible({ timeout: 15_000 })

  const { context: viewerContext, page: viewer } = await signedInPage(browser, E2E_VIEWER)
  const denied = await authenticatedPost(viewer, '/api/documents', {
    headers: { 'content-type': 'application/pdf' },
    data: Buffer.from('synthetic denied upload'),
  })
  expect(denied.status()).toBe(403)
  expect(await denied.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })

  await Promise.all([adminContext.close(), viewerContext.close()])
})
