import { DepartmentService } from '@/features/departments/application/department.service'
import { DepartmentsClient } from '@/features/departments/ui/departments-client'
import { requirePagePermission } from '@/lib/auth/authorization'

export default async function DepartmentsPage() {
  const user = await requirePagePermission({
    allOf: [
      'departments.read',
      'departments.create',
      'departments.update',
      'departments.delete',
    ],
  })
  const [departments, headCandidates] = await Promise.all([
    DepartmentService.list({}, user.access),
    DepartmentService.listHeadCandidates(),
  ])

  return (
    <DepartmentsClient
      initialDepartments={departments}
      headCandidates={headCandidates}
    />
  )
}
