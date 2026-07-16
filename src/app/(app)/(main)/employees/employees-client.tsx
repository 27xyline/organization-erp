'use client'

import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PersonnelTimeline } from '@/components/employees/personnel-timeline'
import { StaffTable } from '@/components/employees/staff-table'
import { EmployeesTable } from '@/components/employees/employees-table'
import { VacationsCard } from '@/components/employees/vacations-card'
import { EmployeeDialog } from '@/components/employees/employee-dialog'
import { StaffDialog } from '@/components/employees/staff-dialog'
import { VacationDialog } from '@/components/employees/vacation-dialog'
import { ActionDialog } from '@/components/employees/action-dialog'
import { useEmployeesPage, type EmployeesInitialData } from './use-employees-page'

export function EmployeesClient({ initialData, canEdit }: { initialData: EmployeesInitialData; canEdit: boolean }) {
  const {
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
    handleDeleteAction,
    openEmployeeDialog,
    openStaffDialog,
    openVacationDialog,
    openActionDialog,
    handleEmployeePositionChange,
    handleActionTypeChange,
    handleActionEmployeeChange,
    handleActionPositionChange,
  } = useEmployeesPage(initialData)

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Сотрудники</h1>
        </div>

        {canEdit && <div className="flex flex-wrap gap-2">
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
          <Button variant="outline" onClick={() => openActionDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Действие
          </Button>
        </div>}
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
        canEdit={canEdit}
      />

      <EmployeesTable
        loading={loading}
        activeEmployees={activeEmployees}
        startOfToday={startOfToday}
        onEditEmployee={openEmployeeDialog}
        onDismissEmployee={(employee) => openActionDialog(employee, 'DISMISS')}
        getLiveStatus={getLiveEmployeeStatus}
        canEdit={canEdit}
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
