'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import {
  type Employee,
  type StaffSchedule,
  type Vacation,
  type PersonnelAction,
  type EmployeeStatus,
  type EmploymentContractType,
  type VacationType,
  type PersonnelActionType,
  employeeStatusLabels,
  vacationTypeLabels,
} from '@/types'
import {
  normalizeEmployee,
  normalizeStaffSchedule,
  normalizeVacation,
  normalizePersonnelAction,
} from '@/features/employees/contracts/normalizers'

const sortEmployeesByName = (a: Employee, b: Employee) =>
  a.fullName.localeCompare(b.fullName, 'ru', { sensitivity: 'base' })

const isContractExpired = (employee: Employee, date: Date) =>
  employee.status !== 'DISMISSED' && Boolean(employee.contractEndDate && employee.contractEndDate < date)

const isDateInRange = (date: Date, startDate: Date, endDate: Date) => date >= startDate && date <= endDate

const getAssignableRateForPosition = (position?: StaffSchedule | null, excludeEmployeeId?: string | null) => {
  if (!position) return 0

  const occupiedRate = position.employees.reduce((sum, employee) => {
    if (excludeEmployeeId && employee.id === excludeEmployeeId) {
      return sum
    }

    return sum + employee.employmentRate
  }, 0)

  return Math.max(position.rate - occupiedRate, 0)
}

