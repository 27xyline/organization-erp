import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  listTemplates: vi.fn(),
  createTemplate: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: mocks.authorizeApiRequest,
}))

vi.mock('@/features/approvals/application/approval.service', () => ({
  getApprovalService: () => ({
    listTemplates: mocks.listTemplates,
    createTemplate: mocks.createTemplate,
  }),
}))

import { GET, POST } from './route'

describe('approvals/templates route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'admin-1', permissions: ['approvals.create'] },
      response: null,
    })
  })

  it('returns active templates to requesters and archived ones only to managers', async () => {
    mocks.listTemplates.mockResolvedValueOnce([{ id: 'active' }])
    const requesterResponse = await GET(new NextRequest('http://localhost/api/approvals/templates'))
    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { anyOf: ['approvals.create', 'approvals.templates.manage'] },
    )
    expect(mocks.listTemplates).toHaveBeenLastCalledWith(false)
    expect(await requesterResponse.json()).toEqual({ data: [{ id: 'active' }] })

    mocks.authorizeApiRequest.mockResolvedValueOnce({
      user: { id: 'admin-1', permissions: ['approvals.create', 'approvals.templates.manage'] },
      response: null,
    })
    mocks.listTemplates.mockResolvedValueOnce([{ id: 'active' }, { id: 'archived', isActive: false }])
    const managerResponse = await GET(new NextRequest('http://localhost/api/approvals/templates'))
    expect(mocks.listTemplates).toHaveBeenLastCalledWith(true)
    expect((await managerResponse.json()).data).toHaveLength(2)
  })

  it('allows only template managers to create a route', async () => {
    const template = { id: 'template-1', name: 'Закупка' }
    mocks.authorizeApiRequest.mockResolvedValueOnce({
      user: { id: 'admin-1', permissions: ['approvals.templates.manage'] },
      response: null,
    })
    mocks.createTemplate.mockResolvedValueOnce(template)
    const request = new NextRequest('http://localhost/api/approvals/templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Закупка',
        steps: [{ name: 'Руководитель', approverId: 'user-1' }],
      }),
    })

    const response = await POST(request)

    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(request, 'approvals.templates.manage')
    expect(mocks.createTemplate).toHaveBeenCalledWith({
      name: 'Закупка',
      steps: [{ name: 'Руководитель', approverId: 'user-1' }],
    }, 'admin-1', undefined)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: template })
  })

  it('rejects duplicate approvers before asking the service to create a template', async () => {
    mocks.authorizeApiRequest.mockResolvedValueOnce({
      user: { id: 'admin-1', permissions: ['approvals.templates.manage'] },
      response: null,
    })
    const response = await POST(new NextRequest('http://localhost/api/approvals/templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Закупка',
        steps: [
          { name: 'Руководитель', approverId: 'user-1' },
          { name: 'Финансы', approverId: 'user-1' },
        ],
      }),
    }))

    expect(response.status).toBe(422)
    expect(mocks.createTemplate).not.toHaveBeenCalled()
  })
})
