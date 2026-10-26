import Link from 'next/link'
import { Filter, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DashboardOverview } from '../contracts/view-model'

export function ReportFilters({
  action,
  data,
}: {
  action: string
  data: DashboardOverview
}) {
  return (
    <form action={action} className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]">
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        С даты
        <Input type="date" name="dateFrom" defaultValue={data.query.dateFrom} className="bg-background" />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        По дату
        <Input type="date" name="dateTo" defaultValue={data.query.dateTo} className="bg-background" />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        Подразделение
        <select
          name="departmentId"
          defaultValue={data.query.departmentId || ''}
          className="h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Все доступные</option>
          {data.options.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.code} · {department.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        Проект
        <select
          name="projectId"
          defaultValue={data.query.projectId || ''}
          className="h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Все доступные</option>
          {data.options.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.code} · {project.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <Button type="submit" className="flex-1">
          <Filter className="mr-2 h-4 w-4" />
          Применить
        </Button>
        <Button asChild type="button" variant="outline" size="icon" aria-label="Сбросить фильтры">
          <Link href={action}><RotateCcw className="h-4 w-4" /></Link>
        </Button>
      </div>
    </form>
  )
}
