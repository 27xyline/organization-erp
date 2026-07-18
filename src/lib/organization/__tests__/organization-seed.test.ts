import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const seedSource = readFileSync(resolve(process.cwd(), 'prisma/seed.ts'), 'utf8')
const organizationBlockStart = seedSource.indexOf(
  'withOrganizationMutation(prisma, async (tx) =>',
)
const organizationBlockEnd = seedSource.indexOf("console.log('Created MOLs:'")
const organizationBlock = seedSource.slice(organizationBlockStart, organizationBlockEnd)

describe('organization seed safety', () => {
  it('runs department and MOL writes under the shared organization lock', () => {
    expect(organizationBlockStart).toBeGreaterThan(-1)
    expect(organizationBlockEnd).toBeGreaterThan(organizationBlockStart)
    expect(organizationBlock).toContain('tx.department.upsert')
    expect(organizationBlock).toContain('tx.mol.upsert')
    expect(organizationBlock).not.toContain('prisma.department.upsert')
    expect(organizationBlock).not.toContain('prisma.mol.upsert')
  })

  it('never overwrites user-managed departments on a seed rerun', () => {
    const emptyDepartmentUpdates = organizationBlock.match(/update: \{\},/g) ?? []
    expect(emptyDepartmentUpdates).toHaveLength(2)
  })
})
