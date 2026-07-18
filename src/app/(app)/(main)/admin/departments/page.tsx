import { DepartmentService } from '@/features/departments/application/department.service'
import { DepartmentsClient } from '@/features/departments/ui/departments-client'
import { requirePageUser } from '@/lib/auth/authorization'

export default async function DepartmentsPage() {
  const [, departments, headCandidates] = await Promise.all([
    requirePageUser(['ADMIN']),
    DepartmentService.list(),
    DepartmentService.listHeadCandidates(),
  ])

  return (
    <DepartmentsClient
      initialDepartments={departments}
      headCandidates={headCandidates}
    />
  )
}

