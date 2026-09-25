import { hash } from '@node-rs/argon2'
import { createHash } from 'node:crypto'
import {
  ApprovalRequestStatus,
  ApprovalStepStatus,
  AssetMaintenanceStatus,
  AssetMaintenanceType,
  AssetStatus,
  EmployeeStatus,
  EmploymentContractType,
  DocumentCategory,
  DocumentStatus,
  FinancePlanType,
  NotificationChannel,
  NotificationEventType,
  Prisma,
  PrismaClient,
  ProcurementStatus,
  ProjectStatus,
  TaskPriority,
  TaskRisk,
  TaskStatus,
  TimeEntryType,
  UserRole,
} from '@prisma/client'
import { Readable } from 'node:stream'
import { LocalFilesystemStorage } from '../src/features/documents/infrastructure/local-filesystem-storage'
import { withOrganizationMutation } from '../src/lib/organization/organization-mutation'

const departments = [
  ['Отдел информационных технологий', 'IT'],
  ['Бухгалтерия', 'ACC'],
  ['Проектный офис', 'PMO'],
  ['Отдел кадров', 'HR'],
  ['Закупки и снабжение', 'PROC'],
  ['Юридический отдел', 'LEGAL'],
  ['Административный отдел', 'ADMIN'],
  ['Отдел эксплуатации', 'OPS'],
  ['Отдел аналитики', 'BI'],
  ['Служба безопасности', 'SEC'],
] as const

const names = [
  'Иванов Иван Иванович', 'Петрова Мария Сергеевна', 'Смирнов Алексей Викторович',
  'Кузнецова Анна Дмитриевна', 'Соколов Дмитрий Андреевич', 'Попова Елена Павловна',
  'Лебедев Михаил Олегович', 'Новикова Ольга Игоревна', 'Морозов Сергей Николаевич',
  'Волкова Наталья Владимировна', 'Зайцев Павел Евгеньевич', 'Соловьёва Ирина Романовна',
  'Васильев Андрей Максимович', 'Павлова Татьяна Борисовна', 'Семёнов Артём Денисович',
  'Голубева Екатерина Львовна', 'Виноградов Кирилл Юрьевич', 'Богданова Светлана Олеговна',
  'Воробьёв Никита Ильич', 'Фёдорова Алина Рустамовна', 'Михайлов Роман Петрович',
  'Беляева Дарья Константиновна', 'Тарасов Евгений Анатольевич', 'Борисова Полина Сергеевна',
  'Комаров Максим Игоревич', 'Орлова Виктория Андреевна', 'Киселёв Арсений Павлович',
  'Макарова Юлия Денисовна', 'Андреев Григорий Львович', 'Козлова Марина Евгеньевна',
  'Ильин Тимур Рашидович', 'Громова Вероника Михайловна', 'Егоров Владислав Олегович',
  'Фролова Ксения Игоревна', 'Никитин Артём Сергеевич', 'Захарова Валерия Дмитриевна',
  'Максимов Денис Романович', 'Савельева Алиса Ильинична', 'Белов Матвей Андреевич',
  'Жукова Софья Максимовна',
]

const projectNames = [
  'Модернизация корпоративной сети', 'Единый кадровый портал', 'Автоматизация закупок',
  'Переезд центрального офиса', 'Обновление парка оборудования', 'Система электронного архива',
  'Цифровизация бухгалтерии', 'Защита персональных данных', 'Аналитическая платформа',
  'Ремонт конференц-зала', 'Инвентаризация филиалов', 'Новая система пропусков',
  'Обновление серверной инфраструктуры', 'Портал проектного управления', 'Сервис заявок сотрудников',
  'Оптимизация складского учёта', 'Резервное копирование', 'Обучение руководителей',
  'Переход на электронные договоры', 'Реконструкция переговорных', 'Отчётность по проектам',
  'Обновление рабочих мест', 'Система контроля сроков', 'Архив кадровых документов',
]

const taskNames = [
  'Собрать требования и согласовать объём работ',
  'Подготовить техническое решение',
  'Согласовать бюджет и сроки',
  'Подобрать поставщиков и оборудование',
  'Настроить тестовый контур',
  'Провести пилотное внедрение',
  'Обучить пользователей',
  'Проверить результат и закрыть проект',
]

const requestTitles = [
  'Рабочие станции для проектной команды', 'Лицензии офисного программного обеспечения',
  'Сетевое оборудование для филиала', 'Мебель для переговорных комнат',
  'Услуги технического обслуживания', 'Носители для резервного копирования',
  'Расходные материалы для печати', 'Система контроля доступа',
]

const suppliers = [
  'ООО «ТехноСнаб»', 'ООО «ОфисТехника»', 'АО «СвязьКомплект»', 'ООО «ПрофСервис»',
  'ООО «Цифровые решения»', 'ООО «МебельПроект»', 'ООО «ГарантПоставка»',
  'ООО «ИнфраСистемы»', 'ООО «БизнесСофт»', 'ООО «СеверТрейд»',
]

const groups = [
  { code: 'OS', name: 'Основные средства', description: 'Основные средства стоимостью более 100 000 руб.' },
  { code: 'OMC', name: 'Особо ценное движимое имущество', description: 'Особо ценное движимое имущество' },
  { code: 'IM', name: 'Имущество', description: 'Имущество стоимостью от 40 000 до 100 000 руб.' },
  { code: 'MAT', name: 'Материалы', description: 'Материалы и товарно-материальные ценности' },
]

const assetNames = [
  'Ноутбук Lenovo ThinkPad T14', 'Монитор Dell 27 P2722H', 'Док-станция Dell WD19',
  'МФУ Canon imageRUNNER C3025', 'Сервер Dell PowerEdge R750', 'Коммутатор Cisco Catalyst 9200',
  'Маршрутизатор MikroTik CCR2004', 'Проектор Epson EB-2250U', 'Сканер штрихкодов Zebra DS2208',
  'Кресло офисное ErgoPro', 'Шкаф архивный металлический', 'ИБП APC Smart-UPS 1500',
  'Телефон IP Yealink T46U', 'Планшет Samsung Galaxy Tab', 'Веб-камера Logitech Brio',
  'Комплект клавиатура и мышь', 'Точка доступа Wi-Fi 6', 'Огнетушитель порошковый ОП-5',
  'Комплект инструментов электрика', 'Бумага А4 для принтера',
]

