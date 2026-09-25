import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { withOrganizationMutation } from '../src/lib/organization/organization-mutation'
import { seedDemoData } from './demo-seed'

const prisma = new PrismaClient()

function stableDepartmentIdentity(name: string) {
  const digest = createHash('md5').update(name.toLocaleLowerCase('ru')).digest('hex')
  return {
    id: `dept_${digest}`,
    code: `DEP-${digest.slice(0, 8).toUpperCase()}`,
  }
}

async function main() {
  assertSafeDemoSeedTarget()

  const { mol1, mol2 } = await withOrganizationMutation(prisma, async (tx) => {
    const itDepartmentIdentity = stableDepartmentIdentity('Отдел информационных технологий')
    const itDepartment = await tx.department.upsert({
      where: { id: itDepartmentIdentity.id },
      // Seed reruns must not overwrite a user-managed name, code, or status.
      update: {},
      create: {
        ...itDepartmentIdentity,
        name: 'Отдел информационных технологий',
      },
    })
    const accountingDepartmentIdentity = stableDepartmentIdentity('Бухгалтерия')
    const accountingDepartment = await tx.department.upsert({
      where: { id: accountingDepartmentIdentity.id },
      update: {},
      create: {
        ...accountingDepartmentIdentity,
        name: 'Бухгалтерия',
      },
    })

    // Keep MOL compatibility snapshots aligned with the current canonical
    // department values, including user-managed department renames.
    const mol1 = await tx.mol.upsert({
      where: { code: 'MOL-001' },
      update: {
        department: itDepartment.name,
        departmentId: itDepartment.id,
      },
      create: {
        code: 'MOL-001',
        department: itDepartment.name,
        departmentId: itDepartment.id,
        fullName: 'Иванов Иван Иванович',
        storageLocation: 'Кабинет 101, 1 этаж',
      },
    })

    const mol2 = await tx.mol.upsert({
      where: { code: 'MOL-002' },
      update: {
        department: accountingDepartment.name,
        departmentId: accountingDepartment.id,
      },
      create: {
        code: 'MOL-002',
        department: accountingDepartment.name,
        departmentId: accountingDepartment.id,
        fullName: 'Петрова Мария Сергеевна',
        storageLocation: 'Кабинет 205, 2 этаж',
      },
    })

    return { mol1, mol2 }
  })

  console.log('Created MOLs:', { mol1, mol2 })

  await seedDemoData(prisma)
}

function assertSafeDemoSeedTarget() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL не задан')
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Демо-данные нельзя загружать при NODE_ENV=production')
  }

  const databaseUrl = new URL(process.env.DATABASE_URL)
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'])
  if (!localHosts.has(databaseUrl.hostname) && process.env.ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      'Seed разрешён только для локальной БД. Для отдельной тестовой БД явно задайте ALLOW_DEMO_SEED=1.',
    )
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
