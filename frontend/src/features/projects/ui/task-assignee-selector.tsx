'use client'

import { ProjectMemberRow } from '@/features/projects/contracts/ui-types'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { TaskAssignee } from '@/features/projects/contracts/types'

interface TaskAssigneeSelectorProps {
  members: ProjectMemberRow[]
  selectedEmployeeIds: string[]
  onChange: (employeeIds: string[]) => void
  loading?: boolean
  label?: string
  unavailableAssignees?: TaskAssignee[]
  className?: string
}

export function TaskAssigneeSelector({
  members,
  selectedEmployeeIds,
  onChange,
  loading = false,
  label = 'Исполнители',
  unavailableAssignees = [],
  className,
}: TaskAssigneeSelectorProps) {
  const toggleEmployeeId = (employeeId: string) => {
    if (selectedEmployeeIds.includes(employeeId)) {
      onChange(selectedEmployeeIds.filter((id) => id !== employeeId))
      return
    }

    onChange([...selectedEmployeeIds, employeeId])
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label>{label}</Label>
      <div className="rounded-xl border">
        {loading ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            Загружаем состав проекта...
          </div>
        ) : members.length > 0 ? (
          <div className="max-h-56 space-y-2 overflow-y-auto p-3">
            {members.map((member) => {
              const checked = selectedEmployeeIds.includes(member.employeeId)

              return (
                <label
                  key={member.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEmployeeId(member.employeeId)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{member.employee.fullName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {member.position} · {member.department}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        ) : (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            В составе проекта нет активных сотрудников.
          </div>
        )}
      </div>

      {unavailableAssignees.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          После сохранения из задачи будут сняты исполнители, которых уже нет в активном составе проекта:{' '}
          {unavailableAssignees.map((assignee) => assignee.fullName).join(', ')}.
        </div>
      ) : null}
    </div>
  )
}
