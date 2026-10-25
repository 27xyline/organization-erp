'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, Briefcase, FileText, Loader2, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  employeeStatusLabels,
  personnelActionLabels,
  vacationTypeLabels,
  type EmployeeStatus,
  type PersonnelActionType,
  type VacationType,
} from '../contracts/types'

interface ProfileData {
  employee: {
    id: string
    code: string
    fullName: string
    department: string
    phone: string | null
    email: string | null
    birthDate: string | null
    education: string | null
    qualification: string | null
    status: EmployeeStatus
    contractSignedDate: string | null
    contractEndDate: string | null
    contractNumber: string | null
    employmentRate: number
    staffSchedule: { id: string; position: string; salary: number } | null
    manager: { id: string; fullName: string } | null
    directReports: Array<{
      id: string
      fullName: string
      staffSchedule: { position: string } | null
    }>
    skills: Array<{ id: string; name: string; level: number | null }>
    certificates: Array<{
      id: string
      name: string
      issuer: string | null
      number: string | null
      issuedAt: string | null
      expiresAt: string | null
    }>
    personnelActions: Array<{
      id: string
      type: PersonnelActionType
      date: string
      description: string | null
      oldPosition: string | null
      newPosition: string | null
    }>
    salaryEntries: Array<{ id: string; year: number; month: number; amount: number }>
    projects: Array<{
      id: string
      position: string
      rate: number
      salary: number
      taskCount: number
      project: { id: string; code: string; name: string; status: string }
    }>
    vacations: Array<{ id: string; type: VacationType; startDate: string; endDate: string }>
    mol: {
      id: string
      code: string
      storageLocation: string
      assets: Array<{
        id: string
        name: string
        inventoryNumber: string
        status: string
        quantity: number
        totalCost: number
      }>
    } | null
    documents: Array<{
      id: string
      title: string
      category: string
      status: string
      updatedAt: string
    }>
  }
  managers: Array<{ id: string; fullName: string }>
}

const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('ru-RU') : '—'
const money = (value: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value)

