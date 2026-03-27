'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
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
import { VacationGantt } from '@/components/vacation-gantt'
import { cn, formatCurrency, formatDate, formatDecimal } from '@/lib/utils'
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

type EmployeeStatus = 'ACTIVE' | 'ON_VACATION' | 'ON_SICK_LEAVE' | 'DISMISSED'
type EmploymentContractType = 'PRIMARY' | 'INTERNAL' | 'EXTERNAL'
type VacationType = 'VACATION' | 'SICK_LEAVE' | 'BUSINESS_TRIP' | 'UNPAID_LEAVE'
type PersonnelActionType = 'HIRE' | 'DISMISS' | 'TRANSFER' | 'EXTEND' | 'PROMOTE' | 'ARCHIVE' | 'EDIT'

interface Employee {
  id: string
  code: string
  fullName: string
  department: string
  phone?: string
  email?: string
  photo?: string
  contractType: EmploymentContractType
  contractSignedDate?: Date | null
  contractEndDate?: Date | null
  contractNumber?: string | null
  status: EmployeeStatus
  staffScheduleId?: string | null
  staffSchedule?: {
    id: string
    position: string
    department: string
    rate: number
    salary: number
  } | null
}

interface StaffSchedule {
  id: string
  position: string
  department: string
  rate: number
  salary: number
  employees: Employee[]
}

interface Vacation {
  id: string
  employeeId: string
  employee?: {
    id: string
    fullName: string
    department?: string
  }
  startDate: Date
  endDate: Date
  type: VacationType
}

interface PersonnelAction {
  id: string
  type: PersonnelActionType
  date: Date
  createdAt: Date
  description?: string | null
  isSynthetic?: boolean
  employeeId: string
  employee: {
    id: string
    fullName: string
    department: string
    status: EmployeeStatus
    contractType: EmploymentContractType
    contractSignedDate?: Date | null
    contractEndDate?: Date | null
    contractNumber?: string | null
    staffScheduleId?: string | null
    staffSchedule?: {
      id: string
      position: string
      department: string
    } | null
  }
  oldDepartment?: string | null
  newDepartment?: string | null
  oldPosition?: string | null
  newPosition?: string | null
  oldContractEndDate?: Date | null
  newContractEndDate?: Date | null
}

const employeeStatusLabels: Record<EmployeeStatus, string> = {
  ACTIVE: 'Работает',
  ON_VACATION: 'В отпуске',
  ON_SICK_LEAVE: 'На больничном',
  DISMISSED: 'Уволен',
}

const vacationTypeLabels: Record<VacationType, string> = {
  VACATION: 'Отпуск',
  SICK_LEAVE: 'Больничный',
  BUSINESS_TRIP: 'Командировка',
  UNPAID_LEAVE: 'Без содержания',
}

const employmentContractTypeLabels: Record<EmploymentContractType, string> = {
  PRIMARY: 'Основной',
  INTERNAL: 'Внутренний',
  EXTERNAL: 'Внешний',
}

const staffDepartments = ['НИО-904', 'Лаборатория №4'] as const

const sortEmployeesByName = (a: Employee, b: Employee) =>
  a.fullName.localeCompare(b.fullName, 'ru', { sensitivity: 'base' })

const isContractExpired = (employee: Employee, date: Date) =>
  employee.status !== 'DISMISSED' && Boolean(employee.contractEndDate && employee.contractEndDate < date)

const personnelActionLabels: Record<PersonnelActionType, string> = {
  HIRE: 'Прием',
  DISMISS: 'Увольнение',
  TRANSFER: 'Перевод',
  EXTEND: 'Продление',
  PROMOTE: 'Повышение',
  ARCHIVE: 'Архив',
  EDIT: 'Редактирование',
}

const normalizeEmployee = (employee: any): Employee => ({
  id: employee.id,
  code: employee.code,
  fullName: employee.fullName,
  department: employee.department,
  phone: employee.phone || '',
  email: employee.email || '',
  photo: employee.photo || '',
  contractType: employee.contractType || 'PRIMARY',
  contractSignedDate: employee.contractSignedDate ? new Date(employee.contractSignedDate) : null,
  contractEndDate: employee.contractEndDate ? new Date(employee.contractEndDate) : null,
  contractNumber: employee.contractNumber || '',
  status: employee.status,
  staffScheduleId: employee.staffScheduleId ?? null,
  staffSchedule: employee.staffSchedule
    ? {
        id: employee.staffSchedule.id,
        position: employee.staffSchedule.position,
        department: employee.staffSchedule.department,
        rate: Number(employee.staffSchedule.rate || 0),
        salary: Number(employee.staffSchedule.salary || 0),
      }
    : null,
})

