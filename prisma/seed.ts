import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function upsertAsset(data: Prisma.AssetUncheckedCreateInput) {
  const asset = await prisma.asset.upsert({
    where: { inventoryNumber: data.inventoryNumber },
    update: {},
    create: data,
  })
  await prisma.assetHolding.upsert({
    where: { assetId_molId: { assetId: asset.id, molId: asset.molId } },
    update: { quantity: asset.quantity },
    create: { assetId: asset.id, molId: asset.molId, quantity: asset.quantity },
  })
  return asset
}

async function main() {
  // Create default MOLs
  const mol1 = await prisma.mol.upsert({
    where: { code: 'MOL-001' },
    update: {},
    create: {
      code: 'MOL-001',
      department: 'Отдел информационных технологий',
      fullName: 'Иванов Иван Иванович',
      storageLocation: 'Кабинет 101, 1 этаж',
    },
  })

  const mol2 = await prisma.mol.upsert({
    where: { code: 'MOL-002' },
    update: {},
    create: {
      code: 'MOL-002',
      department: 'Бухгалтерия',
      fullName: 'Петрова Мария Сергеевна',
      storageLocation: 'Кабинет 205, 2 этаж',
    },
  })

  console.log('Created MOLs:', { mol1, mol2 })

  // Create default asset groups
  const groups = [
    { code: 'OS', name: 'Основные средства', description: 'Основные средства стоимостью более 100 000 руб.' },
    { code: 'OMC', name: 'Особо ценное движимое имущество', description: 'Особо ценное движимое имущество' },
    { code: 'IM', name: 'Имущество', description: 'Имущество стоимостью от 40 000 до 100 000 руб.' },
    { code: 'MAT', name: 'Материалы', description: 'Материалы и ТМЦ' },
  ]

  for (const group of groups) {
    await prisma.assetGroup.upsert({
      where: { code: group.code },
      update: {},
      create: group,
    })
  }

  console.log('Created asset groups')

  // Create sample assets
  const osGroup = await prisma.assetGroup.findUnique({ where: { code: 'OS' } })
  const imGroup = await prisma.assetGroup.findUnique({ where: { code: 'IM' } })
  const matGroup = await prisma.assetGroup.findUnique({ where: { code: 'MAT' } })

  if (osGroup && mol1) {
    await upsertAsset({
        name: 'Компьютер Dell OptiPlex 7090',
        inventoryNumber: 'INV-2024-001',
        unitPrice: 85000.00,
        unitOfMeasure: 'шт',
        quantity: 5,
        totalCost: 425000.00,
        molId: mol1.id,
        groupId: osGroup.id,
        contractCode: 'ДОГ-2024-0156',
        recordingDate: new Date('2024-01-15'),
        documentType: 'Товарная накладная',
        documentDetails: '№ 156 от 15.01.2024, ООО "ТехноСнаб"',
        status: 'IN_USE',
    })
  }

  if (imGroup && mol1) {
    await upsertAsset({
        name: 'Монитор Dell 27" P2722H',
        inventoryNumber: 'INV-2024-002',
        unitPrice: 45000.00,
        unitOfMeasure: 'шт',
        quantity: 3,
        totalCost: 135000.00,
        molId: mol1.id,
        groupId: imGroup.id,
        contractCode: 'ДОГ-2024-0156',
        recordingDate: new Date('2024-01-15'),
        documentType: 'Товарная накладная',
        documentDetails: '№ 156 от 15.01.2024, ООО "ТехноСнаб"',
        status: 'IN_STOCK',
    })
  }

  if (matGroup && mol2) {
    await upsertAsset({
        name: 'Бумага А4 для принтера',
        inventoryNumber: 'INV-2024-003',
        unitPrice: 350.00,
        unitOfMeasure: 'пачка',
        quantity: 50,
        totalCost: 17500.00,
        molId: mol2.id,
        groupId: matGroup.id,
        internalFundingCode: 'ВН-2024-001',
        recordingDate: new Date('2024-02-01'),
        documentType: 'Приходный ордер',
        documentDetails: '№ 45 от 01.02.2024',
        status: 'IN_STOCK',
    })
  }

  if (osGroup && mol2) {
    await upsertAsset({
        name: 'МФУ Canon imageRUNNER C3025',
        inventoryNumber: 'INV-2024-004',
        unitPrice: 120000.00,
        unitOfMeasure: 'шт',
        quantity: 1,
        totalCost: 120000.00,
        molId: mol2.id,
        groupId: osGroup.id,
        contractCode: 'ДОГ-2024-0234',
        recordingDate: new Date('2024-02-10'),
        documentType: 'Акт приемки',
        documentDetails: '№ 12 от 10.02.2024, ООО "ОфисТехника"',
        status: 'IN_USE',
    })
  }

  console.log('Created sample assets')
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
