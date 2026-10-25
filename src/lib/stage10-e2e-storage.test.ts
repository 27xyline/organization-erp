import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveStage10E2EDocumentStorageRoot } from './stage10-e2e-storage'

const tempRoots: string[] = []

function tempProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'stage10-playwright-root-'))
  tempRoots.push(root)
  mkdirSync(path.join(root, '.runtime', 'stage10', 'e2e'), { recursive: true })
  return root
}

afterEach(() => {
  vi.unstubAllEnvs()
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true })
})

describe('Stage 10 Playwright storage isolation', () => {
  it('uses a private Stage 10 E2E root and allows nested storage only', () => {
    const projectRoot = tempProject()
    const parent = path.join(projectRoot, '.runtime', 'stage10', 'e2e')
    expect(resolveStage10E2EDocumentStorageRoot(undefined, projectRoot))
      .toBe(path.join(parent, 'documents'))
    expect(resolveStage10E2EDocumentStorageRoot(path.join(parent, 'private-copy'), projectRoot))
      .toBe(path.join(parent, 'private-copy'))
    expect(() => resolveStage10E2EDocumentStorageRoot('/tmp/real-user-documents', projectRoot))
      .toThrow(/inside \.runtime\/stage10\/e2e/)
  })

  it('accepts erp_stage10_e2e in Playwright config with isolated storage', async () => {
    const projectRoot = tempProject()
    const databaseUrl = 'postgresql://stage10:stage10-test-only@127.0.0.1:55432/erp_stage10_e2e'
    vi.stubEnv('DATABASE_URL', databaseUrl)
    vi.stubEnv('STAGE10_E2E_DATABASE_URL', databaseUrl)
    vi.stubEnv('PLAYWRIGHT_BASE_URL', 'http://localhost:3001')
    vi.stubEnv('BACKEND_CSRF_SECRET', 'test-csrf-secret-32-bytes-minimum')
    const originalCwd = process.cwd()
    try {
      process.chdir(projectRoot)
      await expect(import('../../playwright.config')).resolves.toBeDefined()
    } finally {
      process.chdir(originalCwd)
    }
  })
})