const normalizeStaffSchedule = (position: any): StaffSchedule => ({
  id: position.id,
  position: position.position,
  department: position.department,
  rate: Number(position.rate || 0),
  salary: Number(position.salary || 0),
  employees: (position.employees || []).map(normalizeEmployee),
})

const normalizeVacation = (vacation: any): Vacation => ({
  id: vacation.id,
  employeeId: vacation.employeeId,
  employee: vacation.employee,
  startDate: new Date(vacation.startDate),
  endDate: new Date(vacation.endDate),
  type: vacation.type,
})

const normalizePersonnelAction = (action: any): PersonnelAction => ({
  id: action.id,
  type: action.type,
  date: new Date(action.date),
  createdAt: new Date(action.createdAt),
  description: action.description || '',
  isSynthetic: Boolean(action.isSynthetic),
  employeeId: action.employeeId,
  employee: {
    ...action.employee,
    contractType: action.employee?.contractType || 'PRIMARY',
    contractSignedDate: action.employee?.contractSignedDate ? new Date(action.employee.contractSignedDate) : null,
    contractEndDate: action.employee?.contractEndDate ? new Date(action.employee.contractEndDate) : null,
    contractNumber: action.employee?.contractNumber || '',
  },
  oldDepartment: action.oldDepartment ?? null,
  newDepartment: action.newDepartment ?? null,
  oldPosition: action.oldPosition ?? null,
  newPosition: action.newPosition ?? null,
  oldContractEndDate: action.oldContractEndDate ? new Date(action.oldContractEndDate) : null,
  newContractEndDate: action.newContractEndDate ? new Date(action.newContractEndDate) : null,
})

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

