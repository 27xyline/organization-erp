import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'
// @ts-expect-error: fontkit lacks official TypeScript declarations
import fontkit from 'fontkit'
import { Document as DocxDocument, Packer, Paragraph, TextRun, AlignmentType } from 'docx'

const FONT_PATHS = [
  path.resolve(process.cwd(), 'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf'),
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf'
]

function getFontPath() {
  for (const p of FONT_PATHS) {
    if (fs.existsSync(p)) return p
  }
  return undefined
}

export function generatePdfBuffer(
  number: string,
  dateStr: string,
  subject: string,
  details: string,
  basis?: string,
  isOrder = true
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 })
      ;(doc as any).fontkit = fontkit
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', (err) => reject(err))

      const font = getFontPath()
      if (font) {
        try {
          doc.registerFont('CustomFont', font)
          doc.font('CustomFont')
        } catch (e) {
          console.warn('Failed to load system font, using default:', e)
        }
      }

      // Title Header
      doc.fontSize(20).text(isOrder ? 'ПРИКАЗ' : 'АКТ', { align: 'center' })
      doc.moveDown(0.3)
      doc.fontSize(12).text(`№ ${number} от ${dateStr}`, { align: 'center' })
      doc.moveDown(1.5)

      // Subject
      doc.fontSize(13).text(subject.toUpperCase(), { align: 'left' })
      doc.moveDown(1)

      // Body / Details
      doc.fontSize(11).text(details, { align: 'justify', lineGap: 4 })
      doc.moveDown(1.5)

      // Basis
      if (basis) {
        doc.fontSize(10).text(`Основание: ${basis}`)
        doc.moveDown(1.5)
      }

      // Signatures
      doc.moveDown(2)
      if (isOrder) {
        doc.fontSize(11).text('Руководитель: ____________________', { align: 'left' })
        doc.moveDown(1)
        doc.text('С приказом ознакомлен(а): ____________________', { align: 'left' })
      } else {
        doc.fontSize(11).text('Передал: ____________________', { align: 'left' })
        doc.moveDown(1)
        doc.text('Принял: ____________________', { align: 'left' })
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

export async function generateDocxBuffer(
  number: string,
  dateStr: string,
  subject: string,
  details: string,
  basis?: string,
  isOrder = true
): Promise<Buffer> {
  const doc = new DocxDocument({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: isOrder ? 'ПРИКАЗ' : 'АКТ',
                bold: true,
                size: 32, // 16pt
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `№ ${number} от ${dateStr}`,
                size: 24, // 12pt
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: subject.toUpperCase(),
                bold: true,
                size: 26, // 13pt
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: details,
                size: 24,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          basis
            ? new Paragraph({
                children: [
                  new TextRun({
                    text: `Основание: ${basis}`,
                    italics: true,
                    size: 22,
                  }),
                ],
              })
            : new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: isOrder
                  ? 'Руководитель: ____________________'
                  : 'Передал: ____________________',
                size: 24,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: isOrder
                  ? 'С приказом ознакомлен(а): ____________________'
                  : 'Принял: ____________________',
                size: 24,
              }),
            ],
          }),
        ],
      },
    ],
  })

  return Packer.toBuffer(doc)
}
