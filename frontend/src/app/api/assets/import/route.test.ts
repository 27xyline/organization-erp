import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), proxy: vi.fn() }))
vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/assets', () => ({ proxyAssetRequest: mocks.proxy }))

import { GET as getTemplate } from './template/route'
import { POST as previewFile } from './preview/route'
import { POST as commitImport } from './commit/route'

const input = {
  name: 'Ноутбук', inventoryNumber: 'INV-1', unitPrice: 1250.5, unitOfMeasure: 'шт', quantity: 2,
  molId: 'mol-1', groupId: 'group-1', projectId: null, isExistingAsset: false, recordingDate: '2026-07-16',
  documentType: 'Накладная', documentDetails: '№ 7', documentFiles: [], status: 'IN_STOCK',
  photos: [], accountingForm: '145',
}

describe('asset import BFF', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorize.mockResolvedValue({
      user: { id: 'user-1', sessionVersion: 1 },
      requestId: 'request-1', response: null,
    })
    mocks.proxy.mockResolvedValue(Response.json({ data: { ok: true } }, { status: 201 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('checks create permission before proxying the binary template download', async () => {
    const request = new NextRequest('http://localhost/api/assets/import/template')
    await getTemplate(request)

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'assets.create')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/import/template', expect.anything(), 'request-1')
  })

  it('checks multipart presence, extension, and size before forwarding the untouched upload', async () => {
    const emptyForm = new FormData()
    const emptyResponse = await previewFile(new NextRequest('http://localhost/api/assets/import/preview', {
      method: 'POST', body: emptyForm,
    }))
    expect(emptyResponse.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const form = new FormData()
    form.append('file', new File(['xlsx-content'], 'inventory.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }))
    const request = new NextRequest('http://localhost/api/assets/import/preview', { method: 'POST', body: form })
    Object.defineProperty(request, 'clone', {
      value: () => ({
        formData: async () => ({
          get: () => ({ name: 'inventory.xlsx', size: 11, arrayBuffer: async () => new ArrayBuffer(11) }),
        }),
      }),
    })
    const response = await previewFile(request)

    expect(response.status).toBe(201)
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/import/preview', expect.anything(), 'request-1')
    expect(request.bodyUsed).toBe(false)
    expect(request.headers.get('content-type')).toContain('multipart/form-data; boundary=')
  })

  it('validates rows before forwarding commit to Python', async () => {
    const request = new NextRequest('http://localhost/api/assets/import/commit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assets: [input] }),
    })
    const response = await commitImport(request)

    expect(mocks.authorize).toHaveBeenCalledWith(request, 'assets.create')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/import/commit', expect.anything(), 'request-1')
    expect(await request.json()).toEqual({ assets: [input] })
    expect(response.status).toBe(201)
  })

  it('forwards validated import rows for authoritative Python scope checks', async () => {
    const second = { ...input, inventoryNumber: 'INV-2', molId: 'mol-2' }
    const request = new NextRequest('http://localhost/api/assets/import/commit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assets: [input, second] }),
    })
    await commitImport(request)

    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/assets/import/commit', expect.anything(), 'request-1')
  })

  it('preserves Python resource-scope denials', async () => {
    mocks.proxy.mockResolvedValueOnce(Response.json({ error: 'Forbidden' }, { status: 403 }))
    const request = new NextRequest('http://localhost/api/assets/import/commit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assets: [input] }),
    })
    const response = await commitImport(request)

    expect(response.status).toBe(403)
    expect(mocks.proxy).toHaveBeenCalled()
  })

  it('rejects malformed commit input before reaching Python', async () => {
    const response = await commitImport(new NextRequest('http://localhost/api/assets/import/commit', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assets: [] }),
    }))

    expect(response.status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()
  })
})
