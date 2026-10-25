import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectDetailTabs } from './project-detail-tabs'

const navigation = vi.hoisted(() => ({ params: '', replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.params),
}))

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

let root: Root
let host: HTMLDivElement

describe('ProjectDetailTabs', () => {
  beforeEach(() => {
    navigation.params = ''
    navigation.replace.mockReset()
    navigation.replace.mockImplementation((url: string) => { navigation.params = url.split('?')[1] || '' })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('opens the overview by default and switches to another project section', async () => {
    await act(async () => root.render(
      <ProjectDetailTabs tabs={[
        { id: 'overview', label: 'Обзор', content: <p>Описание проекта</p> },
        { id: 'tasks', label: 'Задачи', content: <p>График задач</p> },
      ]} />,
    ))

    const overviewTab = host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
    expect(overviewTab).toHaveTextContent('Обзор')
    expect(host).toHaveTextContent('Описание проекта')
    expect(host.querySelector('[role="tab"][aria-label="Финансы"]')).toBeNull()

    const tasksTab = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((tab) => tab.textContent?.trim() === 'Задачи')
    expect(tasksTab).not.toBeUndefined()
    await act(async () => tasksTab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))

    expect(navigation.replace).toHaveBeenCalledWith('?tab=tasks', { scroll: false })
    await act(async () => root.render(
      <ProjectDetailTabs tabs={[
        { id: 'overview', label: 'Обзор', content: <p>Описание проекта</p> },
        { id: 'tasks', label: 'Задачи', content: <p>График задач</p> },
      ]} />,
    ))
    expect(host.querySelector('[role="tab"][aria-selected="true"]')).toHaveTextContent('Задачи')
    expect(host).toHaveTextContent('График задач')
    expect(host).not.toHaveTextContent('Описание проекта')
  })
})
