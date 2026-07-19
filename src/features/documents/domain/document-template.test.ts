import { describe, expect, it } from 'vitest'
import { renderDocumentTemplate } from './document-template'

describe('renderDocumentTemplate', () => {
  it('renders a personnel order with a safe filename', () => {
    const result = renderDocumentTemplate({
      template: 'PERSONNEL_ORDER',
      title: 'Приказ о назначении',
      number: '42/к',
      date: new Date('2026-07-18T00:00:00.000Z'),
      subject: 'О назначении ответственного',
      details: 'Назначить ответственным Иванова И.И.',
      basis: 'служебная записка',
    })

    expect(result.category).toBe('ORDER')
    expect(result.filename).toBe('приказ-42-к.txt')
    expect(result.content).toContain('ПРИКАЗ')
    expect(result.content).toContain('Основание: служебная записка')
  })

  it('renders an acceptance act', () => {
    const result = renderDocumentTemplate({
      template: 'ACCEPTANCE_ACT',
      title: 'Акт приёма',
      number: '17',
      date: new Date('2026-07-18T00:00:00.000Z'),
      subject: 'Приём оборудования',
      details: 'Оборудование принято без замечаний.',
    })

    expect(result.category).toBe('ACT')
    expect(result.content).toContain('Передал:')
    expect(result.content).toContain('Принял:')
  })
})