export function EmployeeProfileClient({
  initialData,
  canEdit,
}: {
  initialData: ProfileData
  canEdit: boolean
}) {
  const router = useRouter()
  const { employee, managers } = initialData
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [birthDate, setBirthDate] = useState(employee.birthDate?.slice(0, 10) || '')
  const [education, setEducation] = useState(employee.education || '')
  const [qualification, setQualification] = useState(employee.qualification || '')
  const [managerId, setManagerId] = useState(employee.manager?.id || '')
  const [skills, setSkills] = useState(
    employee.skills.map((skill) => ({ name: skill.name, level: skill.level?.toString() || '' })),
  )
  const [certificates, setCertificates] = useState(
    employee.certificates.map((certificate) => ({
      name: certificate.name,
      issuer: certificate.issuer || '',
      number: certificate.number || '',
      issuedAt: certificate.issuedAt?.slice(0, 10) || '',
      expiresAt: certificate.expiresAt?.slice(0, 10) || '',
    })),
  )

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/employees/${employee.id}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        birthDate: birthDate || null,
        education: education || null,
        qualification: qualification || null,
        managerId: managerId || null,
        skills: skills.map((skill) => ({
          name: skill.name,
          level: skill.level ? Number(skill.level) : null,
        })),
        certificates: certificates.map((certificate) => ({
          ...certificate,
          issuer: certificate.issuer || null,
          number: certificate.number || null,
          issuedAt: certificate.issuedAt || null,
          expiresAt: certificate.expiresAt || null,
        })),
      }),
    })
    const body = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) {
      setMessage(body.error?.message || 'Не удалось сохранить карточку')
      return
    }
    setOpen(false)
    setMessage('Карточка обновлена')
    router.refresh()
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{employee.fullName}</h1>
            <Badge>{employeeStatusLabels[employee.status]}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {employee.staffSchedule?.position || 'Должность не указана'} · {employee.department}
            {' · '}{employee.employmentRate.toLocaleString('ru-RU')} ставки
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{employee.code}</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Pencil className="mr-2 h-4 w-4" />Редактировать профиль</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
              <form className="grid gap-5" onSubmit={save}>
                <DialogHeader>
                  <DialogTitle>Профессиональный профиль</DialogTitle>
                  <DialogDescription>Образование, компетенции и сертификаты сотрудника.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Дата рождения
                    <Input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Руководитель
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={managerId}
                      onChange={(event) => setManagerId(event.target.value)}
                    >
                      <option value="">Не назначен</option>
                      {managers.map((manager) => (
                        <option key={manager.id} value={manager.id}>{manager.fullName}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <Textarea placeholder="Образование" value={education} onChange={(event) => setEducation(event.target.value)} />
                <Textarea placeholder="Квалификация" value={qualification} onChange={(event) => setQualification(event.target.value)} />

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Навыки</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSkills((items) => [...items, { name: '', level: '' }])}>
                      <Plus className="mr-1 h-4 w-4" />Навык
                    </Button>
                  </div>
                  {skills.map((skill, index) => (
                    <div key={index} className="grid grid-cols-[1fr_100px_auto] gap-2">
                      <Input
                        aria-label={`Навык ${index + 1}`}
                        required
                        minLength={2}
                        value={skill.name}
                        onChange={(event) => setSkills((items) => items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item
                        ))}
                      />
                      <select
                        aria-label={`Уровень навыка ${index + 1}`}
                        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                        value={skill.level}
                        onChange={(event) => setSkills((items) => items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, level: event.target.value } : item
                        ))}
                      >
                        <option value="">Уровень</option>
                        {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}/5</option>)}
                      </select>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setSkills((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Сертификаты</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setCertificates((items) => [...items, { name: '', issuer: '', number: '', issuedAt: '', expiresAt: '' }])}>
                      <Plus className="mr-1 h-4 w-4" />Сертификат
                    </Button>
                  </div>
                  {certificates.map((certificate, index) => (
                    <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                      <Input
                        required
                        minLength={2}
                        placeholder="Название"
                        value={certificate.name}
                        onChange={(event) => setCertificates((items) => items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item
                        ))}
                      />
                      <Input
                        placeholder="Организация"
                        value={certificate.issuer}
                        onChange={(event) => setCertificates((items) => items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, issuer: event.target.value } : item
                        ))}
                      />
                      <Input
                        placeholder="Номер"
                        value={certificate.number}
                        onChange={(event) => setCertificates((items) => items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, number: event.target.value } : item
                        ))}
                      />
                      <div className="flex gap-2">
                        <Input
                          aria-label={`Дата выдачи сертификата ${index + 1}`}
                          type="date"
                          value={certificate.issuedAt}
                          onChange={(event) => setCertificates((items) => items.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, issuedAt: event.target.value } : item
                          ))}
                        />
                        <Input
                          aria-label={`Срок сертификата ${index + 1}`}
                          type="date"
                          value={certificate.expiresAt}
                          onChange={(event) => setCertificates((items) => items.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, expiresAt: event.target.value } : item
                          ))}
                        />
                        <Button type="button" size="icon" variant="ghost" onClick={() => setCertificates((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Сохранить
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {message && <div role="status" className="rounded-md border px-4 py-3 text-sm">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-lg">Основные данные</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div><span className="text-muted-foreground">Дата рождения:</span> {date(employee.birthDate)}</div>
            <div><span className="text-muted-foreground">Телефон:</span> {employee.phone || '—'}</div>
            <div><span className="text-muted-foreground">Email:</span> {employee.email || '—'}</div>
            <div>
              <span className="text-muted-foreground">Руководитель:</span>{' '}
              {employee.manager
                ? <Link className="underline" href={`/employees/${employee.manager.id}`}>{employee.manager.fullName}</Link>
                : '—'}
            </div>
            <div><span className="text-muted-foreground">Договор:</span> {employee.contractNumber || '—'}</div>
            <div><span className="text-muted-foreground">Срок:</span> {date(employee.contractSignedDate)} — {date(employee.contractEndDate)}</div>
            {employee.staffSchedule && <div><span className="text-muted-foreground">Полный оклад:</span> {money(employee.staffSchedule.salary)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Образование и квалификация</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div><div className="mb-1 text-muted-foreground">Образование</div>{employee.education || 'Не указано'}</div>
            <div><div className="mb-1 text-muted-foreground">Квалификация</div>{employee.qualification || 'Не указана'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Команда</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {employee.directReports.length === 0 && <span className="text-muted-foreground">Нет прямых подчинённых</span>}
            {employee.directReports.map((report) => (
              <Link key={report.id} href={`/employees/${report.id}`} className="rounded-md border p-2 hover:bg-accent">
                <div className="font-medium">{report.fullName}</div>
                <div className="text-xs text-muted-foreground">{report.staffSchedule?.position || 'Без должности'}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Award className="h-5 w-5" />Навыки и сертификаты</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {employee.skills.length === 0 && <span className="text-sm text-muted-foreground">Навыки не указаны</span>}
              {employee.skills.map((skill) => <Badge key={skill.id} variant="secondary">{skill.name}{skill.level && ` · ${skill.level}/5`}</Badge>)}
            </div>
            <div className="grid gap-2">
              {employee.certificates.map((certificate) => {
                const expired = certificate.expiresAt && new Date(certificate.expiresAt) < new Date()
                return (
                  <div key={certificate.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{certificate.name}</span>
                      {expired && <Badge variant="destructive">Истёк</Badge>}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {[certificate.issuer, certificate.number, certificate.expiresAt && `до ${date(certificate.expiresAt)}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Briefcase className="h-5 w-5" />Проекты и загрузка</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {employee.projects.length === 0 && <span className="text-sm text-muted-foreground">Нет активных проектов</span>}
            {employee.projects.map((membership) => (
              <Link key={membership.id} href={`/projects/${membership.project.id}`} className="rounded-md border p-3 hover:bg-accent">
                <div className="font-medium">{membership.project.code} — {membership.project.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {membership.position} · {membership.rate.toLocaleString('ru-RU')} ставки · {membership.taskCount} задач
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-lg">История должностей</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {employee.personnelActions.slice(0, 10).map((action) => (
              <div key={action.id} className="border-l-2 pl-3 text-sm">
                <div className="font-medium">{personnelActionLabels[action.type]} · {date(action.date)}</div>
                <div className="text-muted-foreground">{action.description || [action.oldPosition, action.newPosition].filter(Boolean).join(' → ')}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Начисления и отсутствие</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {employee.salaryEntries.slice(0, 6).map((entry) => (
              <div key={entry.id} className="flex justify-between"><span>{entry.month.toString().padStart(2, '0')}.{entry.year}</span><span>{money(entry.amount)}</span></div>
            ))}
            {employee.vacations.slice(0, 4).map((vacation) => (
              <div key={vacation.id} className="rounded-md bg-muted p-2">
                {vacationTypeLabels[vacation.type]}: {date(vacation.startDate)} — {date(vacation.endDate)}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5" />Имущество</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {!employee.mol?.assets.length && <span className="text-sm text-muted-foreground">Закреплённого имущества нет</span>}
            {employee.mol?.assets.map((asset) => (
              <Link key={asset.id} href={`/assets/${asset.id}`} className="rounded-md border p-2 text-sm hover:bg-accent">
                <div className="font-medium">{asset.name}</div>
                <div className="text-xs text-muted-foreground">{asset.inventoryNumber} · {money(asset.totalCost)}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5" />Личные документы</CardTitle>
          <CardDescription>Показываются только документы, доступные текущему пользователю.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {employee.documents.length === 0 && <span className="text-sm text-muted-foreground">Доступных документов нет</span>}
          {employee.documents.map((document) => (
            <Link key={document.id} href={`/documents/${document.id}`} className="rounded-md border p-3 hover:bg-accent">
              <div className="font-medium">{document.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{document.category} · {document.status}</div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </main>
  )
}
