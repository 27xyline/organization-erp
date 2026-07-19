import { DocumentCategory } from '@prisma/client'
import type { GenerateDocumentInput } from '../contracts/document'

export interface RenderedDocumentTemplate {
  category: DocumentCategory
  filename: string
  content: string
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function safeFilenamePart(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

export function renderDocumentTemplate(
  input: GenerateDocumentInput,
): RenderedDocumentTemplate {
  const date = formatDate(input.date)
  const basis = input.basis ? `\nОснование: ${input.basis}\n` : ''

  if (input.template === 'PERSONNEL_ORDER') {
    return {
      category: DocumentCategory.ORDER,
      filename: `приказ-${safeFilenamePart(input.number)}.txt`,
      content: [
        'ПРИКАЗ',
        `№ ${input.number} от ${date}`,
        '',
        input.subject.toUpperCase(),
        '',
        input.details,
        basis,
        'Руководитель: ____________________',
        'С приказом ознакомлен(а): ____________________',
      ].join('\n').trim() + '\n',
    }
  }

  return {
    category: DocumentCategory.ACT,
    filename: `акт-${safeFilenamePart(input.number)}.txt`,
    content: [
      'АКТ',
      `№ ${input.number} от ${date}`,
      '',
      input.subject.toUpperCase(),
      '',
      input.details,
      basis,
      'Передал: ____________________',
      'Принял: ____________________',
      'Члены комиссии: ____________________',
    ].join('\n').trim() + '\n',
  }
}
