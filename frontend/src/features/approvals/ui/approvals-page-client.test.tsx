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

  async function renderPage(currentUserId = 'author-1', canCreate = false, canManageTemplates = false) {
    await act(async () => {
      root.render(
        <ApprovalsPageClient
          currentUserId={currentUserId}
          canCreate={canCreate}
          canDecide
          canCancel
          canManageTemplates={canManageTemplates}
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

  async function waitForBodyText(text: string) {
    await act(async () => {
      const deadline = Date.now() + 1000
      while (!document.body.textContent?.includes(text) && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 10))
      }
    })
    expect(document.body).toHaveTextContent(text)
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

  it('applies a saved template route when the requester selects it', async () => {
    const route = [{ name: 'Руководитель отдела', approverId: 'approver-2' }]
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/approvals/templates') {
        return jsonResponse({ data: [{ id: 'template-1', name: 'Закупка', steps: route, isActive: true }] })
      }
      if (url === '/api/approvals/options') {
        return jsonResponse({ data: [{ id: 'approver-2', name: 'Иван Иванов', username: 'ivan' }] })
      }
      return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } })
    })
    await renderPage('author-1', true)

    const launchButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Запустить'))
    await act(async () => {
      launchButton!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      launchButton!.click()
    })
    await waitForBodyText('Новое согласование')

    const templateSelect = document.body.querySelector<HTMLSelectElement>('[aria-label="Шаблон маршрута"]')
    expect(templateSelect).not.toBeNull()
    await act(async () => {
      templateSelect!.value = 'template-1'
      templateSelect!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(document.body.querySelector<HTMLInputElement>('[aria-label="Название этапа 1"]')?.value)
      .toBe('Руководитель отдела')
    expect(document.body.querySelector<HTMLSelectElement>('[aria-label="Согласующий 1"]')?.value)
      .toBe('approver-2')
  })

  it('lets template managers save the route currently being composed', async () => {
    const savedTemplate = {
      id: 'template-new',
      name: 'Закупка оборудования',
      steps: [{ name: 'Руководитель отдела', approverId: 'approver-2' }],
      isActive: true,
    }
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/approvals/templates' && init?.method === 'POST') {
        return jsonResponse({ data: savedTemplate })
      }
      if (url === '/api/approvals/templates') return jsonResponse({ data: [] })
      if (url === '/api/approvals/options') {
        return jsonResponse({ data: [{ id: 'approver-2', name: 'Иван Иванов', username: 'ivan' }] })
      }
      return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } })
    })
    await renderPage('author-1', true, true)

    const launchButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Запустить'))
    await act(async () => launchButton!.click())
    await waitForBodyText('Новое согласование')

    const nameInput = document.body.querySelector<HTMLInputElement>('[aria-label="Название этапа 1"]')!
    const nameSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      nameSetter.call(nameInput, 'Руководитель отдела')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const approverSelect = document.body.querySelector<HTMLSelectElement>('[aria-label="Согласующий 1"]')!
    await act(async () => {
      approverSelect.value = 'approver-2'
      approverSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const templateNameInput = document.body.querySelector<HTMLInputElement>('[aria-label="Название нового шаблона"]')!
    await act(async () => {
      nameSetter.call(templateNameInput, 'Закупка оборудования')
      templateNameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const saveButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Сохранить маршрут'))
    expect(saveButton).toBeEnabled()
    await act(async () => saveButton!.click())

    await waitForText('Шаблон маршрута сохранён')
    const createCall = fetchMock.mock.calls.find(([url, init]) =>
      String(url) === '/api/approvals/templates' && init?.method === 'POST'
    )
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
      name: 'Закупка оборудования',
      steps: [{ name: 'Руководитель отдела', approverId: 'approver-2' }],
    })
  })

  it('lets template managers archive a route without deleting its history', async () => {
    const activeTemplate = {
      id: 'template-1', name: 'Закупка', steps: [{ name: 'Руководитель', approverId: 'approver-2' }], isActive: true,
    }
    const archivedTemplate = { ...activeTemplate, isActive: false }
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/approvals/templates/template-1' && init?.method === 'PATCH') {
        return jsonResponse({ data: archivedTemplate })
      }
      if (url === '/api/approvals/templates') return jsonResponse({ data: [activeTemplate] })
      return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } })
    })
    await renderPage('admin-1', false, true)

    const manageButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Шаблоны маршрутов'))
    await act(async () => manageButton!.click())
    await waitForBodyText('Закупка')
    const archiveButton = document.body.querySelector<HTMLButtonElement>('[aria-label="Архивировать Закупка"]')!
    await act(async () => archiveButton.click())

    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url) === '/api/approvals/templates/template-1'
      && init?.method === 'PATCH'
      && init.body === JSON.stringify({ isActive: false })
    )).toBe(true)
    await waitForBodyText('в архиве')
    expect(document.body.querySelector('[aria-label="Восстановить Закупка"]')).not.toBeNull()
  })

  it('lets template managers edit an existing route without starting an approval', async () => {
    const template = {
      id: 'template-1', name: 'Закупка', steps: [{ name: 'Руководитель', approverId: 'approver-2' }], isActive: true,
    }
    const updatedTemplate = { ...template, name: 'Закупка оборудования' }
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/approvals/templates/template-1' && init?.method === 'PATCH') {
        return jsonResponse({ data: updatedTemplate })
      }
      if (url === '/api/approvals/templates') return jsonResponse({ data: [template] })
      if (url === '/api/approvals/options') return jsonResponse({ data: [] })
      return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } })
    })
    await renderPage('admin-1', true, true)

    const manageButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Шаблоны маршрутов'))
    await act(async () => manageButton!.click())
    await waitForBodyText('Закупка')
    const editButton = document.body.querySelector<HTMLButtonElement>('[aria-label="Изменить маршрут Закупка"]')
    expect(editButton).not.toBeNull()
    await act(async () => editButton!.click())
    await waitForBodyText('Изменение шаблона маршрута')

    const nameInput = document.body.querySelector<HTMLInputElement>('[aria-label="Название шаблона"]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(nameInput, 'Закупка оборудования')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const saveButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Сохранить шаблон'))
    await act(async () => saveButton!.click())

    const updateCall = fetchMock.mock.calls.find(([url, init]) =>
      String(url) === '/api/approvals/templates/template-1' && init?.method === 'PATCH'
    )
    expect(JSON.parse(updateCall?.[1]?.body as string)).toEqual({
      name: 'Закупка оборудования',
      steps: template.steps,
    })
    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url) === '/api/approvals' && init?.method === 'POST'
    )).toBe(false)
    await waitForText('Шаблон маршрута обновлён')
  })
})
