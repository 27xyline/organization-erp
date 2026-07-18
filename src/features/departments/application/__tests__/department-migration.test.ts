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

  it('acquires the organization lock before row-level cycle validation', () => {
    const statementFunctionStart = migrationSql.indexOf(
      'CREATE FUNCTION "acquire_department_mutation_lock"()',
    )
    const statementTriggerStart = migrationSql.indexOf(
      'CREATE TRIGGER "departments_acquire_mutation_lock"',
    )
    const rowFunctionStart = migrationSql.indexOf(
      'CREATE FUNCTION "prevent_department_hierarchy_cycle"()',
    )
    const rowTriggerStart = migrationSql.indexOf(
      'CREATE TRIGGER "departments_prevent_hierarchy_cycle"',
    )

    expect(statementFunctionStart).toBeGreaterThan(-1)
    expect(statementTriggerStart).toBeGreaterThan(statementFunctionStart)
    expect(rowFunctionStart).toBeGreaterThan(statementTriggerStart)
    expect(rowTriggerStart).toBeGreaterThan(rowFunctionStart)

    const statementLockSql = migrationSql.slice(statementFunctionStart, rowFunctionStart)
    expect(statementLockSql).toContain('PERFORM pg_advisory_xact_lock(904202607);')
    expect(statementLockSql).toContain(
      'BEFORE INSERT OR UPDATE OR DELETE ON "departments"',
    )
    expect(statementLockSql).toContain('FOR EACH STATEMENT')

    const rowCycleSql = migrationSql.slice(rowFunctionStart, rowTriggerStart)
    expect(rowCycleSql).not.toContain('pg_advisory_xact_lock')
    expect(migrationSql.slice(rowTriggerStart)).toContain('FOR EACH ROW')
  })
})
