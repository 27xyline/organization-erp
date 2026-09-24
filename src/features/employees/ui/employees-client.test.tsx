import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmployeesInitialData } from './use-employees-page'
import { EmployeesClient } from './employees-client'

const mocks = vi.hoisted(() => ({ useEmployeesPage: vi.fn() }))
vi.mock('./use-employees-page', () => ({ useEmployeesPage: mocks.useEmployeesPage }))
vi.mock('./personnel-timeline', () => ({ PersonnelTimeline: () => <div>КАДРОВАЯ ЛЕНТА</div> }))
vi.mock('./staff-table', () => ({ StaffTable: () => <div>ТАБЛИЦА ШТАТА</div> }))
vi.mock('./employees-table', () => ({ EmployeesTable: () => <div>ТАБЛИЦА СОТРУДНИКОВ</div> }))
vi.mock('./vacations-card', () => ({ VacationsCard: () => <div>ГРАФИК ОТПУСКОВ</div> }))
vi.mock('./employee-dialog', () => ({ EmployeeDialog: () => null }))
vi.mock('./staff-dialog', () => ({ StaffDialog: () => null }))
vi.mock('./vacation-dialog', () => ({ VacationDialog: () => null }))
vi.mock('./action-dialog', () => ({ ActionDialog: () => null }))

const emptyData = {
  employees: [],
  staffSchedule: [],
  departments: [],
  vacations: [],
  personnelActions: [],
} satisfies EmployeesInitialData

const pageState = {} as ReturnType<typeof import('./use-employees-page').useEmployeesPage>
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

let root: Root
let host: HTMLDivElement

function tab(label: string) {
  const result = Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'))
    .find((item) => item.textContent?.replace(/\s+/g, ' ').trim() === label)
  if (!result) throw new Error(`Вкладка не найдена: ${label}`)
  return result
}

function clickTab(label: string) {
  const target = tab(label)
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
  target.click()
}

describe('EmployeesClient', () => {
  beforeEach(() => {
    mocks.useEmployeesPage.mockReturnValue(pageState)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('organizes the registry into contextual tabs and actions', async () => {
    await act(async () => root.render(<EmployeesClient initialData={emptyData} canEdit />))

    expect(tab('Сотрудники').getAttribute('aria-selected')).toBe('true')
    expect(host.textContent).toContain('ТАБЛИЦА СОТРУДНИКОВ')
    expect(host.textContent).toContain('Новый сотрудник')
    expect(host.textContent).not.toContain('ТАБЛИЦА ШТАТА')

    await act(async () => clickTab('Штат'))
    expect(host.textContent).toContain('ТАБЛИЦА ШТАТА')
    expect(host.textContent).toContain('Штатная позиция')

    await act(async () => clickTab('Кадры'))
    expect(host.textContent).toContain('ГРАФИК ОТПУСКОВ')
    expect(host.textContent).toContain('КАДРОВАЯ ЛЕНТА')
    expect(host.textContent).toContain('Запланировать отпуск')
    expect(host.textContent).toContain('Кадровое действие')
  })

  it('keeps editing actions hidden for read-only users on every tab', async () => {
    await act(async () => root.render(<EmployeesClient initialData={emptyData} canEdit={false} />))

    expect(host.textContent).not.toContain('Новый сотрудник')
    await act(async () => clickTab('Штат'))
    expect(host.textContent).not.toContain('Штатная позиция')
    await act(async () => clickTab('Кадры'))
    expect(host.textContent).not.toContain('Запланировать отпуск')
    expect(host.textContent).not.toContain('Кадровое действие')
  })
})
