import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveStage08E2EDocumentStorageRoot } from './stage08-e2e-storage'

const tempRoots: string[] = []

function tempProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'stage08-playwright-root-'))
  tempRoots.push(root)
  mkdirSync(path.join(root, '.runtime', 'stage08', 'e2e'), { recursive: true })
  return root
}

afterEach(() => {
  vi.unstubAllEnvs()
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true })
})

describe('Stage 08 Playwright storage isolation', () => {
  it('uses the private default and allows a nested root within the isolated E2E directory', () => {
    const projectRoot = tempProject()
    const parent = path.join(projectRoot, '.runtime', 'stage08', 'e2e')
    expect(resolveStage08E2EDocumentStorageRoot(undefined, projectRoot))
      .toBe(path.join(parent, 'documents'))
    expect(resolveStage08E2EDocumentStorageRoot(path.join(parent, 'private-copy'), projectRoot))
      .toBe(path.join(parent, 'private-copy'))
  })

  it.each([
    '/tmp/real-user-documents',
    '../documents',
  ])('rejects inherited or traversing storage path %s', (configuredRoot) => {
    expect(() => resolveStage08E2EDocumentStorageRoot(configuredRoot, tempProject()))
      .toThrow(/inside \.runtime\/stage08\/e2e/)
  })

  it('rejects an existing symlink in the isolated root path', () => {
    const projectRoot = tempProject()
    const stage08Root = path.join(projectRoot, '.runtime', 'stage08')
    const e2eRoot = path.join(stage08Root, 'e2e')
    const outside = mkdtempSync(path.join(tmpdir(), 'stage08-outside-storage-'))
    tempRoots.push(outside)
    rmSync(e2eRoot, { recursive: true, force: true })
    symlinkSync(outside, e2eRoot, 'dir')

    expect(() => resolveStage08E2EDocumentStorageRoot(undefined, projectRoot))
      .toThrow(/must not traverse symlinks/)
  })

  it('rejects unsafe DOCUMENT_STORAGE_ROOT through the actual Playwright config', async () => {
    const projectRoot = tempProject()
    const outside = mkdtempSync(path.join(tmpdir(), 'stage08-config-outside-'))
    tempRoots.push(outside)
    const url = 'postgresql://stage08:test@127.0.0.1:5434/erp_stage08_e2e'
    vi.stubEnv('DOCUMENT_STORAGE_ROOT', outside)
    vi.stubEnv('DATABASE_URL', url)
    vi.stubEnv('STAGE08_E2E_DATABASE_URL', url)
    vi.stubEnv('PLAYWRIGHT_BASE_URL', 'http://localhost:3001')
    vi.stubEnv('BACKEND_CSRF_SECRET', 'test-csrf-secret-32-bytes-minimum')

    const originalCwd = process.cwd()
    try {
      process.chdir(projectRoot)
      await expect(import('../../playwright.config')).rejects.toThrow(/inside \.runtime\/stage08\/e2e/)
    } finally {
      process.chdir(originalCwd)
    }
  })
})
