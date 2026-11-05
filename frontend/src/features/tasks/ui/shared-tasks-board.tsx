'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'

const statuses = [
  ['NOT_STARTED', 'Не начата'], ['IN_PROGRESS', 'В работе'],
  ['COMPLETED', 'Завершена'], ['DELAYED', 'Просрочена'],
] as const
type Status = typeof statuses[number][0]
export type Reference = { id: string; fullName: string }
export type InboxTask = {
  id: string; name: string; status: Status; projectId?: string | null; isGeneral?: boolean; isAssignedToMe?: boolean; canReadProject: boolean
  canManageProject?: boolean; description?: string | null; priority?: string; risk?: string
  startDate?: string | null; endDate?: string | null; progress?: number
  assignees?: Array<{ employeeId: string; fullName: string; active?: boolean }>
}
type Props = { tasks: InboxTask[]; canManage: boolean; projects: Array<{ id: string; name: string }>; assignees: Reference[]; employeeId?: string | null; canSelfUpdate?: boolean }

export function SharedTasksBoard({ tasks, canManage, projects, assignees, employeeId, canSelfUpdate = true }: Props) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<InboxTask | null>(null)
  const [creating, setCreating] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [members, setMembers] = useState<Reference[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [dragged, setDragged] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const memberRequest = useRef(0)

  async function send(url: string, method: string, body?: object) {
    setBusy(true); setError('')
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      if (!response.ok) { setError('Не удалось сохранить задачу. Проверьте данные и права доступа.'); return false }
      router.refresh(); return true
    } catch { setError('Не удалось связаться с сервером.'); return false }
    finally { setBusy(false) }
  }
  function canChange(task: InboxTask) {
    const general = task.isGeneral ?? task.projectId === null
    const assigned = task.isAssignedToMe ?? (!!employeeId && !!task.assignees?.some((a) => a.employeeId === employeeId))
    return (canManage && (general || task.canManageProject)) || (canSelfUpdate && assigned)
  }
  async function changeStatus(task: InboxTask, status: Status) {
    if (!canChange(task) || status === task.status) return
    const managerEdit = canManage && ((task.isGeneral ?? task.projectId === null) || task.canManageProject)
    await send(`/api/tasks/${encodeURIComponent(task.id)}${managerEdit ? '' : '/status'}`, managerEdit ? 'PUT' : 'PATCH', { status })
  }
  async function selectProject(id: string) {
    const requestId = ++memberRequest.current
    setProjectId(id); setSelected([]); setMembers([]); setError('')
    if (!id) return
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}/members`)
      if (!response.ok) throw new Error('members')
      const data = await response.json() as { members: Array<{ employeeId: string; employee: { fullName: string } }> }
      if (requestId !== memberRequest.current) return
      setMembers(data.members.map((member) => ({ id: member.employeeId, fullName: member.employee.fullName })))
    } catch { if (requestId === memberRequest.current) setError('Не удалось загрузить участников проекта.') }
  }
  function openEdit(task: InboxTask) { memberRequest.current++; setEditing(task); setCreating(false); setProjectId(''); setSelected((task.assignees || []).map((a) => a.employeeId)) }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const body = { name: String(data.get('name')), description: String(data.get('description')) || null,
      priority: String(data.get('priority')), risk: String(data.get('risk')),
      startDate: String(data.get('startDate')) || null, endDate: String(data.get('endDate')) || null,
      employeeIds: selected }
    const url = editing ? `/api/tasks/${encodeURIComponent(editing.id)}` : projectId ? `/api/projects/${encodeURIComponent(projectId)}/tasks` : '/api/tasks'
    if (await send(url, editing ? 'PUT' : 'POST', body)) { setEditing(null); setCreating(false); setSelected([]) }
  }
  return <main className="container mx-auto px-4 py-8">
    <div className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Задачи</h1><p className="text-sm text-muted-foreground">Общие и проектные задачи</p></div>
      {canManage && <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => { memberRequest.current++; setEditing(null); setCreating(true); setProjectId(''); setSelected([]) }}>Новая задача</button>}</div>
    {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
    {(creating || editing) && <form key={editing?.id || "new"} onSubmit={submit} className="mb-6 grid gap-3 rounded-lg border p-4 md:grid-cols-2">
      <h2 className="font-semibold md:col-span-2">{editing ? 'Изменить задачу' : 'Новая задача'}</h2>
      {!editing && <label>Проект<select className="block w-full rounded border p-2" value={projectId} onChange={(e) => void selectProject(e.target.value)}><option value="">Общая задача</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      <label>Название<input name="name" required maxLength={300} defaultValue={editing?.name} className="block w-full rounded border p-2" /></label>
      <label>Описание<textarea name="description" maxLength={2000} defaultValue={editing?.description || ''} className="block w-full rounded border p-2" /></label>
      <label>Приоритет<select name="priority" defaultValue={editing?.priority || 'MEDIUM'} className="block w-full rounded border p-2"><option value="LOW">Низкий</option><option value="MEDIUM">Средний</option><option value="HIGH">Высокий</option><option value="CRITICAL">Критический</option></select></label>
      <label>Риск<select name="risk" defaultValue={editing?.risk || 'LOW'} className="block w-full rounded border p-2"><option value="LOW">Низкий</option><option value="MEDIUM">Средний</option><option value="HIGH">Высокий</option></select></label>
      <label>Начало<input type="date" name="startDate" defaultValue={editing?.startDate?.slice(0, 10)} className="block w-full rounded border p-2" /></label>
      <label>Окончание<input type="date" name="endDate" defaultValue={editing?.endDate?.slice(0, 10)} className="block w-full rounded border p-2" /></label>
      <fieldset><legend>Исполнители</legend><div className="max-h-40 overflow-auto rounded border p-2">{(projectId ? members : [...assignees, ...(editing?.assignees || []).filter((a) => !assignees.some((ref) => ref.id === a.employeeId)).map((a) => ({ id: a.employeeId, fullName: `${a.fullName} (неактивен)` }))]).map((a) => <label className="block" key={a.id}><input type="checkbox" checked={selected.includes(a.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id))} /> {a.fullName}</label>)}</div></fieldset>
      <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="rounded bg-primary px-3 py-2 text-primary-foreground">Сохранить</button><button type="button" onClick={() => { memberRequest.current++; setCreating(false); setEditing(null) }}>Отмена</button></div>
    </form>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{statuses.map(([status, label]) => <section key={status} className="min-h-40 rounded-lg bg-muted/50 p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const task = tasks.find((item) => item.id === dragged); if (task) void changeStatus(task, status); setDragged(null) }}><h2 className="mb-3 font-semibold">{label}</h2>
      <div className="space-y-3">{tasks.filter((task) => task.status === status).map((task) => <article key={task.id} draggable={canChange(task)} onDragStart={() => setDragged(task.id)} onDragEnd={() => setDragged(null)} className="rounded-md border bg-background p-3 shadow-sm"><h3 className="font-medium">{task.name}</h3><p className="mt-1 text-sm text-muted-foreground">{task.assignees?.map((a) => a.fullName).join(', ') || ''}</p>
        {task.projectId && task.canReadProject && <Link href={`/projects/${task.projectId}`} className="text-sm underline">Открыть проект</Link>}
        {canChange(task) && <label className="mt-2 block text-sm">Статус<select aria-label={`Статус: ${task.name}`} value={task.status} disabled={busy} onChange={(e) => void changeStatus(task, e.target.value as Status)} className="block w-full rounded border p-1">{statuses.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>}
        {canManage && (task.isGeneral ?? task.projectId === null) && <div className="mt-2 flex gap-3 text-sm"><button onClick={() => openEdit(task)}>Изменить</button><button disabled={busy} onClick={() => { if (window.confirm('Удалить задачу?')) void send(`/api/tasks/${encodeURIComponent(task.id)}`, 'DELETE') }}>Удалить</button></div>}
      </article>)}</div></section>)}</div>
  </main>
}
