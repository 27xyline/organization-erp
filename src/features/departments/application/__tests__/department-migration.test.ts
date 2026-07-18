import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(resolve(
  process.cwd(),
  'prisma/migrations/20260718090100_add_department_hierarchy/migration.sql',
), 'utf8')

describe('department hierarchy migration safety', () => {
  it('keeps the complete migration atomic', () => {
    expect(migrationSql.trimStart().startsWith('BEGIN;')).toBe(true)
    expect(migrationSql.trimEnd().endsWith('COMMIT;')).toBe(true)
  })

  it('creates a conflict-safe inactive placeholder for blank legacy values', () => {
    expect(migrationSql).toContain("suffix := suffix + 1")
    expect(migrationSql).toContain(
      'INSERT INTO "departments" ("id", "code", "name", "isActive", "updatedAt")',
    )
    expect(migrationSql).toContain(
      "VALUES ('dept_unassigned', candidate_code, candidate_name, false, CURRENT_TIMESTAMP);",
    )
  })
})
