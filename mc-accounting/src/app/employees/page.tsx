'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { VacationGantt } from '@/components/vacation-gantt'
import { cn, formatCurrency, formatDate, formatDateTime, formatDecimal } from '@/lib/utils'
import {
  Archive,
  ArrowRightLeft,
  Briefcase,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react'

import { PersonnelTimeline } from '@/components/employees/personnel-timeline'
import { StaffTable } from '@/components/employees/staff-table'
import { EmployeesTable } from '@/components/employees/employees-table'
import { VacationsCard } from '@/components/employees/vacations-card'
import { EmployeeDialog } from '@/components/employees/employee-dialog'
import { StaffDialog } from '@/components/employees/staff-dialog'
import { VacationDialog } from '@/components/employees/vacation-dialog'
import { ActionDialog } from '@/components/employees/action-dialog'

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
  employmentContractTypeLabels,
  personnelActionLabels
} from '@/types'
import {
  normalizeEmployee,
  normalizeStaffSchedule,
  normalizeVacation,
  normalizePersonnelAction
} from '@/lib/normalize'

const staffDepartments = ['НИО-904', 'Лаборатория №4'] as const

const sortEmployeesByName = (a: Employee, b: Employee) =>
  a.fullName.localeCompare(b.fullName, 'ru', { sensitivity: 'base' })

const DetailSummaryItem = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border bg-slate-50/80 px-4 py-3">
    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    <p className="mt-2 text-sm font-medium leading-snug text-slate-900">{value}</p>
  </div>
)

const isContractExpired = (employee: Employee, date: Date) =>
  employee.status !== 'DISMISSED' && Boolean(employee.contractEndDate && employee.contractEndDate < date)



const isDateInRange = (date: Date, startDate: Date, endDate: Date) => date >= startDate && date <= endDate

const getPersonnelActionIcon = (type: PersonnelActionType) => {
  switch (type) {
    case 'HIRE':
      return <UserPlus className="h-4 w-4 text-emerald-600" />
    case 'DISMISS':
      return <UserX className="h-4 w-4 text-rose-600" />
    case 'TRANSFER':
      return <ArrowRightLeft className="h-4 w-4 text-blue-600" />
    case 'EXTEND':
      return <RefreshCw className="h-4 w-4 text-amber-600" />
    case 'PROMOTE':
      return <Briefcase className="h-4 w-4 text-violet-600" />
    case 'ARCHIVE':
      return <Archive className="h-4 w-4 text-slate-600" />
    case 'EDIT':
      return <Edit className="h-4 w-4 text-sky-600" />
    default:
      return <User className="h-4 w-4" />
  }
}

const getPersonnelActionDescription = (action: PersonnelAction) => {
  if (action.description) return action.description

  switch (action.type) {
    case 'HIRE':
      if (action.newContractEndDate) {
        return `Прием по договору до ${formatDate(action.newContractEndDate)}`
      }
      return action.newDepartment ? `Прием в подразделение ${action.newDepartment}` : 'Прием на работу'
    case 'DISMISS':
      return 'Увольнение сотрудника'
    case 'TRANSFER':
      if (action.oldDepartment && action.newDepartment && action.oldDepartment !== action.newDepartment) {
        return `${action.oldDepartment} -> ${action.newDepartment}`
      }
      if (action.oldPosition && action.newPosition && action.oldPosition !== action.newPosition) {
        return `${action.oldPosition} -> ${action.newPosition}`
      }
      return 'Кадровый перевод'
    case 'EXTEND':
      if (action.newContractEndDate) {
        return `Продление договора до ${formatDate(action.newContractEndDate)}`
      }
      return 'Продление срока действия договора'
    case 'PROMOTE':
      return 'Повышение сотрудника'
    case 'ARCHIVE':
      return 'Закончился срок действия трудового договора'
    case 'EDIT':
      return 'Изменены данные сотрудника'
    default:
      return personnelActionLabels[action.type]
  }
}

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

