import { expect, test, type Browser, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_EMPLOYEE } from './global-setup'
import { authenticatedPost } from './authenticated-request'

async function openSignedInPage(browser: Browser, credentials = E2E_ADMIN) {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
  })
  const page = await context.newPage()
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Пользователь').fill(credentials.username)
  await page.getByLabel('Пароль').fill(credentials.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  return { context, page }
}

async function createProject(page: Page, code: string, name: string) {
  const response = await authenticatedPost(page, '/api/projects', {
    data: {
      code,
      name,
      description: 'Projects project E2E',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      plannedBudget: '1000.00',
      actualBudget: '250.00',
      status: 'ACTIVE',
    },
  })
  const body = await response.json()
  expect(response.status(), JSON.stringify(body)).toBe(201)
  return body.data as { id: string }
}

test('Projects projects, members, tasks, dependencies, comments, scopes and Kanban persist through Python', async ({ browser }) => {
  const { context: adminContext, page: admin } = await openSignedInPage(browser)
  const suffix = Date.now().toString(36).toUpperCase()
  const project = await createProject(admin, `E2E-P-${suffix}`, `E2E Projects ${suffix}`)
  const foreignProject = await createProject(admin, `E2E-F-${suffix}`, `E2E Foreign ${suffix}`)

  const employeesResponse = await admin.request.get('/api/employees?scope=all&page=1&pageSize=100')
  expect(employeesResponse.status()).toBe(200)
  const employees = (await employeesResponse.json()).data as Array<{ id: string; code: string }>
  const employee = employees.find((item) => item.code === 'E2E-EMPLOYEE-SCOPE')
  expect(employee, 'E2E employee fixture should exist').toBeTruthy()

  const memberResponse = await authenticatedPost(admin, `/api/projects/${project.id}/members`, {
    data: { employeeId: employee!.id },
  })
  const memberBody = await memberResponse.json()
  expect(memberResponse.status(), JSON.stringify(memberBody)).toBe(200)
  expect(memberBody).toMatchObject({ success: true, member: { employeeId: employee!.id } })
  const membersResponse = await admin.request.get(`/api/projects/${project.id}/members`)
  const membersBody = await membersResponse.json()
  expect(membersResponse.status()).toBe(200)
  expect(membersBody.members).toEqual(expect.arrayContaining([
    expect.objectContaining({ employeeId: employee!.id }),
  ]))

  const firstTaskResponse = await authenticatedPost(admin, `/api/projects/${project.id}/tasks`, {
    data: {
      name: `E2E Projects predecessor ${suffix}`,
      startDate: '2026-10-02',
      endDate: '2026-10-05',
      duration: 3,
      employeeIds: [employee!.id],
      checklist: [{ title: 'Проверить результат', completed: false }],
    },
  })
  const firstTaskBody = await firstTaskResponse.json()
  expect(firstTaskResponse.status(), JSON.stringify(firstTaskBody)).toBe(201)
  const firstTask = firstTaskBody.data as { id: string; checklist: Array<{ title: string }> }
  expect(firstTask.checklist).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: 'Проверить результат' }),
  ]))

  const secondTaskResponse = await authenticatedPost(admin, `/api/projects/${project.id}/tasks`, {
    data: {
      name: `E2E Projects Kanban ${suffix}`,
      startDate: '2026-10-06',
      endDate: '2026-10-09',
      duration: 3,
      employeeIds: [employee!.id],
      predecessorIds: [firstTask.id],
      status: 'NOT_STARTED',
    },
  })
  const secondTaskBody = await secondTaskResponse.json()
  expect(secondTaskResponse.status(), JSON.stringify(secondTaskBody)).toBe(201)
  const task = secondTaskBody.data as { id: string; name: string }
  expect(task.name).toContain('E2E Projects Kanban')

  const commentResponse = await authenticatedPost(admin, `/api/tasks/${task.id}/comments`, {
    data: { body: 'Projects E2E comment' },
  })
  const commentBody = await commentResponse.json()
  expect(commentResponse.status(), JSON.stringify(commentBody)).toBe(201)
  expect(commentBody.data.body).toBe('Projects E2E comment')

  const scoped = await openSignedInPage(browser, E2E_EMPLOYEE)
  const ownProjectRead = await scoped.page.request.get(`/api/projects/${project.id}`)
  expect(ownProjectRead.status()).toBe(200)
  const foreignProjectRead = await scoped.page.request.get(`/api/projects/${foreignProject.id}`)
  expect(foreignProjectRead.status()).toBe(403)
  expect(await foreignProjectRead.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
  const foreignTasksRead = await scoped.page.request.get(`/api/projects/${foreignProject.id}/tasks`)
  expect(foreignTasksRead.status()).toBe(403)

  await admin.goto(`/projects/${project.id}`)
  await expect(admin.getByRole('heading', { name: `E2E Projects ${suffix}` })).toBeVisible()
  await admin.getByRole('tab', { name: 'Задачи' }).click()
  await expect(admin.getByText(/Критический путь:/)).toBeVisible()
  await expect(admin.getByText(new RegExp(`E2E Projects predecessor ${suffix} → E2E Projects Kanban ${suffix}`))).toBeVisible()
  await admin.getByRole('button', { name: 'Канбан' }).click()

  const taskCard = admin.getByRole('button', { name: new RegExp(`E2E Projects Kanban ${suffix}`) })
  const notStarted = admin.getByRole('region', { name: 'Не начата' })
  const inProgress = admin.getByRole('region', { name: 'В работе' })
  await expect(taskCard).toBeVisible()
  await admin.route(`**/api/tasks/${task.id}`, async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 500, json: { error: { message: 'Injected Projects failure' } } })
      return
    }
    await route.continue()
  })
  await taskCard.dragTo(inProgress)
  await expect(admin.getByText('Injected Projects failure')).toBeVisible()
  await expect(notStarted.getByRole('button', { name: new RegExp(`E2E Projects Kanban ${suffix}`) })).toBeVisible()
  await expect(inProgress.getByRole('button', { name: new RegExp(`E2E Projects Kanban ${suffix}`) })).toHaveCount(0)
  await expect(admin.getByLabel('Канбан задач')).toHaveAttribute('aria-busy', 'false')

  await admin.unroute(`**/api/tasks/${task.id}`)
  const statusUpdate = admin.waitForResponse((response) =>
    response.url().endsWith(`/api/tasks/${task.id}`) && response.request().method() === 'PUT',
  )
  await notStarted.getByRole('button', { name: new RegExp(`E2E Projects Kanban ${suffix}`) }).dragTo(inProgress)
  const statusResponse = await statusUpdate
  expect(statusResponse.status()).toBe(200)
  await expect(inProgress.getByRole('button', { name: new RegExp(`E2E Projects Kanban ${suffix}`) })).toBeVisible()
  await admin.reload()
  await admin.getByRole('tab', { name: 'Задачи' }).click()
  await admin.getByRole('button', { name: 'Канбан' }).click()
  await expect(admin.getByRole('region', { name: 'В работе' }).getByRole('button', {
    name: new RegExp(`E2E Projects Kanban ${suffix}`),
  })).toBeVisible()

  const taskDetailResponse = await admin.request.get(`/api/projects/${project.id}/tasks`)
  const taskList = (await taskDetailResponse.json()).data as Array<{ id: string; status: string; predecessors: unknown[] }>
  expect(taskList.find((item) => item.id === task.id)).toMatchObject({ status: 'IN_PROGRESS' })
  await scoped.context.close()
  await adminContext.close()
})