const taskStatuses: TaskStatus[] = [
  TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.DELAYED,
]
const procurementStatuses: ProcurementStatus[] = [
  ProcurementStatus.DRAFT, ProcurementStatus.SUBMITTED, ProcurementStatus.APPROVED,
  ProcurementStatus.CONTRACTED, ProcurementStatus.PARTIALLY_DELIVERED,
  ProcurementStatus.DELIVERED, ProcurementStatus.CAPITALIZED, ProcurementStatus.REJECTED,
  ProcurementStatus.CANCELLED,
]

function id(prefix: string, number: number) {
  return `demo_${prefix}_${String(number).padStart(4, '0')}`
}

function dayOffset(offset: number) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + offset)
  return date
}

function monthOffset(offset: number) {
  const date = new Date()
  date.setUTCDate(1)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}

function departmentId(index: number) {
  const name = departments[index][0]
  if (index < 2) {
    const digest = createHash('md5').update(name.toLocaleLowerCase('ru')).digest('hex')
    return `dept_${digest}`
  }
  return id('department', index + 1)
}

function departmentCode(index: number, fallback: string) {
  const name = departments[index][0]
  if (index < 2) {
    const digest = createHash('md5').update(name.toLocaleLowerCase('ru')).digest('hex')
    return `DEP-${digest.slice(0, 8).toUpperCase()}`
  }
  return `DEMO-${fallback}`
}

function money(value: number) {
  return new Prisma.Decimal(value.toFixed(2))
}

