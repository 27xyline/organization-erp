import ExcelJS from 'exceljs'
import { createAssetSchema, type CreateAssetInput } from '../contracts/schemas'
import type { AssetImportPreviewRow } from '../contracts/asset-import'
import { MAX_ASSET_IMPORT_FILE_BYTES, MAX_ASSET_IMPORT_ROWS } from '../contracts/asset-import'
import type { AccessContext } from '@/lib/auth/access-context'
import { getDb } from '@/lib/prisma'

export { MAX_ASSET_IMPORT_FILE_BYTES, MAX_ASSET_IMPORT_ROWS } from '../contracts/asset-import'

export const ASSET_IMPORT_COLUMNS = [
  { key: 'inventoryNumber', label: 'Инвентарный номер', required: true },
  { key: 'name', label: 'Наименование', required: true },
  { key: 'unitPrice', label: 'Цена за единицу', required: true },
  { key: 'unitOfMeasure', label: 'Единица измерения', required: true },
  { key: 'quantity', label: 'Количество', required: true },
  { key: 'molCode', label: 'Код МОЛ', required: true },
  { key: 'groupCode', label: 'Код группы', required: true },
  { key: 'recordingDate', label: 'Дата поступления', required: true },
  { key: 'documentType', label: 'Тип документа', required: true },
  { key: 'documentDetails', label: 'Реквизиты документа', required: true },
  { key: 'contractCode', label: 'Код договора', required: false },
  { key: 'internalFundingCode', label: 'Код источника финансирования', required: false },
  { key: 'isExistingAsset', label: 'Ранее учтённое имущество', required: false },
  { key: 'accountingForm', label: 'Форма учета', required: false },
  { key: 'notes', label: 'Примечание', required: false },
] as const

type AssetImportKey = (typeof ASSET_IMPORT_COLUMNS)[number]['key']

export interface ParsedAssetImportRow {
  rowNumber: number
  values: Partial<Record<AssetImportKey, unknown>>
}

export class AssetImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssetImportError'
  }
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return ''
  if (value instanceof Date || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if ('result' in value) return value.result ?? ''
  if ('text' in value) return value.text
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  return String(value)
}

function cellText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim()
}

function isBlankRow(row: ExcelJS.Row) {
  for (let index = 1; index <= ASSET_IMPORT_COLUMNS.length; index += 1) {
    if (cellText(cellValue(row.getCell(index).value))) return false
  }
  return true
}

function dateValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000))
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  }
  const text = cellText(value)
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const localMatch = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text)
  const match = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : localMatch
      ? { year: Number(localMatch[3]), month: Number(localMatch[2]), day: Number(localMatch[1]) }
      : null
  if (!match) return ''
  const date = new Date(Date.UTC(match.year, match.month - 1, match.day))
  if (date.getUTCFullYear() !== match.year || date.getUTCMonth() !== match.month - 1 || date.getUTCDate() !== match.day) {
    return ''
  }
  return date.toISOString().slice(0, 10)
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const text = cellText(value).replace(/[\s\u00a0]/g, '').replace(',', '.')
  if (!text) return undefined
  const number = Number(text)
  return Number.isFinite(number) ? number : undefined
}

function decimalPlaces(value: unknown): number {
  const text = cellText(value).replace(/[\s\u00a0]/g, '').replace(',', '.')
  const match = /\.(\d+)/.exec(text)
  return match?.[1]?.length || 0
}

function existingAssetValue(value: unknown): boolean | null {
  const text = cellText(value).toLocaleLowerCase('ru-RU')
  if (!text || ['нет', 'no', 'false', '0'].includes(text)) return false
  if (['да', 'yes', 'true', '1'].includes(text)) return true
  return null
}

function textOrUndefined(value: unknown): string | undefined {
  const text = cellText(value)
  return text || undefined
}

