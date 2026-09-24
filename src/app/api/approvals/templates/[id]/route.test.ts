import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  updateTemplate: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: mocks.authorizeApiRequest,
}))

vi.mock('@/features/approvals/application/approval.service', () => ({
  getApprovalService: () => ({ updateTemplate: mocks.updateTemplate }),
}))

import { PATCH } from './route'

describe('approvals/templates/[id] route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({ user: { id: 'admin-1' }, response: null })
  })

  it('updates template status through the manager-only endpoint', async () => {
    const template = { id: 'template-1', name: 'Закупка', isActive: false }
    mocks.updateTemplate.mockResolvedValueOnce(template)
    const request = new NextRequest('http://localhost/api/approvals/templates/template-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'template-1' }) })

    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(request, 'approvals.templates.manage')
    expect(mocks.updateTemplate).toHaveBeenCalledWith('template-1', { isActive: false }, 'admin-1', undefined)
    expect(await response.json()).toEqual({ data: template })
  })

  it('rejects an empty patch without mutating the template', async () => {
    const response = await PATCH(new NextRequest('http://localhost/api/approvals/templates/template-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: 'template-1' }) })

    expect(response.status).toBe(422)
    expect(mocks.updateTemplate).not.toHaveBeenCalled()
  })
})
