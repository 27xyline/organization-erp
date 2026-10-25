import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = path.resolve(process.cwd(), 'src')

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return productionFiles(absolute)
    if (!/\.[cm]?[jt]sx?$/.test(entry.name) || /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(entry.name)) return []
    return [absolute]
  })
}

describe('frontend runtime ownership', () => {
  it('keeps database access, legacy auth and bridge secrets out of the frontend runtime', () => {
    const legacyRuntime = /(?:from\s*|import\s*\()\s*['"](?:@prisma\/client|@prisma\/instrumentation|next-auth(?:\/[^'"]*)?)['"]|(?:DATABASE_URL|NEXTAUTH_SECRET|BACKEND_BRIDGE_SECRET|BACKEND_INTERNAL_AUTH_SECRET)/
    const offenders = productionFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return legacyRuntime.test(source) ? [path.relative(process.cwd(), file)] : []
    })

    expect(offenders).toEqual([])
  })
})
