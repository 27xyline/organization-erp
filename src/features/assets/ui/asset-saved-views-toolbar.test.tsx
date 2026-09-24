import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetSavedViewsToolbar } from './asset-saved-views-toolbar'

function buttonStartingWith(text: string) {
  const button = Array.from(document.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim().startsWith(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

describe('AssetSavedViewsToolbar', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const apply = vi.fn()
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', fetchMock)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  async function renderToolbar() {
    await act(async () => root.render(
      <AssetSavedViewsToolbar
        initialViews={[]}
        currentFilters={{ search: 'Ноутбук', status: 'UNDER_REPAIR' }}
        onApply={apply}
      />,
    ))
  }

  async function waitForText(text: string) {
    await act(async () => {
      const deadline = Date.now() + 1000
      while (!document.body.textContent?.includes(text) && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 10))
      }
    })
    expect(document.body).toHaveTextContent(text)
  }

  it('saves the current filters, applies the saved view, and deletes it', async () => {
    const savedView = {
      id: 'view-1',
      name: 'На ремонте',
      filters: { search: 'Ноутбук', status: 'UNDER_REPAIR' },
    }
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: savedView }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)
    await renderToolbar()

    await act(async () => buttonStartingWith('Сохранить фильтры').click())
    const nameInput = document.querySelector<HTMLInputElement>('#asset-saved-view-name')
    expect(nameInput).not.toBeNull()
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(nameInput, 'На ремонте')
      nameInput?.dispatchEvent(new Event('input', { bubbles: true }))
      nameInput?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const saveButton = document.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')
    expect(saveButton).toBeEnabled()
    await act(async () => saveButton!.click())

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/assets/saved-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'На ремонте',
        filters: { search: 'Ноутбук', status: 'UNDER_REPAIR' },
      }),
    })
    await waitForText('Представление сохранено')
    await act(async () => buttonStartingWith('Применить').click())
    expect(apply).toHaveBeenCalledWith(savedView.filters)

    const deleteButton = document.querySelector<HTMLButtonElement>('[aria-label="Удалить выбранный вид"]')
    expect(deleteButton).toBeEnabled()
    await act(async () => deleteButton!.click())
    await waitForText('Представление удалено')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/assets/saved-views/view-1', { method: 'DELETE' })
    expect(document.body).toHaveTextContent('Нет сохранённых видов')
  })
})
