'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate, formatDecimal } from '@/lib/utils'

interface ActEntry {
  id: string
  inventoryNumber: string
  assetName: string
  unitOfMeasure: string
  expectedQuantity: string
  foundQuantity: string | null
  differenceQuantity: string | null
  note: string | null
}

export function AssetInventoryActClient({
  inventory,
  entries,
  summary,
}: {
  inventory: {
    name: string
    status: 'IN_PROGRESS' | 'COMPLETED'
    createdAt: string
    completedAt: string | null
    mol: { code: string; fullName: string; storageLocation: string; department: string }
    createdBy: { name: string }
  }
  entries: ActEntry[]
  summary: { totalAssets: number; checkedAssets: number; missingAssets: number; totalDiscrepancies: number }
}) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-foreground print:max-w-none print:p-0 print:text-black">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">Печатный акт инвентаризации</p>
        <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Печать / сохранить PDF</Button>
      </div>
      <article className="space-y-6 bg-background print:bg-white">
        <header className="space-y-2 text-center">
          <p className="text-sm uppercase tracking-widest text-muted-foreground print:text-neutral-600">Consilium · имущество</p>
          <h1 className="text-2xl font-bold">Акт инвентаризации имущества</h1>
          <p className="font-medium">{inventory.name}</p>
          {inventory.status === 'IN_PROGRESS' && <p className="inline-block rounded border border-amber-500 px-2 py-1 text-xs font-semibold uppercase text-amber-700">Предварительный акт · ведомость открыта</p>}
        </header>

        <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2 print:grid-cols-2">
          <p><span className="text-muted-foreground print:text-neutral-600">Подразделение:</span> {inventory.mol.department}</p>
          <p><span className="text-muted-foreground print:text-neutral-600">МОЛ:</span> {inventory.mol.fullName} ({inventory.mol.code})</p>
          <p><span className="text-muted-foreground print:text-neutral-600">Место хранения:</span> {inventory.mol.storageLocation}</p>
          <p><span className="text-muted-foreground print:text-neutral-600">Начата:</span> {formatDate(inventory.createdAt)}</p>
          <p><span className="text-muted-foreground print:text-neutral-600">Завершена:</span> {inventory.completedAt ? formatDate(inventory.completedAt) : 'Не завершена'}</p>
          <p><span className="text-muted-foreground print:text-neutral-600">Ответственный:</span> {inventory.createdBy.name}</p>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
          <Summary label="Позиций" value={summary.totalAssets} />
          <Summary label="Проверено" value={summary.checkedAssets} />
          <Summary label="Не подтверждено" value={summary.missingAssets} />
          <Summary label="Расхождений" value={summary.totalDiscrepancies} />
        </section>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs sm:text-sm print:text-[10pt]">
            <thead className="print:table-header-group">
              <tr className="border-y bg-muted/40 print:bg-neutral-100">
                <th className="p-2 text-left">№</th>
                <th className="p-2 text-left">Инвентарный номер</th>
                <th className="p-2 text-left">Наименование</th>
                <th className="p-2 text-right">По учёту</th>
                <th className="p-2 text-right">Фактически</th>
                <th className="p-2 text-right">Разница</th>
                <th className="p-2 text-left">Примечание</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const difference = entry.differenceQuantity
                const differs = difference !== null && Number(difference) !== 0
                return (
                  <tr key={entry.id} className={`break-inside-avoid border-b ${differs ? 'bg-amber-500/5 print:bg-amber-50' : ''}`}>
                    <td className="p-2 align-top">{index + 1}</td>
                    <td className="p-2 align-top font-mono">{entry.inventoryNumber}</td>
                    <td className="p-2 align-top">{entry.assetName}</td>
                    <td className="p-2 text-right align-top">{formatDecimal(entry.expectedQuantity)} {entry.unitOfMeasure}</td>
                    <td className="p-2 text-right align-top">{entry.foundQuantity === null ? 'Не проверено' : `${formatDecimal(entry.foundQuantity)} ${entry.unitOfMeasure}`}</td>
                    <td className="p-2 text-right align-top">{difference === null ? '—' : `${Number(difference) > 0 ? '+' : ''}${formatDecimal(difference)}`}</td>
                    <td className="max-w-48 p-2 align-top">{entry.note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-10 pt-8 sm:grid-cols-2 print:grid-cols-2">
          <Signature title="Председатель комиссии" />
          <Signature title="Материально ответственное лицо" />
          <Signature title="Член комиссии" />
          <Signature title="Член комиссии" />
        </div>
        <p className="text-xs text-muted-foreground print:text-neutral-600">Акт отражает результаты физической проверки. Он не изменяет учётные остатки автоматически; бухгалтерские корректировки оформляются отдельной операцией.</p>
      </article>
      <style>{'@media print { @page { size: A4 landscape; margin: 12mm; } body { background: white !important; } }'}</style>
    </main>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground print:text-neutral-600">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>
}

function Signature({ title }: { title: string }) {
  return <div className="space-y-2">
    <p className="text-sm font-medium">{title}</p>
    <div className="h-8 border-b border-dashed border-neutral-500" />
    <p className="text-xs text-muted-foreground print:text-neutral-600">Подпись / Ф. И. О. / дата</p>
  </div>
}
