import { lstatSync } from 'node:fs'
import path from 'node:path'

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function rejectSymlinkComponents(root: string, candidate: string): void {
  let current = root
  for (const segment of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error('Playwright document storage must not traverse symlinks')
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }
  }
}

/** Resolve only to the Stage 10 E2E subdirectory, never a caller's real data root. */
export function resolveStage10E2EDocumentStorageRoot(
  configuredRoot: string | undefined,
  projectRoot = process.cwd(),
): string {
  const projectRootPath = path.resolve(projectRoot)
  const isolatedParent = path.join(projectRootPath, '.runtime', 'stage10', 'e2e')
  const requestedRoot = path.resolve(configuredRoot || path.join(isolatedParent, 'documents'))

  if (!isWithin(isolatedParent, requestedRoot)) {
    throw new Error('DOCUMENT_STORAGE_ROOT must be inside .runtime/stage10/e2e for Playwright')
  }

  rejectSymlinkComponents(projectRootPath, requestedRoot)
  return requestedRoot
}
