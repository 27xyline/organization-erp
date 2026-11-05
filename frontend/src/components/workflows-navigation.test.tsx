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
    await act(async () => root.render(<FinderSidebar currentUser={{ name: 'User', roles: ['EMPLOYEE'], permissions: ['tasks.read'], accessKey: 'a' }} />))
    expect(container.textContent).toContain('Рабочие процессы')
    expect(container.querySelector('a[href="/tasks"]')).not.toBeNull()
    expect(container.querySelector('a[href="/projects"]')).toBeNull()
    await act(async () => root.unmount())
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