function validationMessages(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const labels: Record<string, string> = {
    name: 'Наименование',
    inventoryNumber: 'Инвентарный номер',
    unitPrice: 'Цена за единицу',
    unitOfMeasure: 'Единица измерения',
    quantity: 'Количество',
    molId: 'МОЛ',
    groupId: 'Группа',
    recordingDate: 'Дата поступления',
    documentType: 'Тип документа',
    documentDetails: 'Реквизиты документа',
  }
  return error.issues.map((issue) => {
    const field = labels[String(issue.path[0])] || String(issue.path[0])
    return field ? `${field}: ${issue.message}` : issue.message
  })
}

function rowCandidate(row: ParsedAssetImportRow, molId: string, groupId: string) {
  const values = row.values
  const existingFlag = existingAssetValue(values.isExistingAsset)
  const unitPrice = numericValue(values.unitPrice)
  const quantity = numericValue(values.quantity)
  const issues: string[] = []
  if (existingFlag === null) issues.push('Ранее учтённое имущество: укажите «Да» или «Нет»')
  if (decimalPlaces(values.unitPrice) > 2) issues.push('Цена за единицу: допустимо не более двух знаков после запятой')
  if (decimalPlaces(values.quantity) > 2) issues.push('Количество: допустимо не более двух знаков после запятой')
  if (unitPrice === undefined) {
    issues.push(`Цена за единицу: ${cellText(values.unitPrice) ? 'укажите число' : 'обязательное поле'}`)
  }
  if (quantity === undefined) {
    issues.push(`Количество: ${cellText(values.quantity) ? 'укажите число' : 'обязательное поле'}`)
  }
  if (unitPrice !== undefined && unitPrice > 99_999_999.99) issues.push('Цена за единицу: превышен допустимый предел')
  if (quantity !== undefined && quantity > 99_999_999.99) issues.push('Количество: превышен допустимый предел')
  if (unitPrice !== undefined && quantity !== undefined && unitPrice * quantity > 9_999_999_999.99) {
    issues.push('Стоимость: цена × количество превышает допустимый предел')
  }

  const candidate = createAssetSchema.safeParse({
    inventoryNumber: cellText(values.inventoryNumber),
    name: cellText(values.name),
    unitPrice: unitPrice ?? 0,
    unitOfMeasure: cellText(values.unitOfMeasure),
    quantity: quantity ?? 0,
    molId,
    groupId,
    recordingDate: dateValue(values.recordingDate),
    documentType: cellText(values.documentType),
    documentDetails: cellText(values.documentDetails),
    contractCode: textOrUndefined(values.contractCode),
    internalFundingCode: textOrUndefined(values.internalFundingCode),
    isExistingAsset: existingFlag ?? false,
    accountingForm: cellText(values.accountingForm) || '145',
    notes: textOrUndefined(values.notes),
    projectId: null,
  })

  const schemaIssues = candidate.success
    ? []
    : candidate.error.issues.filter((issue) =>
        !(issue.path[0] === 'unitPrice' && unitPrice === undefined) &&
        !(issue.path[0] === 'quantity' && quantity === undefined),
      )
  return {
    candidate,
    errors: [...validationMessages({ issues: schemaIssues }), ...issues],
  }
}

async function validateInputs(
  entries: Array<{ rowNumber: number; input: CreateAssetInput }>,
  access: AccessContext,
) {
  const errors = new Map<number, string[]>()
  const addError = (rowNumber: number, message: string) => {
    errors.set(rowNumber, [...(errors.get(rowNumber) || []), message])
  }
  if (!entries.length) return errors

  const db = getDb()
  const molIds = Array.from(new Set(entries.map(({ input }) => input.molId)))
  const groupIds = Array.from(new Set(entries.map(({ input }) => input.groupId)))
  const inventoryNumbers = entries.map(({ input }) => input.inventoryNumber)
  const [mols, groups, existingAssets] = await Promise.all([
    db.mol.findMany({ where: { id: { in: molIds } }, select: { id: true, departmentId: true } }),
    db.assetGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true } }),
    db.asset.findMany({ where: { inventoryNumber: { in: inventoryNumbers } }, select: { inventoryNumber: true } }),
  ])
  const molById = new Map(mols.map((mol) => [mol.id, mol]))
  const groupIdsFound = new Set(groups.map((group) => group.id))
  const existingNumbers = new Set(existingAssets.map((asset) => asset.inventoryNumber))
  const rowsByNumber = new Map<string, number[]>()

  for (const { rowNumber, input } of entries) {
    const mol = molById.get(input.molId)
    if (!mol || !access.allows('assets.create', { departmentId: mol.departmentId })) {
      addError(rowNumber, 'МОЛ с таким кодом не найден или недоступен')
    }
    if (!groupIdsFound.has(input.groupId)) addError(rowNumber, 'Группа имущества не найдена')
    if (existingNumbers.has(input.inventoryNumber)) addError(rowNumber, 'Инвентарный номер уже используется')
    rowsByNumber.set(input.inventoryNumber, [...(rowsByNumber.get(input.inventoryNumber) || []), rowNumber])
  }

  for (const rowNumbers of rowsByNumber.values()) {
    if (rowNumbers.length > 1) {
      rowNumbers.forEach((rowNumber) => addError(rowNumber, 'Инвентарный номер повторяется в этом файле'))
    }
  }
  return errors
}

