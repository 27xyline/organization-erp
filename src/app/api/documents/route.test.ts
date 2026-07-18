import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const service = {
  list: vi.fn(),
  create: vi.fn(),
}

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN' },
    requestId: 'request-1',
  })),
}))

vi.mock('@/features/documents/application/document.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/documents/application/document.service')
  >('@/features/documents/application/document.service')
  return { ...actual, getDocumentService: () => service }
})

describe('documents route validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid page before querying documents', async () => {
    const { GET } = await import('./route')
    const response = await GET(new NextRequest('http://localhost/api/documents?page=0'))
    expect(response.status).toBe(422)
    expect(service.list).not.toHaveBeenCalled()
  })

  it('requires encoded metadata for a binary upload', async () => {
    const { POST } = await import('./route')
    const response = await POST(new NextRequest('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/pdf' },
      body: 'pdf',
    }))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'MISSING_METADATA' },
    })
    expect(service.create).not.toHaveBeenCalled()
  })
})
