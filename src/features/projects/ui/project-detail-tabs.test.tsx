import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectDetailTabs } from './project-detail-tabs'

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

let root: Root
let host: HTMLDivElement

describe('ProjectDetailTabs', () => {
  beforeEach(() => {
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

    expect(tasksTab).toHaveAttribute('aria-selected', 'true')
    expect(host).toHaveTextContent('График задач')
    expect(host).not.toHaveTextContent('Описание проекта')
  })
})