export class AssetImportService {
  static async parseWorkbook(buffer: ArrayBuffer | Uint8Array): Promise<ParsedAssetImportRow[]> {
    if (buffer.byteLength > MAX_ASSET_IMPORT_FILE_BYTES) {
      throw new AssetImportError('Файл слишком большой. Максимальный размер — 5 МБ')
    }

    const workbook = new ExcelJS.Workbook()
    try {
      const arrayBuffer = buffer instanceof ArrayBuffer
        ? buffer
        : (() => {
            const copy = new ArrayBuffer(buffer.byteLength)
            new Uint8Array(copy).set(buffer)
            return copy
          })()
      await workbook.xlsx.load(arrayBuffer)
    } catch {
      throw new AssetImportError('Не удалось прочитать файл. Загрузите корректный шаблон .xlsx')
    }

    const sheet = workbook.getWorksheet('Имущество')
    if (!sheet || sheet.rowCount < 1) {
      throw new AssetImportError('В книге нет листа «Имущество»')
    }
    if (sheet.rowCount > MAX_ASSET_IMPORT_ROWS + 1) {
      throw new AssetImportError(`В файле больше ${MAX_ASSET_IMPORT_ROWS} строк с данными`)
    }

    const columnByIndex = new Map<number, (typeof ASSET_IMPORT_COLUMNS)[number]>()
    const seenLabels = new Set<string>()
    const knownLabels = new Map<string, (typeof ASSET_IMPORT_COLUMNS)[number]>(
      ASSET_IMPORT_COLUMNS.map((column) => [column.label, column]),
    )
    const unknownLabels: string[] = []
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const label = cellText(cellValue(cell.value))
      if (!label) return
      if (seenLabels.has(label)) throw new AssetImportError(`Колонка «${label}» указана дважды`)
      seenLabels.add(label)
      const column = knownLabels.get(label)
      if (!column) unknownLabels.push(label)
      else columnByIndex.set(columnNumber, column)
    })
    if (unknownLabels.length) throw new AssetImportError(`Неизвестные колонки: ${unknownLabels.join(', ')}`)
    const missing = ASSET_IMPORT_COLUMNS
      .filter((column) => column.required && !Array.from(columnByIndex.values()).some((found) => found.key === column.key))
      .map((column) => column.label)
    if (missing.length) throw new AssetImportError(`Не найдены обязательные колонки: ${missing.join(', ')}`)

    const rows: ParsedAssetImportRow[] = []
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber)
      if (isBlankRow(row)) continue
      const values: Partial<Record<AssetImportKey, unknown>> = {}
      for (const [index, column] of columnByIndex) values[column.key] = cellValue(row.getCell(index).value)
      rows.push({ rowNumber, values })
    }
    if (!rows.length) throw new AssetImportError('В файле нет строк с имуществом')
    return rows
  }

  static async preview(rows: ParsedAssetImportRow[], access: AccessContext): Promise<AssetImportPreviewRow[]> {
    const db = getDb()
    const molCodes = Array.from(new Set(rows
      .map(({ values }) => cellText(values.molCode))
      .filter((code) => code.length > 0 && code.length <= 50)))
    const groupCodes = Array.from(new Set(rows
      .map(({ values }) => cellText(values.groupCode))
      .filter((code) => code.length > 0 && code.length <= 50)))
    const [mols, groups] = await Promise.all([
      db.mol.findMany({ where: { code: { in: molCodes } }, select: { id: true, code: true, departmentId: true } }),
      db.assetGroup.findMany({ where: { code: { in: groupCodes } }, select: { id: true, code: true } }),
    ])
    const molByCode = new Map(mols.map((mol) => [mol.code, mol]))
    const groupByCode = new Map(groups.map((group) => [group.code, group]))

    const previews: AssetImportPreviewRow[] = rows.map((row) => {
      const molCode = cellText(row.values.molCode)
      const groupCode = cellText(row.values.groupCode)
      const mol = molByCode.get(molCode)
      const group = groupByCode.get(groupCode)
      const hasMolAccess = Boolean(mol && access.allows('assets.create', { departmentId: mol.departmentId }))
      const { candidate, errors } = rowCandidate(row, mol?.id || '__unavailable__', group?.id || '__unavailable__')
      if (!mol || !hasMolAccess) errors.push('МОЛ с таким кодом не найден или недоступен')
      if (!group) errors.push('Группа имущества не найдена')
      return {
        rowNumber: row.rowNumber,
        inventoryNumber: cellText(row.values.inventoryNumber),
        name: cellText(row.values.name),
        molCode,
        groupCode,
        quantity: cellText(row.values.quantity),
        unitPrice: cellText(row.values.unitPrice),
        unitOfMeasure: cellText(row.values.unitOfMeasure),
        ...(candidate.success && errors.length === 0 && mol && hasMolAccess && group ? { input: candidate.data } : {}),
        errors,
      }
    })

    const inventoryNumbers = previews
      .map((row) => row.inventoryNumber)
      .filter((number) => number.length > 0 && number.length <= 100)
    const existingAssets = inventoryNumbers.length
      ? await db.asset.findMany({
          where: { inventoryNumber: { in: Array.from(new Set(inventoryNumbers)) } },
          select: { inventoryNumber: true },
        })
      : []
    const existingNumbers = new Set(existingAssets.map((asset) => asset.inventoryNumber))
    const rowsByNumber = new Map<string, number[]>()
    for (const row of previews) {
      if (row.inventoryNumber) {
        rowsByNumber.set(row.inventoryNumber, [...(rowsByNumber.get(row.inventoryNumber) || []), row.rowNumber])
      }
    }
    const duplicateRows = new Set(Array.from(rowsByNumber.values())
      .filter((rowNumbers) => rowNumbers.length > 1)
      .flat())
    for (const row of previews) {
      if (duplicateRows.has(row.rowNumber)) row.errors.push('Инвентарный номер повторяется в этом файле')
      if (existingNumbers.has(row.inventoryNumber)) row.errors.push('Инвентарный номер уже используется')
    }

    const eligibleEntries = previews.flatMap((row) => row.input
      ? [{ rowNumber: row.rowNumber, input: row.input }]
      : [])
    const referenceErrors = await validateInputs(eligibleEntries, access)
    return previews.map((row) => {
      const additionalErrors = referenceErrors.get(row.rowNumber) || []
      const allErrors = Array.from(new Set([...row.errors, ...additionalErrors]))
      return allErrors.length
        ? { ...row, input: undefined, errors: allErrors }
        : row
    })
  }

  static async validateCommit(inputs: CreateAssetInput[], access: AccessContext) {
    return validateInputs(inputs.map((input, index) => ({ rowNumber: index + 2, input })), access)
  }

  static async createTemplate(access: AccessContext): Promise<Buffer> {
    const db = getDb()
    const departmentIds = access.allowedDepartmentIds('assets.create')
    const molWhere = departmentIds === null ? undefined : { departmentId: { in: departmentIds } }
    const [mols, groups] = await Promise.all([
      db.mol.findMany({
        where: molWhere,
        select: { code: true, fullName: true, department: true },
        orderBy: { code: 'asc' },
      }),
      db.assetGroup.findMany({
        select: { code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ])

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Consilium'
    workbook.created = new Date()

    const guide = workbook.addWorksheet('Как заполнить')
    guide.columns = [{ width: 100 }]
    guide.addRows([
      ['Импорт имущества'],
      ['Заполните лист «Имущество» и загрузите этот файл в разделе имущества.'],
      [`Допустимо до ${MAX_ASSET_IMPORT_ROWS} строк за один импорт. Пустые строки пропускаются.`],
      ['Все строки должны пройти проверку до записи. Если есть ошибка или дубликат, имущество не будет создано.'],
      ['Коды МОЛ и групп выбирайте из списков или копируйте с листа «Справочники».'],
      ['Цена и количество должны быть положительными и содержать не более двух знаков после запятой.'],
      ['Дату можно указать как дату Excel или в формате ДД.ММ.ГГГГ.'],
      ['Ранее учтённое имущество укажите как «Да» или «Нет». Форма учета: 145 или 367.'],
      ['После загрузки проверьте предварительный просмотр: он показывает ошибки и повторяющиеся номера.'],
    ])
    guide.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF12304A' } }
    guide.getColumn(1).alignment = { wrapText: true, vertical: 'middle' }
    guide.eachRow((row) => { row.height = 30 })

    const sheet = workbook.addWorksheet('Имущество')
    sheet.columns = ASSET_IMPORT_COLUMNS.map((column) => ({
      header: column.label,
      key: column.key,
      width: Math.max(16, Math.min(34, column.label.length + 4)),
    }))
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = {
      from: 'A1',
      to: `${sheet.getColumn(ASSET_IMPORT_COLUMNS.length).letter}${MAX_ASSET_IMPORT_ROWS + 1}`,
    }
    sheet.getRow(1).height = 32
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12304A' } }
    sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle' }
    sheet.getColumn('C').numFmt = '#,##0.00'
    sheet.getColumn('E').numFmt = '#,##0.00'
    sheet.getColumn('H').numFmt = 'dd.mm.yyyy'

    const references = workbook.addWorksheet('Справочники')
    references.columns = [
      { header: 'Код МОЛ', key: 'molCode', width: 18 },
      { header: 'Ответственный', key: 'molName', width: 36 },
      { header: 'Подразделение', key: 'department', width: 34 },
      { header: 'Код группы', key: 'groupCode', width: 18 },
      { header: 'Группа имущества', key: 'groupName', width: 34 },
    ]
    references.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    references.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12304A' } }
    references.addRows(Array.from({ length: Math.max(mols.length, groups.length) }, (_, index) => ({
      molCode: mols[index]?.code || '',
      molName: mols[index]?.fullName || '',
      department: mols[index]?.department || '',
      groupCode: groups[index]?.code || '',
      groupName: groups[index]?.name || '',
    })))

    const molRangeEnd = Math.max(2, mols.length + 1)
    const groupRangeEnd = Math.max(2, groups.length + 1)
    if (mols.length) {
      workbook.definedNames.add(`'Справочники'!$A$2:$A$${molRangeEnd}`, 'MolCodes')
      for (let rowNumber = 2; rowNumber <= MAX_ASSET_IMPORT_ROWS + 1; rowNumber += 1) {
        sheet.getCell(`F${rowNumber}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['=MolCodes'] }
      }
    }
    if (groups.length) {
      workbook.definedNames.add(`'Справочники'!$D$2:$D$${groupRangeEnd}`, 'AssetGroupCodes')
      for (let rowNumber = 2; rowNumber <= MAX_ASSET_IMPORT_ROWS + 1; rowNumber += 1) {
        sheet.getCell(`G${rowNumber}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['=AssetGroupCodes'] }
      }
    }
    for (let rowNumber = 2; rowNumber <= MAX_ASSET_IMPORT_ROWS + 1; rowNumber += 1) {
      sheet.getCell(`M${rowNumber}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Да,Нет"'] }
      sheet.getCell(`N${rowNumber}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"145,367"'] }
    }

    const output = await workbook.xlsx.writeBuffer()
    return Buffer.from(output)
  }
}
