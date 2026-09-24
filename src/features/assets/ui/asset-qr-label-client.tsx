'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AssetQrLabelClient({ asset }: {
  asset: { id: string; name: string; inventoryNumber: string; unitOfMeasure: string; molName: string; storageLocation: string }
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/assets/${asset.id}`}><Button variant="ghost"><ArrowLeft className="mr-2 h-4 w-4" />К карточке имущества</Button></Link>
        <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Печать этикетки</Button>
      </div>
      <section className="mx-auto flex min-h-96 max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border bg-white p-10 text-center text-black shadow-sm print:min-h-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <Image unoptimized width={256} height={256} className="h-64 w-64" src={`/api/assets/${asset.id}/qr`} alt={`QR-код имущества ${asset.inventoryNumber}`} />
        <div className="space-y-2">
          <h1 className="max-w-lg text-2xl font-semibold">{asset.name}</h1>
          <p className="text-lg font-medium">Инвентарный номер: {asset.inventoryNumber}</p>
          <p className="text-sm text-neutral-600">{asset.unitOfMeasure} · {asset.molName} · {asset.storageLocation}</p>
        </div>
        <p className="max-w-sm text-xs text-neutral-500">QR-код открывает проверку этого имущества. Для подсчёта требуется войти в систему и выбрать активную инвентаризацию.</p>
      </section>
      <style>{'@media print { @page { size: A5 portrait; margin: 10mm; } body { background: white !important; } }'}</style>
    </main>
  )
}
