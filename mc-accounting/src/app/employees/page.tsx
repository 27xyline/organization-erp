'use client'

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Edit, Trash2, Search, User, Users, Calendar, Building2, UserPlus, UserX, ArrowRightLeft, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Employee {
  id: string
  code: string
  fullName: string
  department: string
  phone?: string
  email?: string
  photo?: string
  status: string
  staffScheduleId?: string
  staffSchedule?: {
    id: string
    position: string
    department: string
    rate: number
    salary: number
  }
}

interface StaffSchedule {
  id: string
  position: string
  department: string
  rate: number
  salary: number
  employees: Employee[]
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [staffSchedule, setStaffSchedule] = useState<StaffSchedule[]>([])
  const [personnelActions, setPersonnelActions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  
  // Dialogs
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false)
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false)
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [editingStaff, setEditingStaff] = useState<StaffSchedule | null>(null)
  
  // Forms
  const [employeeForm, setEmployeeForm] = useState({
    code: '',
    fullName: '',
    department: '',
    phone: '',
    email: '',
    staffScheduleId: '',
  })
  
  const [staffForm, setStaffForm] = useState({
    position: '',
    department: '',
    rate: 1,
    salary: 0,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [empRes, staffRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/staff-schedule'),
      ])
      
      if (empRes.ok) {
        const empData = await empRes.json()
        setEmployees(empData)
      }
      
      if (staffRes.ok) {
        const staffData = await staffRes.json()
        setStaffSchedule(staffData)
      }
      
      // Временные данные для кадровых действий
      setPersonnelActions([
        { id: 1, type: 'hire', employee: 'Иванов И.И.', date: '2024-01-15', description: 'Прием на работу' },
        { id: 2, type: 'transfer', employee: 'Петров П.П.', date: '2024-02-01', description: 'Перевод в IT отдел' },
      ])
      
      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const url = editingEmployee 
      ? `/api/employees/${editingEmployee.id}`
      : '/api/employees'
    
    // Prepare data - convert "none" to null for staffScheduleId
    const dataToSend = {
      ...employeeForm,
      staffScheduleId: employeeForm.staffScheduleId === 'none' ? null : employeeForm.staffScheduleId
    }
    
    try {
      const response = await fetch(url, {
        method: editingEmployee ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      })
      
      if (response.ok) {
        setIsEmployeeDialogOpen(false)
        setEditingEmployee(null)
        loadData()
      } else {
        alert('Ошибка при сохранении')
      }
    } catch (error) {
      console.error('Error saving employee:', error)
      alert('Ошибка при сохранении')
    }
  }

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const url = editingStaff 
      ? `/api/staff-schedule/${editingStaff.id}`
      : '/api/staff-schedule'
    
    try {
      const response = await fetch(url, {
        method: editingStaff ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm),
      })
      
      if (response.ok) {
        setIsStaffDialogOpen(false)
        setEditingStaff(null)
        loadData()
      } else {
        alert('Ошибка при сохранении')
      }
    } catch (error) {
      console.error('Error saving staff position:', error)
      alert('Ошибка при сохранении')
    }
  }

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Удалить сотрудника?')) return
    
    try {
      await fetch(`/api/employees/${id}`, { method: 'DELETE' })
      loadData()
    } catch (error) {
      console.error('Error deleting employee:', error)
    }
  }

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('Удалить должность?')) return
    
    try {
      const response = await fetch(`/api/staff-schedule/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Ошибка при удалении')
      } else {
        loadData()
      }
    } catch (error) {
      console.error('Error deleting staff position:', error)
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
        staffScheduleId: employee.staffScheduleId || 'none',
      })
    } else {
      setEditingEmployee(null)
      setEmployeeForm({
        code: '',
        fullName: '',
        department: '',
        phone: '',
        email: '',
        staffScheduleId: 'none',
      })
    }
    setIsEmployeeDialogOpen(true)
  }

  const openStaffDialog = (staff?: StaffSchedule) => {
    if (staff) {
      setEditingStaff(staff)
      setStaffForm({
        position: staff.position,
        department: staff.department,
        rate: staff.rate,
        salary: staff.salary,
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

  const filteredEmployees = employees.filter((emp) => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      emp.fullName?.toLowerCase().includes(searchLower) ||
      emp.code?.toLowerCase().includes(searchLower) ||
      emp.department?.toLowerCase().includes(searchLower) ||
      emp.staffSchedule?.position?.toLowerCase().includes(searchLower)
    )
  })

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'hire': return <UserPlus className="h-4 w-4 text-green-600" />
      case 'dismiss': return <UserX className="h-4 w-4 text-red-600" />
      case 'transfer': return <ArrowRightLeft className="h-4 w-4 text-blue-600" />
      case 'extend': return <RefreshCw className="h-4 w-4 text-orange-600" />
      default: return <User className="h-4 w-4" />
    }
  }

  const getActionText = (type: string) => {
    switch (type) {
      case 'hire': return 'Прием'
      case 'dismiss': return 'Увольнение'
      case 'transfer': return 'Перевод'
      case 'extend': return 'Продление'
      default: return type
    }
  }

  return (
    <div className="container mx-auto py-6 px-4">
      {/* Шапка */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Сотрудники</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление персоналом и штатным расписанием
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openEmployeeDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Сотрудник
          </Button>
          <Button variant="outline" onClick={() => openStaffDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Должность
          </Button>
        </div>
      </div>

      {/* Основная сетка */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Слева - Таблица с текущим штатом */}
        <div className="xl:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Текущий штат
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-center text-muted-foreground">Загрузка...</div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <p>Нет сотрудников</p>
                    <Button 
                      variant="link" 
                      onClick={() => openEmployeeDialog()}
                      className="mt-2"
                    >
                      Добавить первого сотрудника
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredEmployees.map((employee) => (
                      <div 
                        key={employee.id} 
                        className="p-3 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={employee.photo} alt={employee.fullName} />
                            <AvatarFallback>
                              <User className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{employee.fullName}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {employee.staffSchedule?.position || 'Должность не назначена'}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {employee.department}
                              </Badge>
                              <span className="text-xs text-muted-foreground font-mono">
                                {employee.code}
                              </span>
                            </div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => openEmployeeDialog(employee)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteEmployee(employee.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Центр - График отпусков */}
        <div className="xl:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                График отпусков {new Date().getFullYear()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden bg-white">
                {/* Заголовки месяцев */}
                <div className="flex border-b bg-gray-50">
                  <div className="w-48 p-2 border-r font-medium text-sm bg-gray-100">
                    Сотрудник
                  </div>
                  <div className="flex-1 flex">
                    {['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'].map((month, idx) => (
                      <div 
                        key={idx} 
                        className="flex-1 p-2 text-center text-xs font-medium border-r last:border-r-0"
                      >
                        {month}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Строки сотрудников */}
                <div className="divide-y">
                  {loading ? (
                    <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
                  ) : employees.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      Добавьте сотрудников для отображения графика
                    </div>
                  ) : (
                    employees.map((employee) => (
                      <div key={employee.id} className="flex">
                        <div className="w-48 p-2 border-r bg-gray-50/50 text-sm truncate">
                          {employee.fullName}
                        </div>
                        <div className="flex-1 relative h-10">
                          <div className="absolute inset-0 flex">
                            {Array.from({ length: 12 }).map((_, idx) => (
                              <div key={idx} className="flex-1 border-r last:border-r-0" />
                            ))}
                          </div>
                          <div 
                            className="absolute top-0 bottom-0 bg-yellow-100/50 border-x border-yellow-200"
                            style={{
                              left: `${(new Date().getMonth() / 12) * 100}%`,
                              width: `${100/12}%`
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Справа - Штатное расписание и Кадровые действия */}
        <div className="xl:col-span-1 space-y-6">
          {/* Штатное расписание */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Штатное расписание
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => openStaffDialog()}>
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[250px] overflow-y-auto">
                {staffSchedule.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Нет должностей
                  </div>
                ) : (
                  <div className="divide-y">
                    {staffSchedule.map((position) => (
                      <div key={position.id} className="p-3 hover:bg-muted/50 transition-colors group">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{position.position}</p>
                            <p className="text-xs text-muted-foreground">{position.department}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{position.rate} ст.</Badge>
                              <span className="text-xs font-mono">
                                {position.salary.toLocaleString()} ₽
                              </span>
                            </div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => openStaffDialog(position)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-red-500"
                              onClick={() => handleDeleteStaff(position.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Кадровые действия */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Кадровые действия
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[250px] overflow-y-auto">
                <div className="divide-y">
                  {personnelActions.map((action) => (
                    <div key={action.id} className="p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start gap-3">
                        {getActionIcon(action.type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <p className="font-medium text-sm truncate">{action.employee}</p>
                            <Badge variant="outline" className="text-xs">
                              {getActionText(action.type)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{action.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(action.date).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Диалог сотрудника */}
      <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingEmployee ? 'Редактировать сотрудника' : 'Новый сотрудник'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEmployee} className="space-y-4">
            <div>
              <Label>Табельный номер *</Label>
              <Input 
                value={employeeForm.code}
                onChange={(e) => setEmployeeForm({...employeeForm, code: e.target.value})}
                required
              />
            </div>
            <div>
              <Label>ФИО *</Label>
              <Input 
                value={employeeForm.fullName}
                onChange={(e) => setEmployeeForm({...employeeForm, fullName: e.target.value})}
                required
              />
            </div>
            <div>
              <Label>Отдел *</Label>
              <Input 
                value={employeeForm.department}
                onChange={(e) => setEmployeeForm({...employeeForm, department: e.target.value})}
                required
              />
            </div>
            <div>
              <Label>Должность из штатного расписания</Label>
              <Select 
                value={employeeForm.staffScheduleId || 'none'}
                onValueChange={(value) => setEmployeeForm({...employeeForm, staffScheduleId: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите должность" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не назначена</SelectItem>
                  {staffSchedule.map((pos) => (
                    <SelectItem key={pos.id} value={pos.id}>
                      {pos.position} ({pos.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Телефон</Label>
                <Input 
                  value={employeeForm.phone}
                  onChange={(e) => setEmployeeForm({...employeeForm, phone: e.target.value})}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={employeeForm.email}
                  onChange={(e) => setEmployeeForm({...employeeForm, email: e.target.value})}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsEmployeeDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Сохранить</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Диалог должности */}
      <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? 'Редактировать должность' : 'Новая должность'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveStaff} className="space-y-4">
            <div>
              <Label>Название должности *</Label>
              <Input 
                value={staffForm.position}
                onChange={(e) => setStaffForm({...staffForm, position: e.target.value})}
                required
              />
            </div>
            <div>
              <Label>Отдел *</Label>
              <Input 
                value={staffForm.department}
                onChange={(e) => setStaffForm({...staffForm, department: e.target.value})}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Количество ставок *</Label>
                <Input 
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={staffForm.rate}
                  onChange={(e) => setStaffForm({...staffForm, rate: parseFloat(e.target.value)})}
                  required
                />
              </div>
              <div>
                <Label>Зарплата (₽) *</Label>
                <Input 
                  type="number"
                  min="0"
                  value={staffForm.salary}
                  onChange={(e) => setStaffForm({...staffForm, salary: parseFloat(e.target.value)})}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsStaffDialogOpen(false)}>
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
