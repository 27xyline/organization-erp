import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetImportDialog } from './asset-import-dialog'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: { success: toastSuccess, error: vi.fn(), info: vi.fn(), warning: vi.fn() } }),
}))
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

const input = {
  name: 'Ноутбук', inventoryNumber: 'INV-1', unitPrice: 1250.5, unitOfMeasure: 'шт', quantity: 2,
  molId: 'mol-1', groupId: 'group-1', recordingDate: '2026-07-16', documentType: 'Накладная',
  documentDetails: '№ 7', status: 'IN_STOCK', accountingForm: '145',
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { data } : { error: { message: 'Нужно проверить файл повторно' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let root: Root | undefined
let host: HTMLDivElement

function button(label: string) {
  const found = Array.from(document.querySelectorAll('button'))
    .find((item) => item.textContent?.replace(/\s+/g, ' ').trim() === label)
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function chooseFile() {
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!fileInput) throw new Error('File input not found')
  Object.defineProperty(fileInput, 'files', {
    configurable: true,
    value: [new File(['xlsx'], 'assets.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })],
  })
  await act(async () => {
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('AssetImportDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    refresh.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = undefined
    host.remove()
    document.body.innerHTML = ''
  })

  it('previews all rows before allowing an all-or-nothing import', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ rows: [
      { rowNumber: 2, inventoryNumber: 'INV-1', name: 'Ноутбук', molCode: 'M-1', groupCode: 'G-1', quantity: '2', unitPrice: '1250.5', unitOfMeasure: 'шт', input, errors: [] },
      { rowNumber: 3, inventoryNumber: 'INV-2', name: 'Монитор', molCode: 'M-1', groupCode: 'G-1', quantity: '1', unitPrice: '100', unitOfMeasure: 'шт', errors: ['Инвентарный номер уже используется'] },
    ], validCount: 1, errorCount: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => root?.render(<AssetImportDialog onImported={refresh} />))

    await click(button('Импорт Excel'))
    await chooseFile()
    await click(button('Проверить файл'))

    expect(document.body.textContent).toContain('Инвентарный номер уже используется')
    expect(button('Создать 1 объект').disabled).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/assets/import/preview', expect.objectContaining({ method: 'POST' }))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('commits only after a clean preview and refreshes the list after success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        rows: [{ rowNumber: 2, inventoryNumber: 'INV-1', name: 'Ноутбук', molCode: 'M-1', groupCode: 'G-1', quantity: '2', unitPrice: '1250.5', unitOfMeasure: 'шт', input, errors: [] }],
        validCount: 1,
        errorCount: 0,
      }))
      .mockResolvedValueOnce(response({ importedCount: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => root?.render(<AssetImportDialog onImported={refresh} />))

    await click(button('Импорт Excel'))
    await chooseFile()
    await click(button('Проверить файл'))
    expect(document.body.textContent).toContain('Готово к созданию')
    await click(button('Создать 1 объект'))

    expect(refresh).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/assets/import/commit')
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({ assets: [input] })
  })
})
