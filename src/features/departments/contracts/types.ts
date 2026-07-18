export interface DepartmentHead {
  id: string
  code: string
  fullName: string
}
export interface DepartmentUsage {
  children: number
  employees: number
  staffPositions: number
  mols: number
}

export interface DepartmentListItem {
  id: string
  code: string
  name: string
  parentId: string | null
  headEmployeeId: string | null
  headEmployee: DepartmentHead | null
  isActive: boolean
  usage: DepartmentUsage
  createdAt: string
  updatedAt: string
}

export interface DepartmentHeadCandidate extends DepartmentHead {
  departmentId: string
}