export default function EmployeesPage() {
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
        setEmployees(data.map(normalizeEmployee))
      }

      if (staffResponse.ok) {
        const data = await staffResponse.json()
        setStaffSchedule(data.map(normalizeStaffSchedule))
      }

      const actionsResponse = await fetch('/api/personnel-actions')

      if (actionsResponse.ok) {
        const data = await actionsResponse.json()
        setPersonnelActions(data.map(normalizePersonnelAction))
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

  const occupiedPositionIds = useMemo(
    () =>
      new Set(
        activeEmployees
          .map((employee) => employee.staffScheduleId)
          .filter((value): value is string => Boolean(value))
      ),
    [activeEmployees]
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

  const employeePositionOptions = useMemo(
    () =>
      staffSchedule.filter(
        (position) => !occupiedPositionIds.has(position.id) || position.id === editingEmployee?.staffScheduleId
      ),
    [editingEmployee?.staffScheduleId, occupiedPositionIds, staffSchedule]
  )

  const transferPositionOptions = useMemo(
    () =>
      staffSchedule.filter(
        (position) => !occupiedPositionIds.has(position.id) || position.id === selectedActionEmployee?.staffScheduleId
      ),
    [occupiedPositionIds, selectedActionEmployee?.staffScheduleId, staffSchedule]
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
      alert('Выберите должность из штатного расписания')
      return
    }

    if (!normalizedCode) {
      alert('Заполните табельный номер')
      return
    }

    const duplicateEmployee = employees.find(
      (employee) => employee.code.trim().toLowerCase() === normalizedCode.toLowerCase() && employee.id !== editingEmployee?.id
    )

    if (duplicateEmployee) {
      alert('Сотрудник с таким табельным номером уже существует')
      return
    }

    if (!employeeForm.contractNumber || !employeeForm.contractSignedDate) {
      alert('Заполните номер и дату подписания трудового договора')
      return
    }

    if (employeeForm.contractEndDate && new Date(employeeForm.contractSignedDate) >= new Date(employeeForm.contractEndDate)) {
      alert('Дата подписания договора должна быть раньше срока действия договора')
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
    } catch (error) {
      console.error('Error saving employee:', error)
      alert(error instanceof Error ? error.message : 'Ошибка при сохранении сотрудника')
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
        throw new Error('Failed to save staff schedule position')
      }

      setIsStaffDialogOpen(false)
      setEditingStaff(null)
      await loadBaseData()
    } catch (error) {
      console.error('Error saving staff position:', error)
      alert('Ошибка при сохранении должности')
    }
  }

  const handleSaveVacation = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!vacationForm.employeeId || !vacationForm.startDate || !vacationForm.endDate) {
      alert('Заполните сотрудника и даты отпуска')
      return
    }

    if (new Date(vacationForm.startDate) > new Date(vacationForm.endDate)) {
      alert('Дата окончания не может быть раньше даты начала')
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
    } catch (error) {
      console.error('Error saving vacation:', error)
      alert('Ошибка при сохранении отпуска')
    }
  }

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!actionForm.date) {
      alert('Заполните дату действия')
      return
    }

    if (!actionForm.employeeId) {
      alert('Выберите сотрудника')
      return
    }

    if (actionForm.type === 'TRANSFER' && actionForm.staffScheduleId === 'none') {
      alert('Для перевода выберите новую должность из штатного расписания')
      return
    }

    if (actionForm.type === 'EXTEND' && !actionForm.newContractEndDate) {
      alert('Для продления укажите новую дату окончания договора')
      return
    }

    if (
      actionForm.type === 'EXTEND' &&
      selectedActionEmployee?.contractSignedDate &&
      new Date(actionForm.newContractEndDate) <= selectedActionEmployee.contractSignedDate
    ) {
      alert('Дата подписания договора должна быть раньше срока действия договора')
      return
    }

    try {
      const payload = {
        ...actionForm,
        staffScheduleId: actionForm.staffScheduleId === 'none' ? null : actionForm.staffScheduleId,
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
    } catch (error) {
      console.error('Error saving personnel action:', error)
      alert(error instanceof Error ? error.message : 'Ошибка при сохранении кадрового действия')
    }
  }

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('Удалить должность?')) return

    try {
      const response = await fetch(`/api/staff-schedule/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Ошибка при удалении должности')
        return
      }
      await loadBaseData()
    } catch (error) {
      console.error('Error deleting staff position:', error)
      alert('Ошибка при удалении должности')
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
      alert('Ошибка при удалении отпуска')
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
      alert('Ошибка при удалении кадрового действия')
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
    setActionForm({
      employeeId: activeEmployees[0]?.id || employees[0]?.id || '',
      type: 'TRANSFER',
      date: new Date().toISOString().split('T')[0],
      description: '',
      newDepartment: '',
      staffScheduleId: 'none',
      newContractEndDate: '',
    })
    setIsActionDialogOpen(true)
  }

  const handleEmployeePositionChange = (value: string) => {
    const nextPosition = staffSchedule.find((position) => position.id === value)
    setEmployeeForm((prev) => ({
      ...prev,
      staffScheduleId: value,
      department: value === 'none' ? prev.department : nextPosition?.department || prev.department,
    }))
  }

  const handleActionPositionChange = (value: string) => {
    const nextPosition = staffSchedule.find((position) => position.id === value)
    setActionForm((prev) => ({
      ...prev,
      staffScheduleId: value,
      newDepartment: value === 'none' ? prev.newDepartment : nextPosition?.department || prev.newDepartment,
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
        <Card className="flex h-full flex-col xl:col-span-3">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5" />
                  График отпусков {selectedYear}
                </CardTitle>
              </div>

              <div className="flex items-center gap-2 self-start">
                {selectedYear !== actualCurrentYear && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedYear(actualCurrentYear)}
                    disabled={vacationsLoading}
                  >
                    Текущий год
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setSelectedYear((prev) => prev - 1)}
                  disabled={vacationsLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-[92px] rounded-md border bg-muted/30 px-3 py-2 text-center text-sm font-semibold text-slate-700">
                  {selectedYear}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setSelectedYear((prev) => prev + 1)}
                  disabled={vacationsLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Сотрудников в штате</p>
                <p className="mt-2 text-sm font-medium">{activeEmployees.length}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Записей в графике</p>
                <p className="mt-2 text-sm font-medium">{vacations.length}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Сотрудников с отпусками</p>
                <p className="mt-2 text-sm font-medium">{employeesWithVacations.length}</p>
              </div>
            </div>

            <div className="flex-1">
              {vacationsLoading ? (
                <div className="rounded-xl border border-dashed px-4 py-20 text-center text-sm text-muted-foreground">
                  Загрузка графика отпусков...
                </div>
              ) : (
                <VacationGantt
                  vacations={vacations}
                  employees={activeEmployees}
                  year={selectedYear}
                  expiredEmployeeIds={expiredActiveEmployees.map((employee) => employee.id)}
                  onVacationClick={(vacation) => openVacationDialog(vacation)}
                />
              )}
            </div>

          </CardContent>
        </Card>

        <div className="flex h-full min-h-0 flex-col gap-6 xl:col-span-1">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5" />
                  Штатное расписание
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Должностей</p>
                  <p className="mt-2 font-medium">{staffSchedule.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Ставок</p>
                  <p className="mt-2 font-medium">{formatDecimal(totalRates)}</p>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {loading ? (
                  <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    Загрузка должностей...
                  </div>
                ) : staffSchedule.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    Должности пока не заведены.
                  </div>
                ) : (
                  staffSchedule.map((position) => {
                    const assignedEmployee = position.employees[0]

                    return (
                      <div key={position.id} className="group rounded-xl border p-4 transition-colors hover:bg-slate-50/70">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">{position.position}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{position.department}</p>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openStaffDialog(position)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteStaff(position.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{formatDecimal(position.rate)} ст.</Badge>
                          <Badge variant="outline">Оклад: {formatCurrency(position.salary)}</Badge>
                        </div>

                        {assignedEmployee ? (
                          <div className="mt-3 text-xs text-muted-foreground">
                            Назначен: {assignedEmployee.fullName}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-muted-foreground">
                            Пока не назначена
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <RefreshCw className="h-5 w-5" />
                  Кадровые действия
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Всего действий</p>
                  <p className="mt-2 font-medium">{personnelActions.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">За 30 дней</p>
                    <p className="mt-2 font-medium">
                    {personnelActions.filter((action) => action.createdAt.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000).length}
                    </p>
                  </div>
                </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {loading ? (
                  <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    Загрузка кадровых действий...
                  </div>
                ) : personnelActions.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    Журнал кадровых действий пока пуст.
                  </div>
                ) : (
                  personnelActions.map((action) => (
                    <div key={action.id} className="group rounded-xl border p-4 transition-colors hover:bg-slate-50/70">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-full bg-slate-100 p-2">
                          {getPersonnelActionIcon(action.type)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{action.employee.fullName}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{getPersonnelActionDescription(action)}</p>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{personnelActionLabels[action.type]}</Badge>
                              {action.type !== 'ARCHIVE' && !action.isSynthetic && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                                  onClick={() => handleDeleteAction(action.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{formatDate(action.date)}</span>
                              {(action.oldDepartment || action.newDepartment) && (
                                <span>
                                  {action.oldDepartment || '—'} {'->'} {action.newDepartment || '—'}
                                </span>
                              )}
                            </div>
                            {(action.oldPosition || action.newPosition) && (
                              <span>
                                {action.oldPosition || '—'} {'->'} {action.newPosition || '—'}
                              </span>
                            )}
                            {(action.oldContractEndDate || action.newContractEndDate) && (
                              <span>
                                Договор: {action.oldContractEndDate ? formatDate(action.oldContractEndDate) : '—'} {'->'} {action.newContractEndDate ? formatDate(action.newContractEndDate) : '—'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Сотрудники
              </CardTitle>
            </div>

            <div className="relative w-full lg:w-[320px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Поиск по ФИО, договору, должности"
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">В штате</p>
              <p className="mt-2 text-sm font-medium">{activeEmployees.length} чел.</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Основных договоров</p>
              <p className="mt-2 text-sm font-medium">{activeEmployees.filter((employee) => employee.contractType === 'PRIMARY').length}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Договор истек</p>
              <p className="mt-2 text-sm font-medium">{expiredActiveEmployees.length}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead>ФИО</TableHead>
                  <TableHead>Должность</TableHead>
                  <TableHead>Доля ставки</TableHead>
                  <TableHead>Вид трудового договора</TableHead>
                  <TableHead>Срок действия трудового договора</TableHead>
                  <TableHead>Дата подписания трудового договора</TableHead>
                  <TableHead>Номер трудового договора</TableHead>
                  <TableHead className="w-[96px] text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      Загрузка сотрудников...
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      Сотрудники по текущему фильтру не найдены.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee) => {
                    const liveStatus = getLiveEmployeeStatus(employee)
                    const expiredContract = isContractExpired(employee, startOfToday)

                    return (
                      <TableRow key={employee.id} className={expiredContract ? 'bg-amber-50/40' : undefined}>
                        <TableCell>
                          <div className="min-w-[220px]">
                            <p className="font-medium text-slate-900">{employee.fullName}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{employee.code}</span>
                              {expiredContract && (
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                  Договор истек
                                </Badge>
                              )}
                              {liveStatus.label !== employeeStatusLabels.ACTIVE && (
                                <Badge variant="outline" className={liveStatus.className}>
                                  {liveStatus.label}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{employee.staffSchedule?.position || '—'}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{employee.department || '—'}</p>
                          </div>
                        </TableCell>
                        <TableCell>{employee.staffSchedule ? formatDecimal(employee.staffSchedule.rate) : '—'}</TableCell>
                        <TableCell>{employmentContractTypeLabels[employee.contractType]}</TableCell>
                        <TableCell>{employee.contractEndDate ? formatDate(employee.contractEndDate) : 'Бессрочно'}</TableCell>
                        <TableCell>{employee.contractSignedDate ? formatDate(employee.contractSignedDate) : '—'}</TableCell>
                        <TableCell>{employee.contractNumber || '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEmployeeDialog(employee)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Редактировать сотрудника' : 'Новый сотрудник'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEmployee} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee-code">Табельный номер</Label>
                <Input
                  id="employee-code"
                  value={employeeForm.code}
                  onChange={(e) => setEmployeeForm((prev) => ({ ...prev, code: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-position">Должность</Label>
                <Select value={employeeForm.staffScheduleId} onValueChange={handleEmployeePositionChange}>
                  <SelectTrigger id="employee-position">
                    <SelectValue placeholder="Выберите должность" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeePositionOptions.map((position) => (
                      <SelectItem key={position.id} value={position.id}>
                        {position.position} ({position.department})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee-name">ФИО</Label>
              <Input
                id="employee-name"
                value={employeeForm.fullName}
                onChange={(e) => setEmployeeForm((prev) => ({ ...prev, fullName: e.target.value }))}
                required
              />
            </div>

            <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Подразделение</p>
                <p className="text-sm font-medium">{selectedEmployeePosition?.department || 'Выбери должность'}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Доля ставки</p>
                <p className="text-sm font-medium">{selectedEmployeePosition ? `${formatDecimal(selectedEmployeePosition.rate)} ст.` : 'Выбери должность'}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee-contract-type">Вид трудового договора</Label>
                <Select
                  value={employeeForm.contractType}
                  onValueChange={(value) => setEmployeeForm((prev) => ({ ...prev, contractType: value as EmploymentContractType }))}
                >
                  <SelectTrigger id="employee-contract-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(employmentContractTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-contract-number">Номер трудового договора</Label>
                <Input
                  id="employee-contract-number"
                  value={employeeForm.contractNumber}
                  onChange={(e) => setEmployeeForm((prev) => ({ ...prev, contractNumber: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee-contract-signed">Дата подписания трудового договора</Label>
                <Input
                  id="employee-contract-signed"
                  type="date"
                  value={employeeForm.contractSignedDate}
                  onChange={(e) => setEmployeeForm((prev) => ({ ...prev, contractSignedDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-contract-end">Срок действия трудового договора</Label>
                <Input
                  id="employee-contract-end"
                  type="date"
                  value={employeeForm.contractEndDate}
                  onChange={(e) => setEmployeeForm((prev) => ({ ...prev, contractEndDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsEmployeeDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Сохранить</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingStaff ? 'Редактировать должность' : 'Новая должность'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveStaff} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-position">Название должности</Label>
              <Input
                id="staff-position"
                value={staffForm.position}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, position: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-department">Подразделение</Label>
              <Select
                value={staffForm.department}
                onValueChange={(value) => setStaffForm((prev) => ({ ...prev, department: value }))}
              >
                <SelectTrigger id="staff-department">
                  <SelectValue placeholder="Выберите подразделение" />
                </SelectTrigger>
                <SelectContent>
                  {staffDepartments.map((department) => (
                    <SelectItem key={department} value={department}>
                      {department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-rate">Количество ставок</Label>
                <Input
                  id="staff-rate"
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={staffForm.rate}
                  onChange={(e) => setStaffForm((prev) => ({ ...prev, rate: Number(e.target.value) || 0 }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-salary">Оклад (₽)</Label>
                <Input
                  id="staff-salary"
                  type="number"
                  min="0"
                  step="0.01"
                  value={staffForm.salary}
                  onChange={(e) => setStaffForm((prev) => ({ ...prev, salary: Number(e.target.value) || 0 }))}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsStaffDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Сохранить</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isVacationDialogOpen} onOpenChange={setIsVacationDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVacation ? 'Редактировать отпуск' : 'Новая запись отпуска'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveVacation} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vacation-employee">Сотрудник</Label>
              <Select value={vacationForm.employeeId} onValueChange={(value) => setVacationForm((prev) => ({ ...prev, employeeId: value }))}>
                <SelectTrigger id="vacation-employee">
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vacation-type">Тип отсутствия</Label>
              <Select value={vacationForm.type} onValueChange={(value) => setVacationForm((prev) => ({ ...prev, type: value as VacationType }))}>
                <SelectTrigger id="vacation-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(vacationTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vacation-start">Дата начала</Label>
                <Input
                  id="vacation-start"
                  type="date"
                  value={vacationForm.startDate}
                  onChange={(e) => setVacationForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacation-end">Дата окончания</Label>
                <Input
                  id="vacation-end"
                  type="date"
                  value={vacationForm.endDate}
                  onChange={(e) => setVacationForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className={cn('flex gap-2 pt-2', editingVacation ? 'justify-between' : 'justify-end')}>
              {editingVacation && (
                <Button type="button" variant="destructive" onClick={() => handleDeleteVacation(editingVacation.id)}>
                  Удалить
                </Button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsVacationDialogOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit">Сохранить</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новое кадровое действие</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="action-type">Тип действия</Label>
                <Select
                  value={actionForm.type}
                  onValueChange={(value) => {
                    const nextType = value as PersonnelActionType
                    setActionForm((prev) => ({
                      ...prev,
                      type: nextType,
                      staffScheduleId: nextType === 'TRANSFER' ? prev.staffScheduleId : 'none',
                      newDepartment: nextType === 'TRANSFER' ? prev.newDepartment : '',
                      newContractEndDate: nextType === 'EXTEND' ? prev.newContractEndDate : '',
                    }))
                  }}
                >
                <SelectTrigger id="action-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['TRANSFER', 'DISMISS', 'EXTEND'] as PersonnelActionType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {personnelActionLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="action-employee">Сотрудник</Label>
              <Select
                value={actionForm.employeeId}
                onValueChange={(value) =>
                  setActionForm((prev) => ({
                    ...prev,
                    employeeId: value,
                    staffScheduleId: prev.type === 'TRANSFER' ? 'none' : prev.staffScheduleId,
                    newDepartment: prev.type === 'TRANSFER' ? '' : prev.newDepartment,
                  }))
                }
              >
                <SelectTrigger id="action-employee">
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="action-date">Дата</Label>
              <Input
                id="action-date"
                type="date"
                value={actionForm.date}
                onChange={(e) => setActionForm((prev) => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>

            {actionForm.type === 'TRANSFER' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="action-position">Новая должность</Label>
                  <Select value={actionForm.staffScheduleId} onValueChange={handleActionPositionChange}>
                    <SelectTrigger id="action-position">
                      <SelectValue placeholder="Выберите должность" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferPositionOptions.map((position) => (
                        <SelectItem key={position.id} value={position.id}>
                          {position.position} ({position.department})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Новое подразделение</p>
                    <p className="text-sm font-medium">{selectedActionPosition?.department || 'Выбери должность'}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Новая доля ставки</p>
                    <p className="text-sm font-medium">{selectedActionPosition ? `${formatDecimal(selectedActionPosition.rate)} ст.` : 'Выбери должность'}</p>
                  </div>
                </div>
              </>
            )}

            {actionForm.type === 'EXTEND' && (
              <>
                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Текущий срок договора</p>
                  <p className="mt-2 font-medium">
                    {selectedActionEmployee?.contractEndDate ? formatDate(selectedActionEmployee.contractEndDate) : 'Бессрочно'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="action-contract-end">Новая дата окончания договора</Label>
                  <Input
                    id="action-contract-end"
                    type="date"
                    value={actionForm.newContractEndDate}
                    onChange={(e) => setActionForm((prev) => ({ ...prev, newContractEndDate: e.target.value }))}
                    required
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="action-description">Описание</Label>
              <Textarea
                id="action-description"
                value={actionForm.description}
                onChange={(e) => setActionForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={
                  actionForm.type === 'EXTEND'
                    ? 'Например: продление договора на 12 месяцев'
                    : actionForm.type === 'DISMISS'
                      ? 'Например: увольнение по соглашению сторон'
                      : 'Например: перевод в другой отдел'
                }
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsActionDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Сохранить</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
