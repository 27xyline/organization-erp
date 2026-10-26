import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/toast'
import { TaskStatus, type Task } from '../contracts/types'
import { ProjectGantt } from './project-gantt-client'

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))

const task: Task = {
  id: 'task-1', projectId: 'project-1', name: 'Подготовить техническое задание',
  level: 1, progress: 35, status: TaskStatus.NOT_STARTED, assignees: [],
  createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
}

function project(tasks = [task], canEdit = true) {
  return <ToastProvider><ProjectGantt projectId="project-1" tasks={tasks} canEdit={canEdit} /></ToastProvider>
}

function button(text: string, scope: ParentNode = document) {
  const match = Array.from(scope.querySelectorAll('button')).find((element) => element.textContent?.startsWith(text))
  if (!match) throw new Error(`Button not found: ${text}`)
  return match
}

function column(name: string) {
  const heading = Array.from(document.querySelectorAll('div, h3')).find((element) => element.textContent === name)
  if (!heading?.parentElement) throw new Error(`Column not found: ${name}`)
  return heading.parentElement
}

function dragEvent(element: Element, type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { setData() {}, effectAllowed: 'none', dropEffect: 'none' } })
  element.dispatchEvent(event)
}

async function dragTask(destination: string) {
  const card = button(task.name)
  await act(async () => dragEvent(card, 'dragstart'))
  await act(async () => {
    dragEvent(column(destination), 'dragover')
    dragEvent(column(destination), 'drop')
    dragEvent(card, 'dragend')
  })
}

describe('project kanban', () => {
  const fetchMock = vi.fn<typeof fetch>()
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation(async () => Response.json({ members: [] }))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  async function renderBoard(canEdit = true) {
    await act(async () => root.render(project([task], canEdit)))
    await act(async () => button('Канбан').click())
  }

  it('moves a card immediately and saves only its status', async () => {
    let finishSave!: (response: Response) => void
    fetchMock.mockImplementation(async (_url, init) => init?.method === 'PUT'
      ? new Promise<Response>((resolve) => { finishSave = resolve })
      : Response.json({ members: [] }))
    navigation.refresh.mockImplementation(() => root.render(project([{ ...task, status: TaskStatus.IN_PROGRESS }])))
    await renderBoard()
    expect(button(task.name)).toHaveAttribute('draggable', 'true')
    await dragTask('В работе')

    expect(button(task.name, column('В работе'))).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-1', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })
    expect(button(task.name)).toBeDisabled()
    await act(async () => finishSave(Response.json({ data: { ...task, status: 'IN_PROGRESS' } })))
    expect(navigation.refresh).toHaveBeenCalledOnce()
    expect(button(task.name, column('В работе'))).toBeInTheDocument()
    expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument()
  })

  it.each(['server', 'network'])('restores the original column after a %s failure', async (failure) => {
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method !== 'PUT') return Response.json({ members: [] })
      if (failure === 'network') throw new Error('Network unavailable')
      return Response.json({ error: { message: 'Недостаточно прав' } }, { status: 403 })
    })
    await renderBoard()
    await dragTask('Завершена')
    expect(document.body).toHaveTextContent(failure === 'server' ? 'Недостаточно прав' : 'Не удалось изменить статус задачи')
    expect(button(task.name, column('Не начата'))).toBeInTheDocument()
    expect(navigation.refresh).not.toHaveBeenCalled()
  })

  it('does not save a drop into the same column or an external drag', async () => {
    await renderBoard()
    await dragTask('Не начата')
    await act(async () => dragEvent(column('В работе'), 'drop'))
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  })

  it('keeps the board read-only without edit permission', async () => {
    await renderBoard(false)
    expect(button(task.name)).not.toHaveAttribute('draggable', 'true')
    await dragTask('В работе')
    await act(async () => button(task.name).click())
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
    expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument()
  })
})
