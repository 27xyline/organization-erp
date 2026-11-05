import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { FinderSidebar } from './finder-sidebar'
vi.mock('next/navigation', () => ({ usePathname: () => '/tasks' }))
vi.mock('@/features/notifications/ui/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/features/search/ui/global-search-provider', () => ({ GlobalSearchButton: () => null }))
describe('workflows navigation', () => {
  it('groups tasks and projects and keeps their separate permissions', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<FinderSidebar currentUser={{ name: 'User', roles: ['EMPLOYEE'], permissions: ['tasks.read'] }} />))
    expect(container.textContent).toContain('Рабочие процессы')
    expect(container.querySelector('a[href="/tasks"]')).not.toBeNull()
    expect(container.querySelector('a[href="/projects"]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('shows only projects and tasks in the workflows menu', async () => {
    const fetchProjects = vi.fn(async () => Response.json({ data: [{ id: 'project-1', name: 'Проект' }] }))
    vi.stubGlobal('fetch', fetchProjects)
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<FinderSidebar currentUser={{ name: 'User', roles: ['ADMIN'], permissions: ['projects.read', 'tasks.read'] }} />))
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/projects"], a[href="/tasks"]')]
    expect(links.map((link) => [link.getAttribute('href'), link.textContent])).toEqual([
      ['/projects', 'Проекты'],
      ['/tasks', 'Задачи'],
    ])
    expect(fetchProjects).not.toHaveBeenCalled()
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  })
})

it('shows the same workflows group in mobile navigation', async () => {
  const { MobileNavigation } = await import('./mobile-navigation')
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<MobileNavigation currentUser={{ name: 'User', roles: ['EMPLOYEE'], permissions: ['tasks.read'] }} />))
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Открыть меню"]')!
  await act(async () => trigger.click())
  expect(document.body.textContent).toContain('Рабочие процессы')
  expect(document.body.querySelector('a[href="/tasks"]')).not.toBeNull()
  expect(document.body.querySelector('a[href="/projects"]')).toBeNull()
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
