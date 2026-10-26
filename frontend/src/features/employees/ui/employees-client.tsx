'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRightLeft, Briefcase, CalendarDays, UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PersonnelTimeline } from './personnel-timeline'
import { StaffTable } from './staff-table'
import { EmployeesTable } from './employees-table'
import { VacationsCard } from './vacations-card'
import { EmployeeDialog } from './employee-dialog'
import { StaffDialog } from './staff-dialog'
import { VacationDialog } from './vacation-dialog'
import { ActionDialog } from './action-dialog'
import { useEmployeesPage, type EmployeesInitialData } from './use-employees-page'

type EmployeesTab = 'employees' | 'staff' | 'events'

export function EmployeesClient({ initialData, canEdit }: { initialData: EmployeesInitialData; canEdit: boolean }) {
  const [activeTab, setActiveTab] = useState<EmployeesTab>('employees')
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
        className="mb-5 border-b border-border/70 pb-5"
        title="Сотрудники"
        description="Реестр команды, штатное расписание, отпуска и кадровые события."
        actions={canEdit && activeTab === 'employees' ? (
          <Button onClick={() => openEmployeeDialog()}>
            <UserPlus className="mr-2 h-4 w-4" />Новый сотрудник
          </Button>
        ) : canEdit && activeTab === 'staff' ? (
          <Button onClick={() => openStaffDialog()}>
            <Briefcase className="mr-2 h-4 w-4" />Штатная позиция
          </Button>
        ) : canEdit ? (
          <>
            <Button variant="outline" onClick={() => openVacationDialog()}>
              <CalendarDays className="mr-2 h-4 w-4" />Запланировать отпуск
            </Button>
            <Button onClick={() => openActionDialog()}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />Кадровое действие
            </Button>
          </>
        ) : null}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as EmployeesTab)}>
        <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-grid sm:w-auto">
          <TabsTrigger className="px-2 text-xs sm:px-3 sm:text-sm" value="employees">Сотрудники</TabsTrigger>
          <TabsTrigger className="px-2 text-xs sm:px-3 sm:text-sm" value="staff">Штат</TabsTrigger>
          <TabsTrigger className="px-2 text-xs sm:px-3 sm:text-sm" value="events">Кадры</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="mt-0">
          <EmployeesTable
            loading={loading}
            activeEmployees={activeEmployees}
            startOfToday={startOfToday}
            onEditEmployee={openEmployeeDialog}
            onDismissEmployee={(employee) => openActionDialog(employee, 'DISMISS')}
            getLiveStatus={getLiveEmployeeStatus}
            canEdit={canEdit}
          />
        </TabsContent>

        <TabsContent value="staff" className="mt-0">
          <StaffTable
            loading={loading}
            staffSchedule={staffSchedule}
            onEditStaff={openStaffDialog}
            onDeleteStaff={handleDeleteStaff}
            canEdit={canEdit}
          />
        </TabsContent>

        <TabsContent value="events" className="mt-0">
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-4 xl:items-stretch">
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
        </TabsContent>
      </Tabs>

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