export default function EmployeesPage() {
  const { toast } = useToast()
  const actualCurrentYear = useMemo(() => new Date().getFullYear(), [])
  const startOfToday = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }, [])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [staffSchedule, setStaffSchedule] = useState<StaffSchedule[]>([])
  const [vacations, setVacations] = useState<Vacation[]>([])
  const [liveStatusVacations, setLiveStatusVacations] = useState<Vacation[]>([])
  const [personnelActions, setPersonnelActions] = useState<PersonnelAction[]>([])
  const [loading, setLoading] = useState(true)
  const [vacationsLoading, setVacationsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedYear, setSelectedYear] = useState(actualCurrentYear)
  const hasInitializedVacations = useRef(false)

  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false)
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false)
  const [isVacationDialogOpen, setIsVacationDialogOpen] = useState(false)
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)

  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [editingStaff, setEditingStaff] = useState<StaffSchedule | null>(null)
  const [editingVacation, setEditingVacation] = useState<Vacation | null>(null)

  const [employeeForm, setEmployeeForm] = useState({
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

  const [staffForm, setStaffForm] = useState({
    position: '',
    department: '',
    rate: 1,
    salary: 0,
  })

  const [vacationForm, setVacationForm] = useState({
    employeeId: '',
    startDate: '',
    endDate: '',
    type: 'VACATION' as VacationType,
  })

  const [actionForm, setActionForm] = useState({
    employeeId: '',
    type: 'TRANSFER' as PersonnelActionType,
    date: new Date().toISOString().split('T')[0],
    description: '',
    newDepartment: '',
    staffScheduleId: 'none',
    employmentRate: 1,
    newContractEndDate: '',
  })

  const loadBaseData = async () => {
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
        setStaffSchedule(data.map(normalizeStaffSchedule))
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
  }

  const loadVacationsForYear = async (year: number, refreshLiveStatus = false) => {
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
        const normalizedVacations = data.map(normalizeVacation)
        setVacations(normalizedVacations)

        if (year === actualCurrentYear) {
          setLiveStatusVacations(normalizedVacations)
        }
      }

      if (liveStatusResponse?.ok) {
        const data = await liveStatusResponse.json()
        setLiveStatusVacations(data.map(normalizeVacation))
      }
    } catch (error) {
      console.error('Error loading vacations:', error)
    } finally {
      setVacationsLoading(false)
    }
  }

  useEffect(() => {
    const initializePage = async () => {
      await Promise.all([
        loadBaseData(),
        loadVacationsForYear(actualCurrentYear, true),
      ])
      hasInitializedVacations.current = true
    }

    initializePage()
  }, [actualCurrentYear])

  useEffect(() => {
    if (!hasInitializedVacations.current) return
    loadVacationsForYear(selectedYear)
  }, [selectedYear])

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status !== 'DISMISSED').sort(sortEmployeesByName),
    [employees]
  )

  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return activeEmployees

    const value = searchTerm.trim().toLowerCase()

    return activeEmployees.filter((employee) => {
      return (
        employee.fullName.toLowerCase().includes(value) ||
        employee.code.toLowerCase().includes(value) ||
        employee.department.toLowerCase().includes(value) ||
        (employee.contractNumber || '').toLowerCase().includes(value) ||
        employee.staffSchedule?.position?.toLowerCase().includes(value)
      )
    })
  }, [activeEmployees, searchTerm])

  const employeesWithVacations = useMemo(
    () => activeEmployees.filter((employee) => vacations.some((vacation) => vacation.employeeId === employee.id)),
    [activeEmployees, vacations]
  )

  const expiredActiveEmployees = useMemo(
    () => activeEmployees.filter((employee) => isContractExpired(employee, startOfToday)),
    [activeEmployees, startOfToday]
  )

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

  const getLiveEmployeeStatus = (employee: Employee) => {
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
  }

  const handleSaveEmployee = async (e: React.FormEvent) => {
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
      contractType: employeeForm.contractType,
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
  }

  const handleSaveStaff = async (e: React.FormEvent) => {
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
  }

  const handleSaveVacation = async (e: React.FormEvent) => {
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
  }

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!actionForm.date) {
      toast.error('Заполните дату действия')
      return
    }

    if (!actionForm.employeeId) {
      toast.error('Выберите сотрудника')
      return
    }

    if (actionForm.type === 'TRANSFER' && actionForm.staffScheduleId === 'none') {
      toast.error('Для перевода выберите новую должность из штатного расписания')
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
      await loadBaseData()
      toast.success('Кадровое действие успешно зафиксировано')
    } catch (error) {
      console.error('Error saving personnel action:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка при сохранении кадрового действия')
    }
  }

  const handleDeleteStaff = async (id: string) => {
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
  }

  const handleDeleteVacation = async (id: string) => {
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
  }

  const handleDeleteAction = async (id: string) => {
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
  }

  const openEmployeeDialog = (employee?: Employee) => {
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
      setEmployeeForm({
        code: '',
        fullName: '',
        department: '',
        phone: '',
        email: '',
        contractType: 'PRIMARY',
        contractSignedDate: '',
        contractEndDate: '',
        contractNumber: '',
        staffScheduleId: 'none',
        employmentRate: 1,
        status: 'ACTIVE',
      })
    }

    setIsEmployeeDialogOpen(true)
  }

  const openStaffDialog = (position?: StaffSchedule) => {
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
      setStaffForm({
        position: '',
        department: '',
        rate: 1,
        salary: 0,
      })
    }

    setIsStaffDialogOpen(true)
  }

  const openVacationDialog = (vacation?: Vacation) => {
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
        employeeId: filteredEmployees[0]?.id || activeEmployees[0]?.id || '',
        startDate: '',
        endDate: '',
        type: 'VACATION',
      })
    }

    setIsVacationDialogOpen(true)
  }

  const openActionDialog = () => {
    const defaultEmployee = activeEmployees[0] || employees[0] || null

    setActionForm({
      employeeId: defaultEmployee?.id || '',
      type: 'TRANSFER',
      date: new Date().toISOString().split('T')[0],
      description: '',
      newDepartment: '',
      staffScheduleId: 'none',
      employmentRate: defaultEmployee?.employmentRate || 1,
      newContractEndDate: '',
    })
    setIsActionDialogOpen(true)
  }

  const handleEmployeePositionChange = (value: string) => {
    const nextPosition = staffSchedule.find((position) => position.id === value)
    const nextAvailableRate = getAssignableRateForPosition(nextPosition, editingEmployee?.id)

    setEmployeeForm((prev) => ({
      ...prev,
      staffScheduleId: value,
      department: value === 'none' ? prev.department : nextPosition?.department || prev.department,
      employmentRate: value === 'none' ? prev.employmentRate : clampEmploymentRate(prev.employmentRate, nextAvailableRate),
    }))
  }

  const handleActionTypeChange = (value: string) => {
    const nextType = value as PersonnelActionType

    setActionForm((prev) => ({
      ...prev,
      type: nextType,
      staffScheduleId: nextType === 'TRANSFER' ? prev.staffScheduleId : 'none',
      newDepartment: nextType === 'TRANSFER' ? prev.newDepartment : '',
      employmentRate: nextType === 'TRANSFER' ? selectedActionEmployee?.employmentRate || prev.employmentRate || 1 : prev.employmentRate,
      newContractEndDate: nextType === 'EXTEND' ? prev.newContractEndDate : '',
    }))
  }

  const handleActionEmployeeChange = (value: string) => {
    const nextEmployee = employees.find((employee) => employee.id === value)

    setActionForm((prev) => ({
      ...prev,
      employeeId: value,
      staffScheduleId: prev.type === 'TRANSFER' ? 'none' : prev.staffScheduleId,
      newDepartment: prev.type === 'TRANSFER' ? '' : prev.newDepartment,
      employmentRate: prev.type === 'TRANSFER' ? nextEmployee?.employmentRate || 1 : prev.employmentRate,
    }))
  }

  const handleActionPositionChange = (value: string) => {
    const nextPosition = staffSchedule.find((position) => position.id === value)
    const nextAvailableRate = getAssignableRateForPosition(nextPosition, selectedActionEmployee?.id)

    setActionForm((prev) => ({
      ...prev,
      staffScheduleId: value,
      newDepartment: value === 'none' ? prev.newDepartment : nextPosition?.department || prev.newDepartment,
      employmentRate: value === 'none' ? prev.employmentRate : clampEmploymentRate(prev.employmentRate, nextAvailableRate),
    }))
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Сотрудники</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openEmployeeDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Сотрудник
          </Button>
          <Button variant="outline" onClick={() => openVacationDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Отпуск
          </Button>
          <Button variant="outline" onClick={() => openStaffDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Должность
          </Button>
          <Button variant="outline" onClick={openActionDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Действие
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:min-h-[980px] xl:grid-cols-4 xl:items-stretch">
        <VacationsCard
          vacationsLoading={vacationsLoading}
          vacations={vacations}
          activeEmployees={activeEmployees}
          startOfToday={startOfToday}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          onVacationClick={openVacationDialog}
        />

        <PersonnelTimeline
          loading={loading}
          personnelActions={personnelActions}
          onDeleteAction={handleDeleteAction}
        />
      </div>

      <StaffTable
        loading={loading}
        staffSchedule={staffSchedule}
        onEditStaff={openStaffDialog}
        onDeleteStaff={handleDeleteStaff}
      />

      <EmployeesTable
        loading={loading}
        activeEmployees={activeEmployees}
        startOfToday={startOfToday}
        onEditEmployee={openEmployeeDialog}
        getLiveStatus={getLiveEmployeeStatus}
      />

      <EmployeeDialog
        open={isEmployeeDialogOpen}
        onOpenChange={setIsEmployeeDialogOpen}
        editingEmployee={editingEmployee}
        formData={employeeForm}
        setFormData={setEmployeeForm}
        positionOptions={employeePositionOptions}
        onPositionChange={handleEmployeePositionChange}
        onSave={handleSaveEmployee}
        selectedPosition={selectedEmployeePosition}
        availableRate={availableEmployeeRate}
        calculatedSalary={calculatedEmployeeSalary}
      />

      <StaffDialog
        open={isStaffDialogOpen}
        onOpenChange={setIsStaffDialogOpen}
        editingStaff={editingStaff}
        formData={staffForm}
        setFormData={setStaffForm}
        onSave={handleSaveStaff}
      />

      <VacationDialog
        open={isVacationDialogOpen}
        onOpenChange={setIsVacationDialogOpen}
        editingVacation={editingVacation}
        formData={vacationForm}
        setFormData={setVacationForm}
        onSave={handleSaveVacation}
        employees={activeEmployees}
      />

      <ActionDialog
        open={isActionDialogOpen}
        onOpenChange={setIsActionDialogOpen}
        formData={actionForm}
        setFormData={setActionForm}
        onSave={handleSaveAction}
        employees={activeEmployees}
        onActionTypeChange={handleActionTypeChange}
        onEmployeeChange={handleActionEmployeeChange}
        onPositionChange={handleActionPositionChange}
        transferPositionOptions={transferPositionOptions}
        selectedActionEmployee={selectedActionEmployee}
        selectedActionPosition={selectedActionPosition}
        availableActionRate={availableActionRate}
        calculatedActionSalary={calculatedActionSalary}
      />
    </div>
  )
}
