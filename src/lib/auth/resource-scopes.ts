import { getDb } from '@/lib/prisma'
import type { PermissionTarget } from './access-context'

export async function employeeTarget(employeeId: string): Promise<PermissionTarget | null> {
  const employee = await getDb().employee.findUnique({
    where: { id: employeeId },
    select: { id: true, departmentId: true },
  })
  return employee ? { employeeId: employee.id, departmentId: employee.departmentId } : null
}

export async function staffPositionTarget(id: string): Promise<PermissionTarget | null> {
  const position = await getDb().staffSchedule.findUnique({
    where: { id },
    select: { departmentId: true },
  })
  return position ? { departmentId: position.departmentId } : null
}

export async function vacationTarget(id: string): Promise<PermissionTarget | null> {
  const vacation = await getDb().vacation.findUnique({
    where: { id },
    select: { employee: { select: { id: true, departmentId: true } } },
  })
  return vacation
    ? { employeeId: vacation.employee.id, departmentId: vacation.employee.departmentId }
    : null
}

export async function personnelActionTarget(id: string): Promise<PermissionTarget | null> {
  const action = await getDb().personnelAction.findUnique({
    where: { id },
    select: { employee: { select: { id: true, departmentId: true } } },
  })
  return action
    ? { employeeId: action.employee.id, departmentId: action.employee.departmentId }
    : null
}

export async function taskTarget(id: string): Promise<PermissionTarget | null> {
  const task = await getDb().task.findUnique({ where: { id }, select: { projectId: true } })
  return task ? { projectId: task.projectId } : null
}

export async function projectMemberTarget(
  projectId: string,
  memberId: string,
): Promise<PermissionTarget | null> {
  const member = await getDb().projectMember.findFirst({
    where: { id: memberId, projectId },
    select: { projectId: true },
  })
  return member ? { projectId: member.projectId } : null
}

export async function molTarget(id: string): Promise<PermissionTarget | null> {
  const mol = await getDb().mol.findUnique({ where: { id }, select: { departmentId: true } })
  return mol ? { departmentId: mol.departmentId } : null
}

export async function assetTarget(id: string): Promise<PermissionTarget | null> {
  const asset = await getDb().asset.findUnique({
    where: { id },
    select: {
      projectId: true,
      mol: { select: { departmentId: true } },
      holdings: {
        where: { quantity: { gt: 0 } },
        select: { mol: { select: { departmentId: true } } },
      },
    },
  })
  if (!asset) return null
  return {
    projectId: asset.projectId || undefined,
    departmentIds: Array.from(new Set([
      asset.mol.departmentId,
      ...asset.holdings.map((holding) => holding.mol.departmentId),
    ])),
  }
}

export async function departmentForMol(id: string): Promise<string | null> {
  const mol = await getDb().mol.findUnique({ where: { id }, select: { departmentId: true } })
  return mol?.departmentId || null
}

export async function departmentForPosition(id: string | null | undefined): Promise<string | null> {
  if (!id) return null
  const position = await getDb().staffSchedule.findUnique({
    where: { id },
    select: { departmentId: true },
  })
  return position?.departmentId || null
}

export async function departmentByName(name: string | null | undefined): Promise<string | null> {
  if (!name?.trim()) return null
  const department = await getDb().department.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
    select: { id: true },
  })
  return department?.id || null
}

export async function departmentForReference(reference: {
  departmentId?: string | null
  department?: string | null
}): Promise<string | null> {
  const departmentId = reference.departmentId?.trim()
  return departmentId || departmentByName(reference.department)
}
