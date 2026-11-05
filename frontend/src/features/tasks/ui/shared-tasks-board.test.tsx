import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { SharedTasksBoard } from './shared-tasks-board'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
describe('shared tasks board', () => {
  it('shows assigned tasks without a forbidden project link', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<SharedTasksBoard tasks={[{ id: 't1', name: 'Моя задача', status: 'IN_PROGRESS', projectId: 'p1', canReadProject: false, assignees: [] }]} canManage={false} projects={[]} assignees={[]} />))
    expect(container.textContent).toContain('Моя задача')
    expect(container.textContent).toContain('В работе')
    expect(container.querySelector('a')).toBeNull()
    await act(async () => root.unmount())
  })
})

it('sends an assigned status change through the restricted endpoint', async () => {
  const fetchMock = vi.fn(async () => Response.json({ data: { id: 't1', status: 'COMPLETED' } }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(<SharedTasksBoard tasks={[{ id: 't1', name: 'Моя задача', status: 'IN_PROGRESS', projectId: null, canReadProject: false, assignees: [{ employeeId: 'e1', fullName: 'Сотрудник' }] }]} canManage={false} employeeId="e1" projects={[]} assignees={[]} />))
  const select = container.querySelector('select')!
  await act(async () => { select.value = 'COMPLETED'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(fetchMock).toHaveBeenCalledWith('/api/tasks/t1/status', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) }))
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

it('creates a general task with selected employees', async () => {
  const fetchMock = vi.fn(async () => Response.json({ data: { id: 'new' } }, { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(<SharedTasksBoard tasks={[]} canManage projects={[]} assignees={[{ id: 'e1', fullName: 'Сотрудник' }]} />))
  const open = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Новая задача')!
  await act(async () => open.click())
  const name = container.querySelector<HTMLInputElement>('input[name="name"]')!
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  await act(async () => { name.value = 'Подготовка'; name.dispatchEvent(new Event('input', { bubbles: true })); checkbox.click() })
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(fetchMock).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"employeeIds":["e1"]') }))
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})
