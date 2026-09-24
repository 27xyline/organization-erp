import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetInventoryScanClient } from './asset-inventory-scan-client'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

let root: Root
let host: HTMLDivElement

describe('AssetInventoryScanClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
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

  it('submits zero as a checked physical count and opens the inventory record', async () => {
    const entry = {
      id: 'entry-1', inventoryNumber: 'INV-7', assetName: 'Монитор',
      unitOfMeasure: 'шт.', expectedQuantity: '1.00', foundQuantity: null, note: null,
      inventory: {
        id: 'inventory-1', name: 'Проверка кабинета',
        mol: { id: 'mol-1', code: 'M-1', fullName: 'Иван Петров', departmentId: 'department-1' },
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [entry] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'entry-1' } })))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'setTimeout').mockImplementation((handler) => {
      if (typeof handler === 'function') handler()
      return 1 as unknown as ReturnType<typeof window.setTimeout>
    })

    await act(async () => {
      root.render(<AssetInventoryScanClient inventoryNumber="INV-7" />)
      await Promise.resolve()
    })
    const quantity = document.querySelector<HTMLInputElement>('#scan-found-quantity')
    expect(quantity).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(quantity, '0')
      quantity?.dispatchEvent(new Event('input', { bubbles: true }))
      quantity?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const form = document.querySelector<HTMLFormElement>('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/assets/inventories/inventory-1/scan')
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      inventoryNumber: 'INV-7', foundQuantity: '0',
    })
    expect(document.body).toHaveTextContent('Учётный остаток не изменён')
    expect(push).toHaveBeenCalledWith('/assets/inventory/inventory-1')
  })
})
