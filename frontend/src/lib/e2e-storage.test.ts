import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveE2EDocumentStorageRoot } from './e2e-storage'

const tempRoots: string[] = []

function tempProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'e2e-playwright-root-'))
  tempRoots.push(root)
  mkdirSync(path.join(root, '.test-data', 'e2e'), { recursive: true })
  return root
}

afterEach(() => {
  vi.unstubAllEnvs()
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true })
})

describe('Playwright storage isolation', () => {
  it('uses the private default and allows a nested root within the isolated E2E directory', () => {
    const projectRoot = tempProject()
    const parent = path.join(projectRoot, '.test-data', 'e2e')
    expect(resolveE2EDocumentStorageRoot(undefined, projectRoot))
      .toBe(path.join(parent, 'documents'))
    expect(resolveE2EDocumentStorageRoot(path.join(parent, 'private-copy'), projectRoot))
      .toBe(path.join(parent, 'private-copy'))
  })

  it.each([
    '/tmp/real-user-documents',
    '../documents',
  ])('rejects inherited or traversing storage path %s', (configuredRoot) => {
    expect(() => resolveE2EDocumentStorageRoot(configuredRoot, tempProject()))
      .toThrow(/inside \.test-data\/e2e/)
  })

  it('rejects an existing symlink in the isolated root path', () => {
    const projectRoot = tempProject()
    const privateRoot = path.join(projectRoot, '.test-data')
    const e2eRoot = path.join(privateRoot, 'e2e')
    const outside = mkdtempSync(path.join(tmpdir(), 'e2e-outside-storage-'))
    tempRoots.push(outside)
    rmSync(e2eRoot, { recursive: true, force: true })
    symlinkSync(outside, e2eRoot, 'dir')

    expect(() => resolveE2EDocumentStorageRoot(undefined, projectRoot))
      .toThrow(/must not traverse symlinks/)
  })

  it('accepts an explicit isolated E2E database and rejects a working database', async () => {
    const databaseUrl = 'postgresql://test:test@127.0.0.1/organization_erp_e2e'
    vi.stubEnv('E2E_DATABASE_URL', databaseUrl)
    vi.stubEnv('DATABASE_URL', databaseUrl)
    vi.stubEnv('BACKEND_CSRF_SECRET', 'test-csrf-secret-32-bytes-minimum')
    vi.resetModules()
    await expect(import('../../playwright.config')).resolves.toBeDefined()
    vi.stubEnv('E2E_DATABASE_URL', 'postgresql://test:test@127.0.0.1/organization_erp_dev')
    vi.resetModules()
    await expect(import('../../playwright.config')).rejects.toThrow(/organization_erp_e2e/)
  })

  it('rejects unsafe DOCUMENT_STORAGE_ROOT through the actual Playwright config', async () => {
    const projectRoot = tempProject()
    const outside = mkdtempSync(path.join(tmpdir(), 'e2e-config-outside-'))
    tempRoots.push(outside)
    const url = 'postgresql://e2e:test@127.0.0.1:5434/organization_erp_e2e'
    vi.stubEnv('DOCUMENT_STORAGE_ROOT', outside)
    vi.stubEnv('DATABASE_URL', url)
    vi.stubEnv('E2E_DATABASE_URL', url)
    vi.stubEnv('PLAYWRIGHT_BASE_URL', 'http://localhost:3001')
    vi.stubEnv('BACKEND_CSRF_SECRET', 'test-csrf-secret-32-bytes-minimum')

    vi.resetModules()
    const originalCwd = process.cwd()
    try {
      process.chdir(projectRoot)
      await expect(import('../../playwright.config')).rejects.toThrow(/inside \.test-data\/e2e/)
    } finally {
      process.chdir(originalCwd)
    }
  })
})
