'use client'

import { Button } from '@/components/ui/button'
import { ArrowRightLeft, Briefcase, CalendarDays, UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { PersonnelTimeline } from './personnel-timeline'
import { StaffTable } from './staff-table'
import { EmployeesTable } from './employees-table'
import { VacationsCard } from './vacations-card'
import { EmployeeDialog } from './employee-dialog'
import { StaffDialog } from './staff-dialog'
import { VacationDialog } from './vacation-dialog'
import { ActionDialog } from './action-dialog'
import { useEmployeesPage, type EmployeesInitialData } from './use-employees-page'

export function EmployeesClient({ initialData, canEdit }: { initialData: EmployeesInitialData; canEdit: boolean }) {
  const {
    loading,
    vacationsLoading,
    activeEmployees,
    staffSchedule,
    departments,
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
      <PageHeader
        className="mb-7 border-b border-border/70 pb-6"
        title="Сотрудники"
        description="Состав команды, штатное расписание и кадровые события."
        actions={canEdit && (
          <>
            <Button onClick={() => openEmployeeDialog()}>
              <UserPlus className="mr-2 h-4 w-4" />Новый сотрудник
            </Button>
            <Button variant="outline" onClick={() => openVacationDialog()}>
              <CalendarDays className="mr-2 h-4 w-4" />Запланировать отпуск
            </Button>
            <Button variant="outline" onClick={() => openStaffDialog()}>
              <Briefcase className="mr-2 h-4 w-4" />Штатная позиция
            </Button>
            <Button variant="outline" onClick={() => openActionDialog()}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />Кадровое действие
            </Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-6 xl:h-[980px] xl:grid-cols-4 xl:items-stretch">
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
        departments={departments}
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
