'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2, Edit, Trash2 } from 'lucide-react'
import { formatCurrency, formatDecimal } from '@/lib/utils'
import { type StaffSchedule } from '@/types'

interface StaffTableProps {
  loading: boolean
  staffSchedule: StaffSchedule[]
  onEditStaff: (position: StaffSchedule) => void
  onDeleteStaff: (id: string) => void
}

export function StaffTable({
  loading,
  staffSchedule,
  onEditStaff,
  onDeleteStaff
}: StaffTableProps) {
  const totalRates = useMemo(
    () => staffSchedule.reduce((sum, position) => sum + position.rate, 0),
    [staffSchedule]
  )

  const occupiedRates = useMemo(
    () => staffSchedule.reduce((sum, position) => sum + position.occupiedRate, 0),
    [staffSchedule]
  )

  const freeRates = useMemo(
    () => staffSchedule.reduce((sum, position) => sum + position.freeRate, 0),
    [staffSchedule]
  )

  return (
    <Card className="mt-6">
      <CardHeader className="space-y-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Штатное расписание
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Должностей</p>
            <p className="mt-2 text-sm font-medium">{staffSchedule.length}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Всего ставок</p>
            <p className="mt-2 text-sm font-medium">{formatDecimal(totalRates)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Занято ставок</p>
            <p className="mt-2 text-sm font-medium">{formatDecimal(occupiedRates)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Свободно ставок</p>
            <p className="mt-2 text-sm font-medium">{formatDecimal(freeRates)}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead>Должность</TableHead>
                <TableHead>Всего ставок</TableHead>
                <TableHead>Свободно ставок</TableHead>
                <TableHead>Занято ставок</TableHead>
                <TableHead className="w-[96px] text-right">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Загрузка должностей...
                  </TableCell>
                </TableRow>
              ) : staffSchedule.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Должности пока не заведены.
                  </TableCell>
                </TableRow>
              ) : (
                staffSchedule.map((position) => (
                  <TableRow key={position.id}>
                    <TableCell>
                      <div className="min-w-[220px]">
                        <p className="font-medium text-slate-900">{position.position}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{position.department}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Оклад за 1 ставку: {formatCurrency(position.salary)}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatDecimal(position.rate)}</TableCell>
                    <TableCell>{formatDecimal(position.freeRate)}</TableCell>
                    <TableCell>{formatDecimal(position.occupiedRate)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditStaff(position)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => onDeleteStaff(position.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
