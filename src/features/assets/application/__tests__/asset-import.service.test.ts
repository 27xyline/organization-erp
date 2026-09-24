import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/prisma'
import { AssetImportService, ASSET_IMPORT_COLUMNS, AssetImportError } from '../asset-import.service'

vi.mock('@/lib/prisma', () => ({ getDb: vi.fn() }))

const access = {
  allows: vi.fn((permission: string, target: { departmentId?: string }) =>
    permission === 'assets.create' && target.departmentId === 'department-1'),
  allowedDepartmentIds: vi.fn(() => ['department-1']),
}

function workbookBuffer(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Имущество')
  sheet.addRow(ASSET_IMPORT_COLUMNS.map((column) => column.label))
  for (const row of rows) sheet.addRow(row)
  return workbook.xlsx.writeBuffer()
}

function createDbMock() {
  const db = {
    mol: { findMany: vi.fn() },
    assetGroup: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
  }
  vi.mocked(getDb).mockReturnValue(db as never)
  db.mol.findMany.mockResolvedValue([{ id: 'mol-1', code: 'M-1', departmentId: 'department-1' }])
  db.assetGroup.findMany.mockResolvedValue([{ id: 'group-1', code: 'G-1' }])
  db.asset.findMany.mockResolvedValue([])
  return db
}

function row(overrides: Record<string, unknown> = {}) {
  const values = {
    inventoryNumber: 'INV-1',
    name: 'Ноутбук',
    unitPrice: 1250.5,
    unitOfMeasure: 'шт',
    quantity: 2,
    molCode: 'M-1',
    groupCode: 'G-1',
    recordingDate: new Date('2026-07-16T00:00:00.000Z'),
    documentType: 'Накладная',
    documentDetails: '№ 7',
    contractCode: '',
    internalFundingCode: '',
    isExistingAsset: '',
    accountingForm: '145',
    notes: '',
    ...overrides,
  }
  return ASSET_IMPORT_COLUMNS.map((column) => values[column.key as keyof typeof values])
}

describe('AssetImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createDbMock()
    access.allows.mockImplementation((permission, target) =>
      permission === 'assets.create' && target.departmentId === 'department-1')
  })

  it('reads template-shaped xlsx rows and skips empty rows', async () => {
    const buffer = await workbookBuffer([row(), [], row({ inventoryNumber: 'INV-2' })])

    await expect(AssetImportService.parseWorkbook(Buffer.from(buffer))).resolves.toEqual([
      { rowNumber: 2, values: expect.objectContaining({ inventoryNumber: 'INV-1', name: 'Ноутбук' }) },
      { rowNumber: 4, values: expect.objectContaining({ inventoryNumber: 'INV-2' }) },
    ])
  })

  it('rejects workbooks without the required inventory-number column', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Имущество').addRow(['Наименование'])

    await expect(AssetImportService.parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())))
      .rejects.toBeInstanceOf(AssetImportError)
  })

  it('marks invalid values, duplicates within the file, existing numbers, and inaccessible MOLs', async () => {
    const db = createDbMock()
    db.asset.findMany.mockResolvedValue([{ inventoryNumber: 'INV-DB' }])
    const rows = [
      { rowNumber: 2, values: { ...Object.fromEntries(ASSET_IMPORT_COLUMNS.map((column, index) => [column.key, row()[index]])) } },
      { rowNumber: 3, values: { ...Object.fromEntries(ASSET_IMPORT_COLUMNS.map((column, index) => [column.key, row({ inventoryNumber: 'INV-DB' })[index]])) } },
      { rowNumber: 4, values: { ...Object.fromEntries(ASSET_IMPORT_COLUMNS.map((column, index) => [column.key, row({ inventoryNumber: 'INV-1', unitPrice: -1, molCode: 'M-2' })[index]])) } },
    ]

    const preview = await AssetImportService.preview(rows, access as never)

    expect(preview.map((item) => item.errors)).toEqual([
      ['Инвентарный номер повторяется в этом файле'],
      ['Инвентарный номер уже используется'],
      expect.arrayContaining(['Цена за единицу: Цена должна быть больше нуля', 'МОЛ с таким кодом не найден или недоступен']),
    ])
    expect(preview[0]?.input).toBeUndefined()
    expect(preview[1]?.input).toBeUndefined()
  })

  it('reports malformed dates and unsupported decimal precision before an import can be committed', async () => {
    const values = Object.fromEntries(ASSET_IMPORT_COLUMNS.map((column, index) => [column.key, row()[index]]))
    const preview = await AssetImportService.preview([{
      rowNumber: 2,
      values: { ...values, unitPrice: '12,345', recordingDate: '31.02.2026' },
    }], access as never)

    expect(preview[0]?.errors).toEqual(expect.arrayContaining([
      'Цена за единицу: допустимо не более двух знаков после запятой',
      'Дата поступления: Дата поступления обязательна',
    ]))
    expect(preview[0]?.input).toBeUndefined()
  })

  it('builds a template with the import sheet and scoped reference catalogs', async () => {
    const db = createDbMock()
    db.mol.findMany.mockResolvedValue([{ id: 'mol-1', code: 'M-1', departmentId: 'department-1', fullName: 'Иванов И.И.' }])
    db.assetGroup.findMany.mockResolvedValue([{ id: 'group-1', code: 'G-1', name: 'Оргтехника' }])

    const buffer = await AssetImportService.createTemplate(access as never)
    const workbook = new ExcelJS.Workbook()
    const arrayBuffer = new Uint8Array(buffer).buffer as ArrayBuffer
    await workbook.xlsx.load(arrayBuffer)

    expect(workbook.getWorksheet('Имущество')?.getRow(1).values).toContain('Инвентарный номер')
    expect(workbook.getWorksheet('Справочники')?.getRow(2).values).toContain('M-1')
    expect(workbook.getWorksheet('Имущество')?.getCell('F2').dataValidation.formulae).toEqual(['=MolCodes'])
    expect(workbook.getWorksheet('Имущество')?.getCell('G2').dataValidation.formulae).toEqual(['=AssetGroupCodes'])
    expect(db.mol.findMany.mock.calls[0]?.[0].where).toEqual({ departmentId: { in: ['department-1'] } })
  })
})
