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

it('resets the form when switching tasks and creating a new one', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div'); const root = createRoot(container)
  const tasks = ['Первый', 'Второй'].map((name, i) => ({ id: String(i), name, status: 'NOT_STARTED' as const, projectId: null, canReadProject: false, assignees: [] }))
  await act(async () => root.render(<SharedTasksBoard tasks={tasks} canManage projects={[]} assignees={[]} />))
  const edits = container.querySelectorAll<HTMLButtonElement>('article button:first-child')
  await act(async () => edits[0].click())
  expect(container.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('Первый')
  await act(async () => edits[1].click())
  expect(container.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('Второй')
  await act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Новая задача')!.click())
  expect(container.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('')
  await act(async () => root.unmount()); vi.unstubAllGlobals()
})

it('ignores a late response for a previously selected project', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let resolveA!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/a/') ? new Promise<Response>(r => { resolveA = r }) : Promise.resolve(Response.json({ members: [{ employeeId: 'b', employee: { fullName: 'Бета' } }] }))))
  const container = document.createElement('div'); const root = createRoot(container)
  await act(async () => root.render(<SharedTasksBoard tasks={[]} canManage projects={[{ id: 'a', name: 'А' }, { id: 'b', name: 'Б' }]} assignees={[]} />))
  await act(async () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Новая задача')!.click())
  const select = container.querySelector<HTMLSelectElement>('form select')!
  await act(async () => { select.value = 'a'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  await act(async () => { select.value = 'b'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  await act(async () => resolveA(Response.json({ members: [{ employeeId: 'a', employee: { fullName: 'Альфа' } }] })))
  expect(container.textContent).toContain('Бета')
  expect(container.textContent).not.toContain('Альфа')
  await act(async () => root.unmount()); vi.unstubAllGlobals()
})

it('shows an inactive existing assignee and allows removing them', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const fetchMock = vi.fn(async () => Response.json({ data: {} }))
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div'); const root = createRoot(container)
  await act(async () => root.render(<SharedTasksBoard tasks={[{ id: 't', name: 'Задача', status: 'NOT_STARTED', isGeneral: true, canReadProject: false, assignees: [{ employeeId: 'inactive', fullName: 'Бывший', active: false }] }]} canManage projects={[]} assignees={[]} />))
  await act(async () => container.querySelector<HTMLButtonElement>('article button')!.click())
  expect(container.textContent).toContain('Бывший (неактивен)')
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  expect(checkbox.checked).toBe(true)
  await act(async () => checkbox.click())
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(fetchMock).toHaveBeenCalledWith('/api/tasks/t', expect.objectContaining({ body: expect.stringContaining('"employeeIds":[]') }))
  await act(async () => root.unmount()); vi.unstubAllGlobals()
})


it('prevents switching forms while a save is pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let resolveSave!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveSave = resolve })))
  const container = document.createElement('div'); const root = createRoot(container)
  const tasks = ['Первый', 'Второй'].map((name, i) => ({ id: String(i), name, status: 'NOT_STARTED' as const, projectId: null, canReadProject: false, assignees: [] }))
  await act(async () => root.render(<SharedTasksBoard tasks={tasks} canManage projects={[]} assignees={[]} />))
  await act(async () => container.querySelector<HTMLButtonElement>('article button')!.click())
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  const buttons = Array.from(container.querySelectorAll('button'))
  expect(buttons.find(b => b.textContent === 'Новая задача')!.disabled).toBe(true)
  expect(buttons.filter(b => b.textContent === 'Изменить').every(b => b.disabled)).toBe(true)
  expect(buttons.find(b => b.textContent === 'Отмена')!.disabled).toBe(true)
  await act(async () => resolveSave(Response.json({ data: {} })))
  await act(async () => root.unmount()); vi.unstubAllGlobals()
})
