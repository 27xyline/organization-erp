import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), user: { roles: ['EMPLOYEE'], employeeId: 'e1', access: { has: (): boolean => false, allows: (): boolean => false } } }))
vi.mock('@/lib/auth/authorization', () => ({ requirePagePermission: vi.fn(async () => mocks.user) }))
vi.mock('@/lib/backend/transport', () => ({ backendUserFetch: mocks.fetch }))
describe('tasks page', () => {
  beforeEach(() => { mocks.fetch.mockReset(); mocks.user.roles = ['EMPLOYEE']; mocks.user.access = { has: (): boolean => false, allows: (): boolean => false } })
  it('loads the inbox without asking an employee for management data', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ data: [] }))
    const { default: Page } = await import('./page')
    const page = await Page()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.fetch).toHaveBeenCalledWith('/api/tasks', expect.anything())
    expect(page.props.canManage).toBe(false)
  })
  it('loads all pages of manageable projects', async () => {
    mocks.user.roles = ['PROJECT_MANAGER']
    mocks.user.access = { has: () => true, allows: () => true }
    mocks.fetch.mockImplementation(async (url: string) => url.includes('/api/projects')
      ? Response.json({ data: [{ id: url.includes('page=2') ? 'p2' : 'p1', name: 'Проект' }], pagination: { totalPages: 2 } })
      : Response.json({ data: [] }))
    const { default: Page } = await import('./page')
    const page = await Page()
    expect(page.props.projects.map((project: { id: string }) => project.id)).toEqual(['p1', 'p2'])
  })
})
