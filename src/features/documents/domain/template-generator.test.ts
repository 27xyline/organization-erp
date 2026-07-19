import { describe, expect, it } from 'vitest'
import { generateDocxBuffer, generatePdfBuffer } from './template-generator'

describe('template-generator', () => {
  it('generates a non-empty DOCX buffer', async () => {
    const buffer = await generateDocxBuffer(
      '42',
      '19 июля 2026 г.',
      'О назначении ответственного',
      'Назначить ответственным Иванова И.И.',
      'Служебная записка',
      true
    )
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('generates a non-empty PDF buffer', async () => {
    const buffer = await generatePdfBuffer(
      '17',
      '19 июля 2026 г.',
      'Приём оборудования',
      'Оборудование принято без замечаний.',
      undefined,
      false
    )
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })
})
