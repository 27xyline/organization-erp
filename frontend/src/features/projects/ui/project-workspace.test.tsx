import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectWorkspace } from './project-workspace'

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

const project = { id: 'project-1', code: 'PRJ-1', name: 'Новый офис' }
const activity = {
  id: 'activity-1',
  action: 'PROJECT_UPDATE',
  entityType: 'Project',
  entityId: project.id,
  createdAt: '2026-09-24T10:00:00.000Z',
  user: { id: 'user-1', name: 'Анна', username: 'anna' },
}

let root: Root
let host: HTMLDivElement

describe('ProjectWorkspace access boundaries', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('renders activity without exposing the documents section', async () => {
    await act(async () => root.render(
      <ProjectWorkspace
        project={project}
        documents={[]}
        activities={[activity]}
        canReadDocuments={false}
        showDocuments={false}
        showActivity
      />,
    ))

    expect(host).toHaveTextContent('Лента изменений')
    expect(host).toHaveTextContent('Анна')
    expect(host).not.toHaveTextContent('Документы проекта')
    expect(host.querySelector('a[href="/documents?projectId=project-1"]')).toBeNull()
  })

  it('allows document creation without showing a false empty-list state or browse link', async () => {
    await act(async () => root.render(
      <ProjectWorkspace
        project={project}
        documents={[]}
        activities={[]}
        canReadDocuments={false}
        showDocuments
        showActivity={false}
        uploadAction={<button type="button">Загрузить документ</button>}
      />,
    ))

    expect(host).toHaveTextContent('Документы проекта')
    expect(host).toHaveTextContent('Загрузить документ')
    expect(host).toHaveTextContent('запросите соответствующий доступ')
    expect(host).not.toHaveTextContent('Документов проекта пока нет')
    expect(host.querySelector('a[href="/documents?projectId=project-1"]')).toBeNull()
  })
})
