import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/lib/auth/permissions'
import { GlobalSearchButton, GlobalSearchProvider } from './global-search-provider'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

let root: Root | undefined
let host: HTMLDivElement

function findButton(label: string) {
  const result = Array.from(document.querySelectorAll('button'))
    .find((button) => button.textContent?.replace(/\s+/g, ' ').includes(label))
  if (!result) throw new Error(`Button not found: ${label}`)
  return result
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function renderSearch(permissions: Permission[] = ['employees.read']) {
  await act(async () => root?.render(
    <GlobalSearchProvider permissions={permissions}>
      <GlobalSearchButton />
    </GlobalSearchProvider>,
  ))
}

describe('GlobalSearchProvider', () => {
  beforeEach(() => {
    push.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = undefined
    host.remove()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('opens from the launcher and searches scoped results with arrow keys and Enter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      id: 'employee-1',
      type: 'employee',
      title: 'Анна Смирнова',
      subtitle: 'Табельный № E-7 · Финансы',
      href: '/employees/employee-1',
    }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await renderSearch()

    await click(findButton('Поиск по системе'))
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Поиск по системе"]')
    expect(input).not.toBeNull()
    if (!input) throw new Error('Search input not found')
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setValue?.call(input, 'Анна')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => new Promise((resolve) => setTimeout(resolve, 280)))

    expect(fetchMock).toHaveBeenCalledWith('/api/search?q=%D0%90%D0%BD%D0%BD%D0%B0', expect.objectContaining({ cache: 'no-store' }))
    expect(document.body.textContent).toContain('Анна Смирнова')
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    })
    expect(push).toHaveBeenCalledWith('/employees/employee-1')
    expect(document.querySelector('input[aria-label="Поиск по системе"]')).toBeNull()
  })

  it('opens with the system shortcut and hides the launcher without searchable permissions', async () => {
    await renderSearch([])
    expect(document.querySelector('button')).toBeNull()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'k', metaKey: true }))
    })
    expect(document.querySelector('input[aria-label="Поиск по системе"]')).toBeNull()

    await renderSearch(['projects.read'])
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'k', ctrlKey: true }))
    })
    expect(document.querySelector('input[aria-label="Поиск по системе"]')).not.toBeNull()
  })
})
