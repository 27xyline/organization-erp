import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  proxy: vi.fn(),
  stream: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ authorizeApiRequest: mocks.authorize }))
vi.mock('@/lib/backend/documents', () => ({
  proxyDocumentRequest: mocks.proxy,
  proxyDocumentStream: mocks.stream,
}))

const user = { id: 'user-1', sessionVersion: 2 }
const ok = () => new Response(JSON.stringify({ data: { id: 'doc-1' } }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})

describe('documents BFF route mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ user, requestId: 'req-1' })
    mocks.proxy.mockImplementation(async (request: Request, path: string) => {
      return new Response(JSON.stringify({ data: { method: request.method, path } }), { status: 200 })
    })
    mocks.stream.mockResolvedValue(ok())
  })

  it('validates the list query then proxies the original path', async () => {
    const { GET } = await import('./route')
    const invalid = new NextRequest('http://erp.test/api/documents?page=0')
    expect((await GET(invalid)).status).toBe(422)
    expect(mocks.proxy).not.toHaveBeenCalled()

    const request = new NextRequest('http://erp.test/api/documents?page=2&projectId=p1')
    const response = await GET(request)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'documents.read')
    expect(mocks.proxy).toHaveBeenCalledWith(request, '/api/documents?page=2&projectId=p1', user, 'req-1')
    expect(response.status).toBe(200)
  })

  it('passes the untouched document upload request to the streaming proxy', async () => {
    const { POST } = await import('./route')
    const request = new NextRequest('http://erp.test/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/pdf', 'x-document-metadata': 'eyJ0aXRsZSI6IngifQ' },
      body: new Uint8Array([0, 255, 1]),
    })
    const response = await POST(request)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'documents.create')
    expect(mocks.stream).toHaveBeenCalledWith(request, '/api/documents', user, 'req-1')
    expect(response.status).toBe(200)
  })

  it('routes options to its typed backend endpoint', async () => {
    const { GET } = await import('./options/route')
    const path = '/api/documents/options'
    const request = new NextRequest(`http://erp.test${path}`)
    const response = await GET(request)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'documents.create')
    expect(mocks.proxy).toHaveBeenCalledWith(request, path, user, 'req-1')
    expect(response.status).toBe(200)
  })

  it('routes generate to its typed backend endpoint', async () => {
    const { POST } = await import('./generate/route')
    const path = '/api/documents/generate'
    const request = new NextRequest(`http://erp.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        template: 'PERSONNEL_ORDER', title: 'Test', number: 'T-1', date: '2026-01-01',
        subject: 'Test subject', details: 'Test details',
      }),
    })
    const response = await POST(request)
    expect(mocks.authorize).toHaveBeenCalledWith(request, 'documents.create')
    expect(mocks.proxy).toHaveBeenCalledWith(request, path, user, 'req-1')
    expect(response.status).toBe(200)
  })

  it('routes detail, status, version, archive and download to matching backend paths', async () => {
    const id = 'doc-1'
    const context = { params: Promise.resolve({ id }) }
    const detail = await import('./[id]/route')
    const versions = await import('./[id]/versions/route')
    const archive = await import('./[id]/archive/route')
    const download = await import('./[id]/download/route')
    const get = new NextRequest(`http://erp.test/api/documents/${id}`)
    await detail.GET(get, context)
    expect(mocks.proxy).toHaveBeenCalledWith(get, `/api/documents/${id}`, user, 'req-1')

    const patch = new NextRequest(`http://erp.test/api/documents/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'IN_REVIEW', lockVersion: 1 }),
    })
    await detail.PATCH(patch, context)
    expect(mocks.proxy).toHaveBeenCalledWith(patch, `/api/documents/${id}`, user, 'req-1')

    const version = new NextRequest(`http://erp.test/api/documents/${id}/versions`, {
      method: 'POST', headers: { 'content-type': 'application/pdf', 'x-document-metadata': 'eyJmaWxlbmFtZSI6ImEucGRmIn0' },
      body: new Uint8Array([1, 2]),
    })
    await versions.POST(version, context)
    expect(mocks.stream).toHaveBeenCalledWith(version, `/api/documents/${id}/versions`, user, 'req-1')

    const archiveRequest = new NextRequest(`http://erp.test/api/documents/${id}/archive`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lockVersion: 1 }),
    })
    await archive.POST(archiveRequest, context)
    expect(mocks.proxy).toHaveBeenCalledWith(archiveRequest, `/api/documents/${id}/archive`, user, 'req-1')

    const downloadRequest = new NextRequest(`http://erp.test/api/documents/${id}/download?version=2`)
    await download.GET(downloadRequest, context)
    expect(mocks.stream).toHaveBeenCalledWith(downloadRequest, `/api/documents/${id}/download?version=2`, user, 'req-1')
  })
})