export async function seedDemoData(prisma: PrismaClient) {
  const departmentRows = departments.map(([name, shortCode], index) => ({
    id: departmentId(index),
    name,
    code: departmentCode(index, shortCode),
  }))

  // Preserve the original department identities used by the base MOL records.
  await withOrganizationMutation(prisma, async (tx) => {
    for (const department of departmentRows) {
      await tx.department.upsert({
        where: { id: department.id },
        update: {},
        create: department,
      })
    }
  })

  const fetchedDepartments = await prisma.department.findMany({
    where: { id: { in: departmentRows.map((department) => department.id) } },
  })
  const departmentById = new Map(fetchedDepartments.map((department) => [department.id, department]))
  const departmentRecords = departmentRows.map((department) => {
    const record = departmentById.get(department.id)
    if (!record) throw new Error(`Не найдено подразделение ${department.name}`)
    return record
  })

  for (const group of groups) {
    await prisma.assetGroup.upsert({
      where: { code: group.code },
      update: {},
      create: group,
    })
  }
  const assetGroups = await prisma.assetGroup.findMany({ where: { code: { in: groups.map((group) => group.code) } } })
  const groupByCode = new Map(assetGroups.map((group) => [group.code, group]))

  const scheduleRows = []
  for (let index = 0; index < departments.length; index += 1) {
    for (let positionIndex = 0; positionIndex < 3; positionIndex += 1) {
      const positions = ['Руководитель отдела', 'Ведущий специалист', 'Специалист']
      const row = {
        id: id('staff_position', index * 3 + positionIndex + 1),
        position: positions[positionIndex],
        department: departments[index][0],
        departmentId: departmentRecords[index].id,
        rate: money(positionIndex === 0 ? 1 : 2),
        salary: money(150_000 - positionIndex * 30_000 + index * 2_000),
      }
      scheduleRows.push(row)
      await prisma.staffSchedule.upsert({ where: { id: row.id }, update: {}, create: row })
    }
  }

  const demoPasswordHash = await hash('DemoLocal2026!')
  const userDefinitions = [
    { username: 'demo.admin', name: 'Демо Администратор', legacyRole: UserRole.ADMIN, appRole: 'ADMIN' as const },
    { username: 'demo.hr', name: 'Демо Кадровик', legacyRole: UserRole.EDITOR, appRole: 'HR' as const },
    { username: 'demo.project', name: 'Демо Руководитель проектов', legacyRole: UserRole.EDITOR, appRole: 'PROJECT_MANAGER' as const },
    { username: 'demo.finance', name: 'Демо Бухгалтер', legacyRole: UserRole.EDITOR, appRole: 'ACCOUNTANT' as const },
    { username: 'demo.assets', name: 'Демо Ответственный за имущество', legacyRole: UserRole.EDITOR, appRole: 'ASSET_CUSTODIAN' as const },
    { username: 'demo.audit', name: 'Демо Аудитор', legacyRole: UserRole.VIEWER, appRole: 'AUDITOR' as const },
  ]
  const users: Array<{ id: string }> = []
  for (const [index, definition] of userDefinitions.entries()) {
    const user = await prisma.user.upsert({
      where: { username: definition.username },
      update: {},
      create: {
        id: id('user', index + 1),
        username: definition.username,
        name: definition.name,
        role: definition.legacyRole,
        passwordHash: demoPasswordHash,
        mustChangePassword: true,
      },
    })
    users.push(user)
    await prisma.userRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: definition.appRole } },
      update: {},
      create: {
        id: id('role_assignment', index + 1),
        userId: user.id,
        role: definition.appRole,
        departmentScopeMode: 'ALL',
        projectScopeMode: 'ALL',
      },
    })
  }

  const statuses: EmployeeStatus[] = [
    ...Array.from({ length: 34 }, () => EmployeeStatus.ACTIVE),
    EmployeeStatus.ON_VACATION, EmployeeStatus.ON_VACATION,
    EmployeeStatus.ON_SICK_LEAVE, EmployeeStatus.ON_SICK_LEAVE,
    EmployeeStatus.DISMISSED, EmployeeStatus.DISMISSED,
  ]
  const employees = []
  // Create managers first so every reporting relationship points to an existing employee.
  const creationOrder = [...Array.from({ length: 10 }, (_, index) => index), ...Array.from({ length: 30 }, (_, index) => index + 10)]
  for (const index of creationOrder) {
    const deptIndex = index % departments.length
    const managerIndex = index < 10 ? null : index % 10
    const schedule = scheduleRows[deptIndex * 3 + (index < 10 ? 0 : index % 3)]
    const employee = await prisma.employee.upsert({
      where: { code: `DEMO-${String(index + 1).padStart(4, '0')}` },
      update: {},
      create: {
        id: id('employee', index + 1),
        code: `DEMO-${String(index + 1).padStart(4, '0')}`,
        fullName: names[index],
        department: departments[deptIndex][0],
        departmentId: departmentRecords[deptIndex].id,
        contractType: index % 5 === 0 ? EmploymentContractType.INTERNAL : EmploymentContractType.PRIMARY,
        contractSignedDate: dayOffset(-900 - index * 13),
        contractEndDate: index % 7 === 0 ? dayOffset(45 + index) : null,
        contractNumber: `DEMO-EMP-${String(index + 1).padStart(4, '0')}`,
        phone: `+7 (900) 100-${String(index).padStart(2, '0')}-${String((index * 17) % 100).padStart(2, '0')}`,
        email: `employee${index + 1}@demo.example.test`,
        birthDate: dayOffset(-12000 - index * 90),
        education: index % 2 ? 'Высшее образование' : 'Среднее профессиональное',
        qualification: ['Бухгалтерский учёт', 'Управление проектами', 'Информационные системы', 'Делопроизводство'][index % 4],
        managerId: managerIndex === null ? null : id('employee', managerIndex + 1),
        staffScheduleId: schedule.id,
        employmentRate: money(index % 6 === 0 ? 0.5 : 1),
        status: statuses[index],
      },
    })
    employees[index] = employee
    await prisma.employeeSkill.upsert({
      where: { employeeId_name: { employeeId: employee.id, name: ['Excel', 'Управление проектами', 'Документооборот'][index % 3] } },
      update: {},
      create: {
        id: id('skill', index + 1), employeeId: employee.id,
        name: ['Excel', 'Управление проектами', 'Документооборот'][index % 3], level: 1 + index % 5,
      },
    })
    if (index % 4 === 0) {
      await prisma.employeeCertificate.upsert({
        where: { id: id('certificate', index + 1) },
        update: {},
        create: {
          id: id('certificate', index + 1), employeeId: employee.id,
          name: 'Охрана труда и техника безопасности', issuer: 'Учебный центр «Профи»',
          number: `ОТ-${String(index + 1).padStart(4, '0')}`,
          issuedAt: dayOffset(-300), expiresAt: dayOffset(index % 8 === 0 ? 20 : 400),
        },
      })
    }
  }

  for (let index = 0; index < departments.length; index += 1) {
    await prisma.department.updateMany({
      where: { id: departmentRecords[index].id, headEmployeeId: null },
      data: { headEmployeeId: employees[index].id },
    })
  }

  for (let index = 0; index < users.length; index += 1) {
    await prisma.user.updateMany({
      where: { id: users[index].id, employeeId: null },
      data: { employeeId: employees[index].id },
    })
  }

  const mols = []
  for (let index = 0; index < 10; index += 1) {
    const deptIndex = index % departments.length
    const employee = employees[index]
    const mol = await prisma.mol.upsert({
      where: { code: `DEMO-MOL-${String(index + 1).padStart(3, '0')}` },
      update: {},
      create: {
        id: id('mol', index + 1),
        code: `DEMO-MOL-${String(index + 1).padStart(3, '0')}`,
        fullName: employee.fullName,
        department: departments[deptIndex][0],
        departmentId: departmentRecords[deptIndex].id,
        employeeId: employee.id,
        storageLocation: `Кабинет ${101 + index}, этаж ${1 + Math.floor(index / 4)}`,
      },
    })
    mols.push(mol)
  }

  const projectRows = []
  for (let index = 0; index < projectNames.length; index += 1) {
    const status = index < 18 ? ProjectStatus.ACTIVE : index < 22 ? ProjectStatus.COMPLETED : ProjectStatus.ARCHIVED
    const project = await prisma.project.upsert({
      where: { code: `DEMO-PRJ-${String(index + 1).padStart(3, '0')}` },
      update: {},
      create: {
        id: id('project', index + 1),
        code: `DEMO-PRJ-${String(index + 1).padStart(3, '0')}`,
        name: projectNames[index],
        description: `Демонстрационный проект №${index + 1}. Данные предназначены для проверки реестра, фильтров и рабочих сценариев.`,
        goals: 'Согласовать результат, сроки, бюджет и ответственных участников.',
        startDate: dayOffset(-180 + index * 8),
        endDate: dayOffset(status === ProjectStatus.COMPLETED ? -5 : 60 + index * 5),
        status,
        plannedBudget: money(1_500_000 + index * 275_000),
        actualBudget: money(850_000 + index * 198_000),
        plannedRevenue: money(0),
        actualRevenue: money(0),
      },
    })
    projectRows.push(project)
  }

  const projectMembers = new Map<string, string>()
  const projectTasks: Array<{ id: string; projectId: string; index: number }> = []
  for (const [projectIndex, project] of projectRows.entries()) {
    const members = []
    for (let memberIndex = 0; memberIndex < 5; memberIndex += 1) {
      const employee = employees[(projectIndex * 3 + memberIndex) % employees.length]
      const memberId = id('project_member', projectIndex * 5 + memberIndex + 1)
      const projectMember = await prisma.projectMember.upsert({
        where: { projectId_employeeId: { projectId: project.id, employeeId: employee.id } },
        update: {},
        create: {
          id: memberId,
          projectId: project.id,
          employeeId: employee.id,
          department: employee.department,
          position: 'Участник проекта',
          rate: money(memberIndex === 0 ? 1 : 0.5),
          salary: money(85_000 + memberIndex * 12_000),
        },
      })
      members.push({ employee, memberId: projectMember.id })
      projectMembers.set(`${project.id}:${employee.id}`, projectMember.id)
    }

    const taskIds: string[] = []
    for (let taskIndex = 0; taskIndex < taskNames.length; taskIndex += 1) {
      const taskId = id('task', projectIndex * taskNames.length + taskIndex + 1)
      const parentId = taskIndex === 0 || taskIndex === 4 ? null : id('task', projectIndex * taskNames.length + (taskIndex < 4 ? 1 : 5))
      const status = taskStatuses[(projectIndex + taskIndex) % taskStatuses.length]
      const task = await prisma.task.upsert({
        where: { id: taskId },
        update: { projectId: project.id, parentId },
        create: {
          id: taskId,
          projectId: project.id,
          name: taskNames[taskIndex],
          description: `Работа ${taskIndex + 1} в рамках проекта «${project.name}».`,
          level: parentId ? 2 : 1,
          parentId,
          startDate: dayOffset(-30 + taskIndex * 5),
          endDate: dayOffset(10 + taskIndex * 7),
          duration: 5 + taskIndex,
          progress: status === TaskStatus.COMPLETED ? 100 : status === TaskStatus.IN_PROGRESS ? 45 : status === TaskStatus.DELAYED ? 20 : 0,
          status,
          priority: [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.CRITICAL][taskIndex % 4],
          risk: [TaskRisk.LOW, TaskRisk.MEDIUM, TaskRisk.HIGH][(projectIndex + taskIndex) % 3],
          isMilestone: taskIndex === 3 || taskIndex === 7,
          responsible: members[taskIndex % members.length].employee.fullName,
        },
      })
      taskIds.push(task.id)
      projectTasks.push({ id: task.id, projectId: project.id, index: projectIndex * taskNames.length + taskIndex })

      const member = members[taskIndex % members.length]
      await prisma.taskAssignee.upsert({
        where: { taskId_employeeId: { taskId: task.id, employeeId: member.employee.id } },
        update: {},
        create: { id: id('task_assignee', projectIndex * taskNames.length + taskIndex + 1), taskId: task.id, employeeId: member.employee.id, projectMemberId: member.memberId },
      })
      for (let checklistIndex = 0; checklistIndex < 2; checklistIndex += 1) {
        const checklistId = id('checklist', (projectIndex * taskNames.length + taskIndex) * 2 + checklistIndex + 1)
        await prisma.taskChecklistItem.upsert({
          where: { id: checklistId }, update: {},
          create: { id: checklistId, taskId: task.id, title: ['Подготовить материалы', 'Зафиксировать результат'][checklistIndex], completed: checklistIndex === 0 && status === TaskStatus.COMPLETED, order: checklistIndex },
        })
      }
      if (taskIndex === 1) {
        const commentId = id('task_comment', projectIndex + 1)
        await prisma.taskComment.upsert({
          where: { id: commentId }, update: {},
          create: { id: commentId, taskId: task.id, authorId: users[2].id, body: 'Промежуточный результат готов, ожидаем согласование.' },
        })
      }
    }

    for (let taskIndex = 1; taskIndex < taskIds.length; taskIndex += 1) {
      const dependencyId = id('dependency', projectIndex * (taskIds.length - 1) + taskIndex)
      await prisma.taskDependency.upsert({
        where: { predecessorId_successorId: { predecessorId: taskIds[taskIndex - 1], successorId: taskIds[taskIndex] } },
        update: {},
        create: { id: dependencyId, predecessorId: taskIds[taskIndex - 1], successorId: taskIds[taskIndex], lagDays: taskIndex % 3 },
      })
    }
  }

  // HR history and employee availability: holidays, sick leave, transfers, and promotions.
  for (let index = 0; index < employees.length; index += 1) {
    if (index % 3 === 0) {
      await prisma.vacation.upsert({
        where: { id: id('vacation', index + 1) }, update: {},
        create: { id: id('vacation', index + 1), employeeId: employees[index].id, startDate: dayOffset(index % 6 === 0 ? -5 : 25 + index), endDate: dayOffset(index % 6 === 0 ? 5 : 38 + index), type: index % 6 === 0 ? 'SICK_LEAVE' : 'VACATION' },
      })
    }
    if (index % 4 === 0) {
      await prisma.personnelAction.upsert({
        where: { id: id('personnel_action', index + 1) }, update: {},
        create: { id: id('personnel_action', index + 1), employeeId: employees[index].id, type: index % 8 === 0 ? 'PROMOTE' : 'TRANSFER', date: dayOffset(-100 - index), description: 'Демонстрационная кадровая запись', oldDepartment: departments[(index + 1) % departments.length][0], newDepartment: employees[index].department },
      })
    }
  }

  // 120 items across groups, responsible persons, projects, and lifecycle states.
  const assetRows = []
  for (let index = 0; index < 120; index += 1) {
    const groupCode = ['OS', 'OMC', 'IM', 'MAT'][index % 4]
    const group = groupByCode.get(groupCode)
    if (!group) throw new Error(`Не найдена группа имущества ${groupCode}`)
    const mol = mols[index % mols.length]
    const quantity = index % 13 === 0 ? 5 : 1
    const unitPrice = index % 4 === 3 ? 350 + index * 3 : 35_000 + index * 2_500
    const inventoryNumber = index < 4
      ? `INV-2024-${String(index + 1).padStart(3, '0')}`
      : `DEMO-INV-${String(index + 1).padStart(4, '0')}`
    const status: AssetStatus = [AssetStatus.IN_USE, AssetStatus.IN_STOCK, AssetStatus.UNDER_REPAIR, AssetStatus.PLANNED_FOR_DISPOSAL, AssetStatus.PARTIALLY_DISPOSED][index % 5]
    const asset = await prisma.asset.upsert({
      where: { inventoryNumber },
      update: { projectId: projectRows[index % projectRows.length].id },
      create: {
        id: id('asset', index + 1),
        name: assetNames[index % assetNames.length],
        inventoryNumber,
        unitPrice: money(unitPrice),
        unitOfMeasure: groupCode === 'MAT' ? 'упак.' : 'шт.',
        quantity: money(quantity),
        totalCost: money(quantity * unitPrice),
        initialCost: money(quantity * unitPrice),
        usefulLifeMonths: 36 + (index % 7) * 12,
        molId: mol.id,
        groupId: group.id,
        projectId: projectRows[index % projectRows.length].id,
        contractCode: index % 2 === 0 ? `ДЕМО-ДОГ-${String(index + 1).padStart(4, '0')}` : null,
        internalFundingCode: index % 2 === 1 ? `ДЕМО-ФИН-${String(index + 1).padStart(4, '0')}` : null,
        recordingDate: dayOffset(-500 + index * 3),
        documentType: 'Акт приёма-передачи',
        documentDetails: `Демонстрационный документ № ${index + 1}`,
        status,
        notes: index % 9 === 0 ? 'Требуется проверить комплектность и состояние.' : null,
      },
    })
    assetRows.push(asset)
    await prisma.assetHolding.upsert({
      where: { assetId_molId: { assetId: asset.id, molId: asset.molId } },
      update: { quantity: asset.quantity },
      create: { id: id('holding', index + 1), assetId: asset.id, molId: asset.molId, quantity: asset.quantity },
    })
    if (index < 40) {
      await prisma.assetMaintenance.upsert({
        where: { id: id('maintenance', index + 1) }, update: {},
        create: {
          id: id('maintenance', index + 1), assetId: asset.id,
          type: [AssetMaintenanceType.INSPECTION, AssetMaintenanceType.REPAIR, AssetMaintenanceType.SERVICE][index % 3],
          status: [AssetMaintenanceStatus.PLANNED, AssetMaintenanceStatus.COMPLETED, AssetMaintenanceStatus.IN_PROGRESS][index % 3],
          title: ['Плановый осмотр', 'Ремонт оборудования', 'Техническое обслуживание'][index % 3],
          description: 'Демо-запись для проверки календаря и карточки обслуживания.',
          scheduledDate: dayOffset(index % 3 === 0 ? 15 + index : -90 + index),
          nextDueDate: dayOffset(180 + index),
          provider: index % 2 ? 'Внутренняя служба эксплуатации' : 'ООО «ПрофСервис»',
          cost: money(5_000 + index * 1_250), result: index % 3 === 1 ? 'Работы выполнены' : null,
          assetStatusBefore: asset.status,
        },
      })
    }
    if (index < 30) {
      await prisma.operation.upsert({
        where: { id: id('asset_operation', index + 1) }, update: {},
        create: {
          id: id('asset_operation', index + 1), type: 'RECEIPT', assetId: asset.id,
          toMolId: mol.id, quantity: money(quantity), unitPrice: money(unitPrice), totalCost: money(quantity * unitPrice),
          date: dayOffset(-500 + index * 3), reason: 'Поступление по демонстрационной закупке',
          documentType: 'Товарная накладная', documentDetails: `ДЕМО-НАКЛ-${String(index + 1).padStart(4, '0')}`,
        },
      })
    }
  }

  for (let index = 0; index < 3; index += 1) {
    const inventoryId = id('inventory', index + 1)
    const inventory = await prisma.assetInventory.upsert({
      where: { id: inventoryId }, update: {},
      create: {
        id: inventoryId, name: ['Плановая инвентаризация отдела ИТ', 'Проверка имущества бухгалтерии', 'Инвентаризация административного корпуса'][index],
        status: index === 1 ? 'COMPLETED' : 'IN_PROGRESS', molId: mols[index].id, createdById: users[4].id,
        completedAt: index === 1 ? dayOffset(-10) : null,
      },
    })
    for (let itemIndex = 0; itemIndex < 20; itemIndex += 1) {
      const asset = assetRows[index * 20 + itemIndex]
      await prisma.assetInventoryEntry.upsert({
        where: { inventoryId_inventoryNumber: { inventoryId: inventory.id, inventoryNumber: asset.inventoryNumber } },
        update: {},
        create: {
          id: id('inventory_entry', index * 20 + itemIndex + 1), inventoryId, assetId: asset.id,
          inventoryNumber: asset.inventoryNumber, assetName: asset.name, unitOfMeasure: asset.unitOfMeasure,
          expectedQuantity: asset.quantity, foundQuantity: itemIndex % 7 === 0 ? null : asset.quantity,
          note: itemIndex % 7 === 0 ? 'Ожидает фактической проверки' : null,
          scannedById: index === 1 ? users[4].id : null,
          scannedAt: index === 1 ? dayOffset(-10) : null,
        },
      })
    }
  }

  // Vendors and requests cover every procurement status, including contracts and deliveries.
  const supplierRows = []
  for (let index = 0; index < suppliers.length; index += 1) {
    const taxId = String(9_900_000_000 + index)
    const supplier = await prisma.supplier.upsert({
      where: { taxId }, update: {},
      create: { id: id('supplier', index + 1), name: suppliers[index], taxId, email: `sales${index + 1}@supplier.example.test`, phone: `+7 (495) 700-${String(index).padStart(2, '0')}-${String(index * 3).padStart(2, '0')}`, address: `г. Москва, демонстрационный проезд, д. ${index + 1}` },
    })
    supplierRows.push(supplier)
  }
  const procurementRows = []
  for (let index = 0; index < 36; index += 1) {
    const status = procurementStatuses[index % procurementStatuses.length]
    const requestId = id('procurement', index + 1)
    const request = await prisma.procurementRequest.upsert({
      where: { number: `ДЕМО-ЗАК-${String(index + 1).padStart(4, '0')}` },
      update: {},
      create: {
        id: requestId,
        number: `ДЕМО-ЗАК-${String(index + 1).padStart(4, '0')}`,
        title: requestTitles[index % requestTitles.length],
        description: 'Демонстрационная заявка для проверки полного цикла закупки.',
        status,
        budgetLimit: money(180_000 + index * 27_000),
        neededBy: dayOffset(10 + index * 2),
        projectId: projectRows[index % projectRows.length].id,
        requestedById: users[2].id,
      },
    })
    procurementRows.push(request)
    const itemRows = []
    for (let itemIndex = 0; itemIndex < 2; itemIndex += 1) {
      const itemId = id('procurement_item', index * 2 + itemIndex + 1)
      const group = groupByCode.get(['OS', 'IM', 'MAT'][itemIndex])
      const item = await prisma.procurementItem.upsert({
        where: { id: itemId }, update: {},
        create: {
          id: itemId, requestId: request.id,
          name: itemIndex === 0 ? assetNames[index % assetNames.length] : ['Услуги настройки', 'Доставка и монтаж', 'Комплект расходных материалов'][index % 3],
          quantity: money(itemIndex === 0 ? 2 : 1), unit: itemIndex === 0 ? 'шт.' : 'услуга',
          unitPrice: money(15_000 + index * 2_500 + itemIndex * 8_000), groupId: group?.id,
        },
      })
      itemRows.push(item)
    }
    const statusesWithoutContract: ProcurementStatus[] = [ProcurementStatus.DRAFT, ProcurementStatus.SUBMITTED, ProcurementStatus.APPROVED, ProcurementStatus.REJECTED, ProcurementStatus.CANCELLED]
    if (!statusesWithoutContract.includes(status)) {
      const supplier = supplierRows[index % supplierRows.length]
      const contract = await prisma.procurementContract.upsert({
        where: { requestId: request.id }, update: {},
        create: {
          id: id('contract', index + 1), requestId: request.id, supplierId: supplier.id,
          number: `ДЕМО-ДОГ-${String(index + 1).padStart(4, '0')}`,
          amount: money(100_000 + index * 18_000), signedAt: dayOffset(-40 + index), deliveryDueAt: dayOffset(20 + index),
        },
      })
      const statusesWithDelivery: ProcurementStatus[] = [ProcurementStatus.PARTIALLY_DELIVERED, ProcurementStatus.DELIVERED, ProcurementStatus.CAPITALIZED]
      if (statusesWithDelivery.includes(status)) {
        const delivery = await prisma.procurementDelivery.upsert({
          where: { contractId_number: { contractId: contract.id, number: `ДЕМО-ПОСТ-${String(index + 1).padStart(4, '0')}` } },
          update: {},
          create: {
            id: id('delivery', index + 1), requestId: request.id, contractId: contract.id,
            number: `ДЕМО-ПОСТ-${String(index + 1).padStart(4, '0')}`,
            receivedAt: dayOffset(-5 + index), note: status === ProcurementStatus.PARTIALLY_DELIVERED ? 'Получена часть позиций' : 'Поставка принята полностью',
          },
        })
        await prisma.procurementDeliveryItem.upsert({
          where: { deliveryId_procurementItemId: { deliveryId: delivery.id, procurementItemId: itemRows[0].id } },
          update: {},
          create: { id: id('delivery_item', index + 1), deliveryId: delivery.id, procurementItemId: itemRows[0].id, quantity: money(status === ProcurementStatus.PARTIALLY_DELIVERED ? 1 : 2) },
        })
      }
    }
  }

  // Documents have real local text files and checksums, so preview and version download flows work.
  const storage = new LocalFilesystemStorage()
  const documentRows = []
  for (let index = 0; index < 60; index += 1) {
    const documentId = id('document', index + 1)
    const categories: DocumentCategory[] = [DocumentCategory.CONTRACT, DocumentCategory.ORDER, DocumentCategory.ACT, DocumentCategory.INVOICE, DocumentCategory.PERSONNEL, DocumentCategory.PROJECT, DocumentCategory.ASSET, DocumentCategory.GENERAL]
    const category = categories[index % categories.length]
    const documentStatuses: DocumentStatus[] = [DocumentStatus.DRAFT, DocumentStatus.IN_REVIEW, DocumentStatus.APPROVED, DocumentStatus.SIGNED, DocumentStatus.ARCHIVED]
    const currentVersion = index % 10 === 0 ? 2 : 1
    const title = `${['Договор', 'Приказ', 'Акт', 'Счёт', 'Кадровый документ', 'Паспорт проекта', 'Карточка имущества', 'Служебная записка'][index % 8]} № ${String(index + 1).padStart(4, '0')}`
    const documentFields = {
      title,
      description: 'Демонстрационный текстовый документ. Его можно скачать и использовать для проверки версий и карточки документа.',
      category,
      status: documentStatuses[index % documentStatuses.length],
      projectId: index % 2 === 0 ? projectRows[index % projectRows.length].id : null,
      employeeId: index % 3 === 0 ? employees[index % employees.length].id : null,
      assetId: index % 4 === 0 ? assetRows[index % assetRows.length].id : null,
      createdById: users[index % users.length].id,
      archivedAt: index % 5 === 4 ? dayOffset(-2) : null,
    }
    let document = await prisma.document.findUnique({ where: { id: documentId } })
    if (!document) {
      const content = Buffer.from(
        `Демонстрационный документ № ${index + 1}\nВерсия: 1\nНазвание: ${title}\n\nЭто тестовый файл для проверки загрузки и скачивания документов.\n`,
        'utf8',
      )
      const stored = await storage.write(Readable.from([content]), { maxSizeBytes: 2 * 1024 * 1024 })
      document = await prisma.document.create({
        data: {
          id: documentId,
          ...documentFields,
          currentVersion: 1,
          versions: {
            create: {
              id: id('document_version', index * 2 + 1),
              versionNumber: 1,
              storageKey: stored.storageKey,
              originalFilename: `demo-document-${String(index + 1).padStart(3, '0')}-v1.txt`,
              mimeType: 'text/plain', extension: 'txt', sizeBytes: stored.sizeBytes,
              sha256: stored.sha256, comment: 'Начальная версия',
              uploadedById: users[index % users.length].id,
            },
          },
        },
      })
    }
    documentRows.push(document)
    for (let versionNumber = 1; versionNumber <= currentVersion; versionNumber += 1) {
      const existingVersion = await prisma.documentVersion.findUnique({
        where: { documentId_versionNumber: { documentId: document.id, versionNumber } },
      })
      if (!existingVersion) {
        const content = Buffer.from(
          `Демонстрационный документ № ${index + 1}\nВерсия: ${versionNumber}\nНазвание: ${document.title}\n\nЭто тестовый файл для проверки загрузки и скачивания документов.\n`,
          'utf8',
        )
        const stored = await storage.write(Readable.from([content]), { maxSizeBytes: 2 * 1024 * 1024 })
        await prisma.$transaction(async (tx) => {
          await tx.documentVersion.create({
            data: {
              id: id('document_version', index * 2 + versionNumber),
              documentId: document.id,
              versionNumber,
              storageKey: stored.storageKey,
              originalFilename: `demo-document-${String(index + 1).padStart(3, '0')}-v${versionNumber}.txt`,
              mimeType: 'text/plain', extension: 'txt', sizeBytes: stored.sizeBytes,
              sha256: stored.sha256, comment: versionNumber === 1 ? 'Начальная версия' : 'Обновлённая версия для проверки истории',
              uploadedById: users[index % users.length].id,
            },
          })
          if (versionNumber > document.currentVersion) {
            await tx.document.update({ where: { id: document.id }, data: { currentVersion: versionNumber } })
          }
        })
      }
    }
  }

  // Review queue samples, templates, and procurement requests linked to their approval history.
  await prisma.approvalTemplate.upsert({
    where: { name: 'Демо: закупка и договор' }, update: {},
    create: {
      id: 'demo_approval_template_procurement', name: 'Демо: закупка и договор', createdById: users[0].id,
      steps: [
        { sequence: 1, name: 'Руководитель проекта', role: 'PROJECT_MANAGER' },
        { sequence: 2, name: 'Финансовый контроль', role: 'ACCOUNTANT' },
      ],
    },
  })
  const approvals = []
  const approvalStatuses: ApprovalRequestStatus[] = [
    ApprovalRequestStatus.DRAFT, ApprovalRequestStatus.PENDING, ApprovalRequestStatus.APPROVED,
    ApprovalRequestStatus.REJECTED, ApprovalRequestStatus.CANCELLED,
  ]
  for (let index = 0; index < 40; index += 1) {
    const status = approvalStatuses[index % approvalStatuses.length]
    const requestedBy = users[index % users.length]
    const approval = await prisma.approvalRequest.upsert({
      where: { id: id('approval', index + 1) }, update: {},
      create: {
        id: id('approval', index + 1),
        title: `${['Закупка', 'Договор', 'Изменение проекта', 'Документ'][index % 4]}: ${String(index + 1).padStart(3, '0')}`,
        description: 'Демонстрационная карточка согласования с несколькими этапами.',
        entityType: index % 2 === 0 ? 'ProcurementRequest' : 'Document',
        entityId: index % 2 === 0 ? procurementRows[index % procurementRows.length].id : documentRows[index % documentRows.length].id,
        status, currentStep: status === ApprovalRequestStatus.APPROVED ? 2 : status === ApprovalRequestStatus.DRAFT ? 0 : 1,
        dueAt: dayOffset(status === ApprovalRequestStatus.PENDING ? 3 : 20 + index),
        submittedAt: status === ApprovalRequestStatus.DRAFT ? null : dayOffset(-15 + index),
        completedAt: ([ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED, ApprovalRequestStatus.CANCELLED] as ApprovalRequestStatus[]).includes(status) ? dayOffset(-4 + index) : null,
        requestedById: requestedBy.id,
        documentId: documentRows[index % documentRows.length].id,
        projectId: projectRows[index % projectRows.length].id,
      },
    })
    approvals.push(approval)
    for (let stepIndex = 0; stepIndex < 2; stepIndex += 1) {
      let stepStatus: ApprovalStepStatus = ApprovalStepStatus.WAITING
      if (status === ApprovalRequestStatus.DRAFT) stepStatus = ApprovalStepStatus.WAITING
      else if (status === ApprovalRequestStatus.PENDING) stepStatus = stepIndex === 0 ? ApprovalStepStatus.PENDING : ApprovalStepStatus.WAITING
      else if (status === ApprovalRequestStatus.APPROVED) stepStatus = ApprovalStepStatus.APPROVED
      else if (status === ApprovalRequestStatus.REJECTED) stepStatus = stepIndex === 0 ? ApprovalStepStatus.REJECTED : ApprovalStepStatus.SKIPPED
      else stepStatus = ApprovalStepStatus.SKIPPED
      await prisma.approvalStep.upsert({
        where: { requestId_sequence: { requestId: approval.id, sequence: stepIndex + 1 } },
        update: {},
        create: {
          id: id('approval_step', index * 2 + stepIndex + 1),
          requestId: approval.id, sequence: stepIndex + 1,
          name: stepIndex === 0 ? 'Проверка руководителем проекта' : 'Финансовое согласование',
          status: stepStatus, approverId: users[stepIndex === 0 ? 2 : 3].id,
          dueDate: dayOffset(5 + index),
          comment: stepStatus === ApprovalStepStatus.REJECTED ? 'Нужно приложить уточнённую смету.' : null,
          decidedAt: ([ApprovalStepStatus.APPROVED, ApprovalStepStatus.REJECTED, ApprovalStepStatus.SKIPPED] as ApprovalStepStatus[]).includes(stepStatus) ? dayOffset(-4 + index) : null,
        },
      })
    }
    if (index < procurementRows.length && status !== ApprovalRequestStatus.DRAFT) {
      await prisma.procurementRequest.update({
        where: { id: procurementRows[index].id },
        data: { approvalRequestId: approval.id },
      })
    }
  }

  // Salary, financial plan, adjustments, and time sheets for six rolling periods.
  for (let monthIndex = 0; monthIndex < 6; monthIndex += 1) {
    const period = monthOffset(monthIndex - 5)
    const periodId = id('payroll_period', period.year * 100 + period.month)
    await prisma.payrollPeriod.upsert({
      where: { year_month: period }, update: {},
      create: { id: periodId, ...period, status: monthIndex === 5 ? 'OPEN' : 'CLOSED', closedAt: monthIndex === 5 ? null : dayOffset(-30 * (5 - monthIndex)), closedById: monthIndex === 5 ? null : users[3].id },
    })
    for (let employeeIndex = 0; employeeIndex < employees.length; employeeIndex += 1) {
      const employee = employees[employeeIndex]
      const baseSalary = 65_000 + (employeeIndex % 10) * 9_500
      await prisma.salaryEntry.upsert({
        where: { employeeId_year_month: { employeeId: employee.id, ...period } },
        update: {},
        create: { id: id('salary', (monthIndex * employees.length) + employeeIndex + 1), employeeId: employee.id, ...period, amount: money(baseSalary) },
      })
      await prisma.financePlanEntry.upsert({
        where: { employeeId_year_month_type_projectId: { employeeId: employee.id, ...period, type: FinancePlanType.OKLAD, projectId: projectRows[employeeIndex % projectRows.length].id } },
        update: {},
        create: { id: id('finance_plan', monthIndex * employees.length + employeeIndex + 1), employeeId: employee.id, ...period, type: FinancePlanType.OKLAD, amount: money(baseSalary), projectId: projectRows[employeeIndex % projectRows.length].id },
      })
      if (employeeIndex % 8 === 0) {
        await prisma.payrollAdjustment.upsert({
          where: { id: id('payroll_adjustment', monthIndex * 5 + Math.floor(employeeIndex / 8) + 1) },
          update: {},
          create: { id: id('payroll_adjustment', monthIndex * 5 + Math.floor(employeeIndex / 8) + 1), employeeId: employee.id, projectId: projectRows[employeeIndex % projectRows.length].id, ...period, type: employeeIndex % 16 === 0 ? 'BONUS' : 'ONE_TIME', amount: money(5_000 + employeeIndex * 350), description: 'Демонстрационная выплата по проекту' },
        })
      }
    }
  }

  const timeTypes: TimeEntryType[] = [TimeEntryType.REGULAR, TimeEntryType.REGULAR, TimeEntryType.BUSINESS_TRIP, TimeEntryType.OVERTIME]
  for (let index = 0; index < 360; index += 1) {
    const employee = employees[index % employees.length]
    const projectIndex = Math.floor(index / employees.length) % projectRows.length
    const task = projectTasks[(projectIndex * taskNames.length + (index % taskNames.length)) % projectTasks.length]
    await prisma.timeEntry.upsert({
      where: { id: id('time_entry', index + 1) }, update: {},
      create: {
        id: id('time_entry', index + 1), employeeId: employee.id,
        projectId: projectRows[projectIndex].id, taskId: task.id,
        workDate: dayOffset(-90 + (index % 90)), type: timeTypes[index % timeTypes.length],
        hours: money(index % 11 === 0 ? 10 : index % 7 === 0 ? 6 : 8),
        note: index % 9 === 0 ? 'Работа по плану проекта' : null,
      },
    })
  }

  // In-app notifications and saved filters make the personal workspace feel populated.
  const eventTypes: NotificationEventType[] = [
    NotificationEventType.SYSTEM, NotificationEventType.APPROVAL_REQUESTED,
    NotificationEventType.TASK_OVERDUE, NotificationEventType.CONTRACT_EXPIRING,
    NotificationEventType.ASSET_MAINTENANCE_DUE,
  ]
  for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
    for (let itemIndex = 0; itemIndex < 5; itemIndex += 1) {
      const notificationId = id('notification', userIndex * 5 + itemIndex + 1)
      await prisma.notification.upsert({
        where: { userId_dedupeKey_channel: { userId: users[userIndex].id, dedupeKey: `demo-${userIndex + 1}-${itemIndex + 1}`, channel: NotificationChannel.IN_APP } },
        update: {},
        create: {
          id: notificationId, userId: users[userIndex].id,
          eventType: eventTypes[itemIndex], channel: NotificationChannel.IN_APP,
          title: ['Добро пожаловать в демо-среду', 'Ожидает согласование', 'Есть просроченная задача', 'Скоро истекает договор', 'Запланировано обслуживание'][itemIndex],
          body: 'Это тестовое уведомление. Его можно отметить прочитанным или удалить.',
          targetUrl: '/dashboard', entityType: itemIndex === 1 ? 'ApprovalRequest' : null,
          entityId: itemIndex === 1 ? approvals[(userIndex + itemIndex) % approvals.length].id : null,
          dedupeKey: `demo-${userIndex + 1}-${itemIndex + 1}`,
          readAt: itemIndex < 2 ? null : dayOffset(-itemIndex),
        },
      })
      await prisma.notificationPreference.upsert({
        where: { userId_eventType_channel: { userId: users[userIndex].id, eventType: eventTypes[itemIndex], channel: NotificationChannel.IN_APP } },
        update: {},
        create: { id: id('notification_preference', userIndex * 5 + itemIndex + 1), userId: users[userIndex].id, eventType: eventTypes[itemIndex], channel: NotificationChannel.IN_APP, enabled: itemIndex !== 4 },
      })
    }
  }

  for (let index = 0; index < users.length; index += 1) {
    await prisma.reportPreset.upsert({
      where: { id: id('report_preset', index + 1) }, update: {},
      create: {
        id: id('report_preset', index + 1), name: `Демо-отчёт ${index + 1}`,
        metrics: ['employees', 'budget', 'assets'], groupBy: index % 2 ? 'department' : 'project',
        filters: { demo: true, includeArchived: index % 2 === 0 }, createdById: users[index].id,
      },
    })
    await prisma.assetSavedView.upsert({
      where: { userId_name: { userId: users[index].id, name: `Демо: имущество ${index + 1}` } },
      update: {},
      create: {
        id: id('asset_saved_view', index + 1), userId: users[index].id,
        name: `Демо: имущество ${index + 1}`,
        filters: { status: index % 2 ? 'IN_USE' : 'IN_STOCK', includeArchived: false },
      },
    })
  }

  const seededProjects = await prisma.project.findMany({
    where: { code: { in: projectRows.map((project) => project.code) } },
    select: {
      code: true,
      _count: { select: { tasksList: true, assets: true, projectMembers: true } },
    },
  })
  const projectsWithoutRelations = seededProjects.filter(
    (project) => project._count.tasksList === 0 || project._count.assets === 0 || project._count.projectMembers === 0,
  )
  if (seededProjects.length !== projectNames.length || projectsWithoutRelations.length > 0) {
    throw new Error(
      `Демо-набор проектов создан не полностью: ${projectsWithoutRelations.map((project) => project.code).join(', ') || `${seededProjects.length}/${projectNames.length} проектов`}`,
    )
  }

  console.log('Created demo data:', {
    departments: departments.length,
    employees: employees.length,
    projects: projectRows.length,
    tasks: projectTasks.length,
    assets: assetRows.length,
    procurementRequests: procurementRows.length,
    documents: documentRows.length,
    approvals: approvals.length,
    projectsWithTasksAssetsAndEmployees: seededProjects.length,
  })
}
