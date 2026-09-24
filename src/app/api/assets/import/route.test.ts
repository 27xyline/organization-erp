import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  parseWorkbook: vi.fn(),
  preview: vi.fn(),
  createTemplate: vi.fn(),
  validateCommit: vi.fn(),
  createMany: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorizeApiRequest }))
vi.mock('@/features/assets/application/asset-import.service', () => ({
  AssetImportService: {
    parseWorkbook: mocks.parseWorkbook,
    preview: mocks.preview,
    createTemplate: mocks.createTemplate,
    validateCommit: mocks.validateCommit,
  },
  MAX_ASSET_IMPORT_ROWS: 100,
  MAX_ASSET_IMPORT_FILE_BYTES: 5 * 1024 * 1024,
}))
vi.mock('@/features/assets/application/asset.service', () => ({
  AssetService: { createMany: mocks.createMany },
}))

import { GET as getTemplate } from './template/route'
import { POST as previewFile } from './preview/route'
import { POST as commitImport } from './commit/route'

const access = { allows: vi.fn(), allowedDepartmentIds: vi.fn() }
const input = {
  name: 'Ноутбук', inventoryNumber: 'INV-1', unitPrice: 1250.5, unitOfMeasure: 'шт', quantity: 2,
  molId: 'mol-1', groupId: 'group-1', projectId: null, contractCode: undefined,
  internalFundingCode: undefined, isExistingAsset: false, recordingDate: '2026-07-16',
  documentType: 'Накладная', documentDetails: '№ 7', documentFiles: [], status: 'IN_STOCK',
  notes: undefined, plannedDisposalDate: undefined, plannedDisposalReason: undefined,
  photos: [], accountingForm: '145',
}

function nextRequest(url: string, body?: BodyInit) {
  return new NextRequest(url, { method: 'POST', ...(body ? { body } : {}) })
}

describe('asset import routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'user-1' }, access, requestId: 'request-1', response: null,
    })
    mocks.parseWorkbook.mockResolvedValue([{ rowNumber: 2, values: {} }])
    mocks.preview.mockResolvedValue([{
      rowNumber: 2,
      inventoryNumber: 'INV-1',
      name: 'Ноутбук',
      molCode: 'M-1',
      groupCode: 'G-1',
      quantity: '2',
      unitPrice: '1250.5',
      unitOfMeasure: 'шт',
      input,
      errors: [],
    }])
    mocks.validateCommit.mockResolvedValue(new Map())
    mocks.createMany.mockResolvedValue(1)
  })

  it('downloads the template only after checking asset-creation access', async () => {
    mocks.createTemplate.mockResolvedValue(Buffer.from('xlsx'))

    const response = await getTemplate(new NextRequest('http://localhost/api/assets/import/template'))

    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(expect.any(Request), 'assets.create')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('asset-import-template.xlsx')
    expect(await response.text()).toBe('xlsx')
  })

  it('requires an .xlsx file and returns the validation preview', async () => {
    const emptyForm = await previewFile(nextRequest('http://localhost/api/assets/import/preview', new FormData()))
    expect(emptyForm.status).toBe(422)
    expect(mocks.parseWorkbook).not.toHaveBeenCalled()

    const request = {
      formData: async () => ({ get: () => ({
        name: 'inventory.xlsx',
        size: 3,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }) }),
    } as unknown as NextRequest
    const response = await previewFile(request)

    expect(response.status, await response.clone().text()).toBe(200)
    expect(mocks.preview).toHaveBeenCalledWith([{ rowNumber: 2, values: {} }], access)
    expect(await response.json()).toEqual({ data: {
      rows: [{
        rowNumber: 2,
        inventoryNumber: 'INV-1',
        name: 'Ноутбук',
        molCode: 'M-1',
        groupCode: 'G-1',
        quantity: '2',
        unitPrice: '1250.5',
        unitOfMeasure: 'шт',
        input,
        errors: [],
      }],
      validCount: 1,
      errorCount: 0,
    } })
  })

  it('revalidates every row and writes the import as one authorized batch', async () => {
    const response = await commitImport(nextRequest(
      'http://localhost/api/assets/import/commit',
      JSON.stringify({ assets: [input] }),
    ))

    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(expect.any(NextRequest), 'assets.create')
    expect(mocks.validateCommit).toHaveBeenCalledWith([expect.objectContaining({ inventoryNumber: 'INV-1' })], access)
    expect(mocks.createMany).toHaveBeenCalledWith([expect.objectContaining({ inventoryNumber: 'INV-1' })], 'user-1', 'request-1')
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { importedCount: 1, inventoryNumbers: ['INV-1'] } })
  })

  it('requires a new preview when access, catalogs, or inventory numbers changed', async () => {
    mocks.validateCommit.mockResolvedValue(new Map([[2, ['Инвентарный номер уже используется']]]))

    const response = await commitImport(nextRequest(
      'http://localhost/api/assets/import/commit',
      JSON.stringify({ assets: [input] }),
    ))

    expect(response.status).toBe(409)
    expect(mocks.createMany).not.toHaveBeenCalled()
  })
})
