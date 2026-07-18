'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { Archive, Briefcase, DollarSign, KeyRound, LogOut, Menu, Network, Package, ShieldCheck, UserCog, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

const links = [
  { href: '/', label: 'Имущество', icon: Package },
  { href: '/archive', label: 'Архив имущества', icon: Archive },
  { href: '/projects', label: 'Проекты', icon: Briefcase },
  { href: '/employees', label: 'Сотрудники', icon: Users },
  { href: '/mols', label: 'МОЛ', icon: UserCog },
  { href: '/finance/salary', label: 'Финансы', icon: DollarSign },
]

export function MobileNavigation() {
  const [open, setOpen] = useState(false)
  const { data: session } = useSession()

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
      <Link href="/" className="font-semibold">Consilium</Link>
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
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent">
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
            <Link href="/account/password" onClick={() => setOpen(false)} className="mt-3 flex items-center gap-3 border-t px-3 pt-4 text-sm">
              <KeyRound className="h-4 w-4" />Изменить пароль
            </Link>
            {session?.user.role === 'ADMIN' && (
              <>
                <Link href="/admin/departments" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Network className="h-4 w-4" />Подразделения
                </Link>
                <Link href="/admin/users" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <ShieldCheck className="h-4 w-4" />Пользователи
                </Link>
              </>
            )}
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-3 px-3 py-2 text-sm text-destructive">
              <LogOut className="h-4 w-4" />Выйти
            </button>
          </nav>
        </DialogContent>
      </Dialog>
    </header>
  )
}