const normalizeEmploymentRateInput = (value: string) => {
  const normalizedValue = value.replace(',', '.').trim()

  if (!normalizedValue) return 0

  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

const clampEmploymentRate = (value: number, availableRate: number) => {
  if (availableRate <= 0) return 0
  if (!Number.isFinite(value) || value <= 0) return Math.min(1, availableRate)
  return Math.min(value, availableRate)
}

const getCalculatedSalary = (position: StaffSchedule | null | undefined, employmentRate: number) => {
  if (!position || !Number.isFinite(employmentRate) || employmentRate <= 0) return 0
  return position.salary * employmentRate
}

const createInitialEmployeeForm = () => ({
  code: '',
  fullName: '',
  department: '',
  phone: '',
  email: '',
  contractType: 'PRIMARY' as EmploymentContractType,
  contractSignedDate: '',
  contractEndDate: '',
  contractNumber: '',
  staffScheduleId: 'none',
  employmentRate: 1,
  status: 'ACTIVE' as EmployeeStatus,
})

const createInitialStaffForm = () => ({
  position: '',
  department: '',
  rate: 1,
  salary: 0,
})

const createInitialVacationForm = () => ({
  employeeId: '',
  startDate: '',
  endDate: '',
  type: 'VACATION' as VacationType,
})

const createInitialActionForm = (employee?: Employee | null, type: PersonnelActionType = 'TRANSFER') => ({
  employeeId: employee?.id || '',
  type,
  date: new Date().toISOString().split('T')[0],
  description: '',
  newDepartment: '',
  staffScheduleId: 'none',
  employmentRate: employee?.employmentRate || 1,
  newContractEndDate: '',
})

export interface EmployeesInitialData {
  employees: Employee[]
  staffSchedule: StaffSchedule[]
  vacations: Vacation[]
  personnelActions: PersonnelAction[]
}

export function useEmployeesPage(initialData?: EmployeesInitialData) {
  const { toast } = useToast()
  const actualCurrentYear = useMemo(() => new Date().getFullYear(), [])
  const startOfToday = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }, [])
  const [employees, setEmployees] = useState<Employee[]>(initialData?.employees || [])
  const [staffSchedule, setStaffSchedule] = useState<StaffSchedule[]>(initialData?.staffSchedule || [])
  const [vacations, setVacations] = useState<Vacation[]>(initialData?.vacations || [])
  const [liveStatusVacations, setLiveStatusVacations] = useState<Vacation[]>(initialData?.vacations || [])
  const [personnelActions, setPersonnelActions] = useState<PersonnelAction[]>(initialData?.personnelActions || [])
  const [loading, setLoading] = useState(!initialData)
  const [vacationsLoading, setVacationsLoading] = useState(!initialData)
  const [selectedYear, setSelectedYear] = useState(actualCurrentYear)
  const hasInitializedVacations = useRef(Boolean(initialData))
  const hasRenderedInitialYear = useRef(false)

  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false)
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false)
  const [isVacationDialogOpen, setIsVacationDialogOpen] = useState(false)
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)

  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [editingStaff, setEditingStaff] = useState<StaffSchedule | null>(null)
  const [editingVacation, setEditingVacation] = useState<Vacation | null>(null)

  const [employeeForm, setEmployeeForm] = useState(createInitialEmployeeForm)
  const [staffForm, setStaffForm] = useState(createInitialStaffForm)
  const [vacationForm, setVacationForm] = useState(createInitialVacationForm)
  const [actionForm, setActionForm] = useState(createInitialActionForm())

  const loadBaseData = useCallback(async () => {
    try {
      setLoading(true)

      const [employeesResponse, staffResponse] = await Promise.all([
        fetch('/api/employees?scope=active'),
        fetch('/api/staff-schedule'),
      ])

      if (employeesResponse.ok) {
        const data = await employeesResponse.json()
        setEmployees((data.data || []).map(normalizeEmployee))
      }

      if (staffResponse.ok) {
        const data = await staffResponse.json()
        setStaffSchedule((data.data || []).map(normalizeStaffSchedule))
      }

      const actionsResponse = await fetch('/api/personnel-actions')

      if (actionsResponse.ok) {
        const data = await actionsResponse.json()
        setPersonnelActions((data.data || []).map(normalizePersonnelAction))
      }
    } catch (error) {
      console.error('Error loading employees section:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadVacationsForYear = useCallback(async (year: number, refreshLiveStatus = false) => {
    try {
      setVacationsLoading(true)

      const [selectedYearResponse, liveStatusResponse] = await Promise.all([
        fetch(`/api/vacations?year=${year}`),
        refreshLiveStatus && year !== actualCurrentYear
          ? fetch(`/api/vacations?year=${actualCurrentYear}`)
          : Promise.resolve(null),
      ])

      if (selectedYearResponse.ok) {
        const data = await selectedYearResponse.json()
        const normalizedVacations = (data.data || []).map(normalizeVacation)
        setVacations(normalizedVacations)

        if (year === actualCurrentYear) {
          setLiveStatusVacations(normalizedVacations)
        }
      }

      if (liveStatusResponse?.ok) {
        const data = await liveStatusResponse.json()
        setLiveStatusVacations((data.data || []).map(normalizeVacation))
      }
    } catch (error) {
      console.error('Error loading vacations:', error)
    } finally {
      setVacationsLoading(false)
    }
  }, [actualCurrentYear])

  useEffect(() => {
    if (initialData) return
    const initializePage = async () => {
      await Promise.all([
        loadBaseData(),
        loadVacationsForYear(actualCurrentYear, true),
      ])
      hasInitializedVacations.current = true
    }

    void initializePage()
  }, [actualCurrentYear, initialData, loadBaseData, loadVacationsForYear])

  useEffect(() => {
    if (!hasInitializedVacations.current) return
    if (!hasRenderedInitialYear.current) {
      hasRenderedInitialYear.current = true
      return
    }
    void loadVacationsForYear(selectedYear)
  }, [selectedYear, loadVacationsForYear])

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status !== 'DISMISSED').sort(sortEmployeesByName),
    [employees]
  )

  const selectedEmployeePosition = useMemo(
    () => staffSchedule.find((position) => position.id === employeeForm.staffScheduleId),
    [employeeForm.staffScheduleId, staffSchedule]
  )

  const selectedActionEmployee = useMemo(
    () => employees.find((employee) => employee.id === actionForm.employeeId) || null,
    [actionForm.employeeId, employees]
  )

  const selectedActionPosition = useMemo(
    () => staffSchedule.find((position) => position.id === actionForm.staffScheduleId),
    [actionForm.staffScheduleId, staffSchedule]
  )

  const availableEmployeeRate = useMemo(
    () => getAssignableRateForPosition(selectedEmployeePosition, editingEmployee?.id),
    [editingEmployee?.id, selectedEmployeePosition]
  )

  const availableActionRate = useMemo(
    () => getAssignableRateForPosition(selectedActionPosition, selectedActionEmployee?.id),
    [selectedActionEmployee?.id, selectedActionPosition]
  )

  const calculatedEmployeeSalary = useMemo(
    () => getCalculatedSalary(selectedEmployeePosition, employeeForm.employmentRate),
    [employeeForm.employmentRate, selectedEmployeePosition]
  )

  const calculatedActionSalary = useMemo(
    () => getCalculatedSalary(selectedActionPosition, actionForm.employmentRate),
    [actionForm.employmentRate, selectedActionPosition]
  )

  const employeePositionOptions = useMemo(
    () =>
      staffSchedule.filter(
        (position) => getAssignableRateForPosition(position, editingEmployee?.id) > 0 || position.id === editingEmployee?.staffScheduleId
      ),
    [editingEmployee?.id, editingEmployee?.staffScheduleId, staffSchedule]
  )

  const transferPositionOptions = useMemo(
    () =>
      staffSchedule.filter(
        (position) => getAssignableRateForPosition(position, selectedActionEmployee?.id) > 0 || position.id === selectedActionEmployee?.staffScheduleId
      ),
    [selectedActionEmployee?.id, selectedActionEmployee?.staffScheduleId, staffSchedule]
  )

  const getLiveEmployeeStatus = useCallback((employee: Employee) => {
    const today = new Date()
    const activeVacation = liveStatusVacations.find(
      (vacation) => vacation.employeeId === employee.id && isDateInRange(today, vacation.startDate, vacation.endDate)
    )

    if (activeVacation) {
      switch (activeVacation.type) {
        case 'SICK_LEAVE':
          return {
            label: vacationTypeLabels.SICK_LEAVE,
            className: 'border-red-200 bg-red-50 text-red-700',
          }
        case 'BUSINESS_TRIP':
          return {
            label: vacationTypeLabels.BUSINESS_TRIP,
            className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          }
        case 'UNPAID_LEAVE':
          return {
            label: vacationTypeLabels.UNPAID_LEAVE,
            className: 'border-slate-200 bg-slate-100 text-slate-700',
          }
        default:
          return {
            label: vacationTypeLabels.VACATION,
            className: 'border-blue-200 bg-blue-50 text-blue-700',
          }
      }
    }

    if (employee.status === 'ON_SICK_LEAVE') {
      return {
        label: employeeStatusLabels.ON_SICK_LEAVE,
        className: 'border-red-200 bg-red-50 text-red-700',
      }
    }

    if (employee.status === 'ON_VACATION') {
      return {
        label: employeeStatusLabels.ON_VACATION,
        className: 'border-blue-200 bg-blue-50 text-blue-700',
      }
    }

    return {
      label: employeeStatusLabels.ACTIVE,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }, [liveStatusVacations])

  const handleSaveEmployee = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    const normalizedCode = employeeForm.code.trim()

    if (employeeForm.staffScheduleId === 'none') {
      toast.error('Выберите должность из штатного расписания')
      return
    }

    if (!normalizedCode) {
      toast.error('Заполните табельный номер')
      return
    }

    if (employeeForm.employmentRate <= 0) {
      toast.error('Укажите количество ставок сотрудника')
      return
    }

    if (selectedEmployeePosition && employeeForm.employmentRate > availableEmployeeRate) {
      toast.error('Недостаточно свободных ставок по выбранной должности')
      return
    }

    const duplicateEmployee = employees.find(
      (employee) => employee.code.trim().toLowerCase() === normalizedCode.toLowerCase() && employee.id !== editingEmployee?.id
    )

    if (duplicateEmployee) {
      toast.error('Сотрудник с таким табельным номером уже существует')
      return
    }

    if (!employeeForm.contractNumber || !employeeForm.contractSignedDate) {
      toast.error('Заполните номер и дату подписания трудового договора')
      return
    }

    if (employeeForm.contractEndDate && new Date(employeeForm.contractSignedDate) >= new Date(employeeForm.contractEndDate)) {
      toast.error('Дата подписания договора должна быть раньше срока действия договора')
      return
    }

    const url = editingEmployee ? `/api/employees/${editingEmployee.id}` : '/api/employees'
    const payload = {
      ...employeeForm,
      code: normalizedCode,
      contractSignedDate: employeeForm.contractSignedDate,
      contractEndDate: employeeForm.contractEndDate || null,
      contractNumber: employeeForm.contractNumber,
      staffScheduleId: employeeForm.staffScheduleId === 'none' ? null : employeeForm.staffScheduleId,
      employmentRate: employeeForm.employmentRate,
    }

    try {
      const response = await fetch(url, {
        method: editingEmployee ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to save employee')
      }

      setIsEmployeeDialogOpen(false)
      setEditingEmployee(null)
      await loadBaseData()
      toast.success(editingEmployee ? 'Данные сотрудника обновлены' : 'Сотрудник успешно добавлен')
    } catch (error) {
      console.error('Error saving employee:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка при сохранении сотрудника')
    }
  }, [
    availableEmployeeRate,
    editingEmployee,
    employeeForm,
    employees,
    loadBaseData,
    selectedEmployeePosition,
    toast,
  ])

  const handleSaveStaff = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    const url = editingStaff ? `/api/staff-schedule/${editingStaff.id}` : '/api/staff-schedule'

    try {
      const response = await fetch(url, {
        method: editingStaff ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to save staff schedule position')
      }

      setIsStaffDialogOpen(false)
      setEditingStaff(null)
      await loadBaseData()
      toast.success(editingStaff ? 'Должность обновлена' : 'Должность успешно добавлена')
    } catch (error) {
      console.error('Error saving staff position:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка при сохранении должности')
    }
  }, [editingStaff, loadBaseData, staffForm, toast])

  const handleSaveVacation = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!vacationForm.employeeId || !vacationForm.startDate || !vacationForm.endDate) {
      toast.error('Заполните сотрудника и даты отпуска')
      return
    }

    if (new Date(vacationForm.startDate) > new Date(vacationForm.endDate)) {
      toast.error('Дата окончания не может быть раньше даты начала')
      return
    }

    const url = editingVacation ? `/api/vacations/${editingVacation.id}` : '/api/vacations'

    try {
      const response = await fetch(url, {
        method: editingVacation ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vacationForm),
      })

      if (!response.ok) {
        throw new Error('Failed to save vacation')
      }

      setIsVacationDialogOpen(false)
      setEditingVacation(null)
      await loadVacationsForYear(selectedYear, true)
      toast.success(editingVacation ? 'Запись отпуска обновлена' : 'Отпуск успешно назначен')
    } catch (error) {
      console.error('Error saving vacation:', error)
      toast.error('Ошибка при сохранении отпуска')
    }
  }, [editingVacation, loadVacationsForYear, selectedYear, toast, vacationForm])

  const handleSaveAction = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!actionForm.date) {
      toast.error('Заполните дату действия')
      return
    }

    if (!actionForm.employeeId) {
      toast.error('Выберите сотрудника')
      return
    }

    if ((actionForm.type === 'TRANSFER' || actionForm.type === 'PROMOTE') && actionForm.staffScheduleId === 'none') {
      toast.error('Для перевода или повышения выберите новую должность из штатного расписания')
      return
    }

    if ((actionForm.type === 'TRANSFER' || actionForm.type === 'PROMOTE') && actionForm.employmentRate <= 0) {
      toast.error('Укажите количество ставок сотрудника')
      return
    }

    if ((actionForm.type === 'TRANSFER' || actionForm.type === 'PROMOTE') && selectedActionPosition && actionForm.employmentRate > availableActionRate) {
      toast.error('Недостаточно свободных ставок по выбранной должности')
      return
    }

    if (actionForm.type === 'EXTEND' && !actionForm.newContractEndDate) {
      toast.error('Для продления укажите новую дату окончания договора')
      return
    }

    if (
      actionForm.type === 'EXTEND' &&
      selectedActionEmployee?.contractSignedDate &&
      new Date(actionForm.newContractEndDate) <= selectedActionEmployee.contractSignedDate
    ) {
      toast.error('Дата подписания договора должна быть раньше срока действия договора')
      return
    }

    const actionType = actionForm.type

    try {
      const payload = {
        ...actionForm,
        staffScheduleId: actionForm.staffScheduleId === 'none' ? null : actionForm.staffScheduleId,
        employmentRate: actionForm.employmentRate,
        newContractEndDate: actionForm.newContractEndDate || null,
      }

      const response = await fetch('/api/personnel-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to save personnel action')
      }

      setIsActionDialogOpen(false)
      setActionForm(createInitialActionForm())
      await loadBaseData()
      toast.success(actionType === 'DISMISS' ? 'Сотрудник перенесен в архив' : 'Кадровое действие успешно зафиксировано')
    } catch (error) {
      console.error('Error saving personnel action:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка при сохранении кадрового действия')
    }
  }, [
    actionForm,
    availableActionRate,
    loadBaseData,
    selectedActionEmployee?.contractSignedDate,
    selectedActionPosition,
    toast,
  ])

  const handleDeleteStaff = useCallback(async (id: string) => {
    if (!confirm('Удалить должность?')) return

    try {
      const response = await fetch(`/api/staff-schedule/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        toast.error(data.error || 'Ошибка при удалении должности')
        return
      }
      await loadBaseData()
    } catch (error) {
      console.error('Error deleting staff position:', error)
      toast.error('Ошибка при удалении должности')
    }
  }, [loadBaseData, toast])

  const handleDeleteVacation = useCallback(async (id: string) => {
    if (!confirm('Удалить запись отпуска?')) return

    try {
      const response = await fetch(`/api/vacations/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('Failed to delete vacation')
      }
      setIsVacationDialogOpen(false)
      setEditingVacation(null)
      await loadVacationsForYear(selectedYear, true)
    } catch (error) {
      console.error('Error deleting vacation:', error)
      toast.error('Ошибка при удалении отпуска')
    }
  }, [loadVacationsForYear, selectedYear, toast])

  const handleDeleteAction = useCallback(async (id: string) => {
    if (!confirm('Удалить кадровое действие из журнала?')) return

    try {
      const response = await fetch(`/api/personnel-actions/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('Failed to delete action')
      }
      await loadBaseData()
    } catch (error) {
      console.error('Error deleting personnel action:', error)
      toast.error('Ошибка при удалении кадрового действия')
    }
  }, [loadBaseData, toast])

  const openEmployeeDialog = useCallback((employee?: Employee) => {
    if (employee) {
      setEditingEmployee(employee)
      setEmployeeForm({
        code: employee.code,
        fullName: employee.fullName,
        department: employee.department,
        phone: employee.phone || '',
        email: employee.email || '',
        contractType: employee.contractType,
        contractSignedDate: employee.contractSignedDate ? employee.contractSignedDate.toISOString().split('T')[0] : '',
        contractEndDate: employee.contractEndDate ? employee.contractEndDate.toISOString().split('T')[0] : '',
        contractNumber: employee.contractNumber || '',
        staffScheduleId: employee.staffScheduleId || 'none',
        employmentRate: employee.employmentRate,
        status: employee.status,
      })
    } else {
      setEditingEmployee(null)
      setEmployeeForm(createInitialEmployeeForm())
    }

    setIsEmployeeDialogOpen(true)
  }, [])

  const openStaffDialog = useCallback((position?: StaffSchedule) => {
    if (position) {
      setEditingStaff(position)
      setStaffForm({
        position: position.position,
        department: position.department,
        rate: position.rate,
        salary: position.salary,
      })
    } else {
      setEditingStaff(null)
      setStaffForm(createInitialStaffForm())
    }

    setIsStaffDialogOpen(true)
  }, [])

  const openVacationDialog = useCallback((vacation?: Vacation) => {
    if (vacation) {
      setEditingVacation(vacation)
      setVacationForm({
        employeeId: vacation.employeeId,
        startDate: vacation.startDate.toISOString().split('T')[0],
        endDate: vacation.endDate.toISOString().split('T')[0],
        type: vacation.type,
      })
    } else {
      setEditingVacation(null)
      setVacationForm({
        employeeId: activeEmployees[0]?.id || '',
        startDate: '',
        endDate: '',
        type: 'VACATION',
      })
    }

    setIsVacationDialogOpen(true)
  }, [activeEmployees])

  const openActionDialog = useCallback((employee?: Employee, type: PersonnelActionType = 'TRANSFER') => {
    const defaultEmployee = employee || activeEmployees[0] || employees[0] || null
    setActionForm(createInitialActionForm(defaultEmployee, type))
    setIsActionDialogOpen(true)
  }, [activeEmployees, employees])

  const handleEmployeePositionChange = useCallback((value: string) => {
    const nextPosition = staffSchedule.find((position) => position.id === value)
    const nextAvailableRate = getAssignableRateForPosition(nextPosition, editingEmployee?.id)

    setEmployeeForm((prev) => ({
      ...prev,
      staffScheduleId: value,
      department: value === 'none' ? prev.department : nextPosition?.department || prev.department,
      employmentRate: value === 'none' ? prev.employmentRate : clampEmploymentRate(prev.employmentRate, nextAvailableRate),
    }))
  }, [editingEmployee?.id, staffSchedule])

  const handleActionTypeChange = useCallback((value: string) => {
    const nextType = value as PersonnelActionType
    const isPositionAction = nextType === 'TRANSFER' || nextType === 'PROMOTE'

    setActionForm((prev) => ({
      ...prev,
      type: nextType,
      staffScheduleId: isPositionAction ? prev.staffScheduleId : 'none',
      newDepartment: isPositionAction ? prev.newDepartment : '',
      employmentRate: isPositionAction ? selectedActionEmployee?.employmentRate || prev.employmentRate || 1 : prev.employmentRate,
      newContractEndDate: nextType === 'EXTEND' ? prev.newContractEndDate : '',
    }))
  }, [selectedActionEmployee?.employmentRate])

  const handleActionEmployeeChange = useCallback((value: string) => {
    const nextEmployee = employees.find((employee) => employee.id === value)

    setActionForm((prev) => ({
      ...prev,
      employeeId: value,
      staffScheduleId: prev.type === 'TRANSFER' || prev.type === 'PROMOTE' ? 'none' : prev.staffScheduleId,
      newDepartment: prev.type === 'TRANSFER' || prev.type === 'PROMOTE' ? '' : prev.newDepartment,
      employmentRate: prev.type === 'TRANSFER' || prev.type === 'PROMOTE' ? nextEmployee?.employmentRate || 1 : prev.employmentRate,
    }))
  }, [employees])

  const handleActionPositionChange = useCallback((value: string) => {
    const nextPosition = staffSchedule.find((position) => position.id === value)
    const nextAvailableRate = getAssignableRateForPosition(nextPosition, selectedActionEmployee?.id)

    setActionForm((prev) => ({
      ...prev,
      staffScheduleId: value,
      newDepartment: value === 'none' ? prev.newDepartment : nextPosition?.department || prev.newDepartment,
      employmentRate: value === 'none' ? prev.employmentRate : clampEmploymentRate(prev.employmentRate, nextAvailableRate),
    }))
  }, [selectedActionEmployee?.id, staffSchedule])

  return {
    loading,
    vacationsLoading,
    activeEmployees,
    staffSchedule,
    vacations,
    personnelActions,
    startOfToday,
    selectedYear,
    setSelectedYear,
    isEmployeeDialogOpen,
    setIsEmployeeDialogOpen,
    isStaffDialogOpen,
    setIsStaffDialogOpen,
    isVacationDialogOpen,
    setIsVacationDialogOpen,
    isActionDialogOpen,
    setIsActionDialogOpen,
    editingEmployee,
    editingStaff,
    editingVacation,
    employeeForm,
    setEmployeeForm,
    staffForm,
    setStaffForm,
    vacationForm,
    setVacationForm,
    actionForm,
    setActionForm,
    employeePositionOptions,
    selectedEmployeePosition,
    availableEmployeeRate,
    calculatedEmployeeSalary,
    transferPositionOptions,
    selectedActionEmployee,
    selectedActionPosition,
    availableActionRate,
    calculatedActionSalary,
    getLiveEmployeeStatus,
    handleSaveEmployee,
    handleSaveStaff,
    handleSaveVacation,
    handleSaveAction,
    handleDeleteStaff,
    handleDeleteVacation,
    handleDeleteAction,
    openEmployeeDialog,
    openStaffDialog,
    openVacationDialog,
    openActionDialog,
    handleEmployeePositionChange,
    handleActionTypeChange,
    handleActionEmployeeChange,
    handleActionPositionChange,
    isContractExpired,
    normalizeEmploymentRateInput,
  }
}
