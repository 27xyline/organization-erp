import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetInventoryListClient } from './asset-inventory-list-client'

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

const mol = {
  id: 'mol-1', code: 'MOL-1', fullName: 'Иван Петров', storageLocation: 'Кабинет 204',
  departmentId: 'department-1', department: 'Администрация',
}
const inventory = {
  id: 'inventory-1', name: 'Проверка кабинета', status: 'IN_PROGRESS',
  createdAt: '2026-09-24T10:00:00.000Z', completedAt: null,
  mol, createdBy: { id: 'user-1', name: 'Анна' }, _count: { entries: 42 },
}

let root: Root
let host: HTMLDivElement

function button(label: string) {
  const result = Array.from(document.querySelectorAll('button'))
    .find((item) => item.getAttribute('aria-label') === label || item.textContent?.replace(/\s+/g, ' ').trim() === label)
  if (!result) throw new Error(`Кнопка не найдена: ${label}`)
  return result
}

async function waitForText(text: string) {
  await act(async () => {
    const deadline = Date.now() + 1000
    while (!document.body.textContent?.includes(text) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    }
  })
}

describe('AssetInventoryListClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('renders a newly created inventory with its entry count', async () => {
    let created = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/options')) return new Response(JSON.stringify({ data: [mol] }))
      if (init?.method === 'POST') {
        created = true
        return new Response(JSON.stringify({ data: inventory }), { status: 201 })
      }
      return new Response(JSON.stringify({ data: created ? [inventory] : [], pagination: { page: 1, pageSize: 50, total: created ? 1 : 0, totalPages: 1 } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => root.render(<AssetInventoryListClient />))
    await waitForText('Пока нет инвентаризаций')

    await act(async () => button('Новая инвентаризация').click())
    const name = document.querySelector<HTMLInputElement>('#asset-inventory-name')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(name, 'Проверка кабинета')
      name.dispatchEvent(new Event('input', { bubbles: true }))
      name.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const form = document.querySelector<HTMLFormElement>('[role="dialog"] form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    await waitForText('42 позиций')
    expect(fetchMock).toHaveBeenCalledWith('/api/assets/inventories', expect.objectContaining({ method: 'POST' }))
    expect(document.body).toHaveTextContent('Проверка кабинета')
  })

  it('loads the next page when more than fifty inventories exist', async () => {
    const secondInventory = { ...inventory, id: 'inventory-51', name: 'Проверка склада' }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/options')) return new Response(JSON.stringify({ data: [mol] }))
      if (url.includes('page=2')) {
        return new Response(JSON.stringify({
          data: [secondInventory],
          pagination: { page: 2, pageSize: 50, total: 51, totalPages: 2 },
        }))
      }
      return new Response(JSON.stringify({
        data: [inventory],
        pagination: { page: 1, pageSize: 50, total: 51, totalPages: 2 },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await act(async () => root.render(<AssetInventoryListClient />))
    await waitForText('Проверка кабинета')
    expect(document.body).toHaveTextContent('Страница 1 из 2')

    await act(async () => button('Следующая страница').click())
    await waitForText('Проверка склада')

    expect(fetchMock).toHaveBeenCalledWith('/api/assets/inventories?page=2&pageSize=50')
    expect(document.body).toHaveTextContent('Страница 2 из 2')
  })

  it('shows a retry state instead of an empty state when loading fails', async () => {
    let attempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/options')) return new Response(JSON.stringify({ data: [] }))
      attempts += 1
      if (attempts === 1) return new Response(JSON.stringify({ error: { message: 'Не удалось загрузить инвентаризации' } }), { status: 500 })
      return new Response(JSON.stringify({ data: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 } }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await act(async () => root.render(<AssetInventoryListClient />))
    await waitForText('Не удалось загрузить инвентаризации')

    expect(document.body).toHaveTextContent('Список недоступен')
    expect(document.body).not.toHaveTextContent('Пока нет инвентаризаций')
    await act(async () => button('Повторить загрузку').click())
    await waitForText('Пока нет инвентаризаций')
    expect(attempts).toBe(2)
  })
})
