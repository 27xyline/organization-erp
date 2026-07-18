'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { Archive, Briefcase, DollarSign, Files, KeyRound, LogOut, Menu, Network, Package, ShieldCheck, UserCog, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { AppRole, Permission } from '@/lib/auth/permissions'
import { NotificationBell } from '@/features/notifications/ui/notification-bell'

const links = [
  { href: '/', label: 'Имущество', icon: Package, permission: 'assets.read' },
  { href: '/archive', label: 'Архив имущества', icon: Archive, permission: 'assets.read' },
  { href: '/projects', label: 'Проекты', icon: Briefcase, permission: 'projects.read' },
  { href: '/employees', label: 'Сотрудники', icon: Users, permission: 'employees.read' },
  { href: '/mols', label: 'МОЛ', icon: UserCog, permission: 'mols.read' },
  { href: '/finance/salary', label: 'Финансы', icon: DollarSign, permission: 'finance.salary.read' },
  { href: '/documents', label: 'Документы', icon: Files, permission: 'documents.read' },
]

export function MobileNavigation({ currentUser }: {
  currentUser: { name: string; roles: AppRole[]; permissions: Permission[] }
}) {
  const [open, setOpen] = useState(false)
  const permissionSet = useMemo(() => new Set(currentUser.permissions), [currentUser.permissions])

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
      <Link href="/" className="font-semibold">Consilium</Link>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Открыть меню">
            <Menu className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="left-0 top-0 h-dvh max-w-[320px] translate-x-0 translate-y-0 content-start rounded-none p-4">
          <DialogTitle>Consilium</DialogTitle>
          <DialogDescription>Навигация по разделам</DialogDescription>
          <nav className="mt-4 grid gap-1">
            {links.filter((link) => permissionSet.has(link.permission as Permission)).map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent">
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
            <Link href="/account/password" onClick={() => setOpen(false)} className="mt-3 flex items-center gap-3 border-t px-3 pt-4 text-sm">
              <KeyRound className="h-4 w-4" />Изменить пароль
            </Link>
            {permissionSet.has('departments.create') && (
              <Link href="/admin/departments" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Network className="h-4 w-4" />Подразделения
              </Link>
            )}
            {permissionSet.has('access.users.read') && (
              <Link href="/admin/users" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm">
                <ShieldCheck className="h-4 w-4" />Пользователи
              </Link>
            )}
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-3 px-3 py-2 text-sm text-destructive">
              <LogOut className="h-4 w-4" />Выйти
            </button>
          </nav>
        </DialogContent>
        </Dialog>
      </div>
    </header>
  )
}
