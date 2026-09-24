import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApprovalsPageClient } from './approvals-page-client'

const firstRequest = {
  id: 'approval-1',
  title: 'Первая заявка',
  description: null,
  status: 'PENDING' as const,
  currentStep: 1,
  dueAt: null,
  requestedById: 'author-1',
  requestedBy: { id: 'author-1', name: 'Автор' },
  document: null,
  project: null,
  steps: [{
    id: 'step-1',
    sequence: 1,
    name: 'Руководитель',
    status: 'PENDING' as const,
    comment: null,
    approverId: 'approver-1',
    approver: { id: 'approver-1', name: 'Согласующий' },
  }],
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

describe('ApprovalsPageClient', () => {
  const fetchMock = vi.fn<typeof fetch>()
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

  async function renderPage(currentUserId = 'author-1') {
    await act(async () => {
      root.render(
        <ApprovalsPageClient
          currentUserId={currentUserId}
          canCreate={false}
          canDecide
          canCancel
        />,
      )
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
  }

  async function waitForText(text: string) {
    await act(async () => {
      const deadline = Date.now() + 1000
      while (!container.textContent?.includes(text) && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 10))
      }
    })
    expect(container).toHaveTextContent(text)
  }

  it('does not reject a request when the rejection prompt is dismissed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      data: [firstRequest],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }))
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    await renderPage('approver-1')
    await waitForText('Первая заявка')

    const rejectButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Отклонить'))
    expect(rejectButton).toBeDefined()
    await act(async () => rejectButton!.click())

    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).includes('/decision') && init?.method === 'POST'
    )).toBe(false)
  })

  it('loads the next page using server pagination metadata', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      const secondPage = url.includes('page=2')
      return jsonResponse({
        data: secondPage ? [{ ...firstRequest, id: 'approval-2', title: 'Вторая заявка' }] : [firstRequest],
        pagination: { page: secondPage ? 2 : 1, pageSize: 20, total: 21, totalPages: 2 },
      })
    })
    await renderPage()
    await waitForText('Первая заявка')
    expect(container).toHaveTextContent('Страница 1 из 2 · всего 21')

    const nextButton = container.querySelector<HTMLButtonElement>('[aria-label="Следующая страница"]')
    expect(nextButton).toBeEnabled()
    await act(async () => {
      nextButton!.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    await waitForText('Вторая заявка')
    expect(container).toHaveTextContent('Страница 2 из 2 · всего 21')
    expect(container.querySelector('[aria-label="Предыдущая страница"]')).toBeEnabled()
    expect(container.querySelector('[aria-label="Следующая страница"]')).toBeDisabled()
    expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes('page=2&pageSize=20')
    )).toBe(true)
  })
})
