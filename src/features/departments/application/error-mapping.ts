import type { DepartmentErrorCode } from './department.service'

const departmentErrors: Record<DepartmentErrorCode, { message: string; status: number }> = {
  NOT_FOUND: { message: 'Подразделение не найдено', status: 404 },
  CODE_EXISTS: { message: 'Подразделение с таким кодом уже существует', status: 409 },
  NAME_EXISTS: { message: 'Подразделение с таким названием уже существует', status: 409 },
  PARENT_NOT_FOUND: { message: 'Родительское подразделение не найдено', status: 422 },
  HEAD_NOT_FOUND: { message: 'Руководитель не найден или больше не работает', status: 422 },
  CYCLIC_HIERARCHY: { message: 'Нельзя создать циклическую структуру подразделений', status: 409 },
  IN_USE: { message: 'Подразделение используется и не может быть удалено', status: 409 },
  DEPARTMENT_REQUIRED: { message: 'Подразделение обязательно', status: 422 },
  INACTIVE_DEPARTMENT: { message: 'Нельзя назначить неактивное подразделение', status: 409 },
}

export function getDepartmentErrorMeta(code: DepartmentErrorCode) {
  return departmentErrors[code]
}

