import type { DefaultSession, DefaultUser } from 'next-auth'
import type { DefaultJWT } from 'next-auth/jwt'
import type { AppRole } from '@/lib/auth/permissions'

type LegacyRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username: string
      role: LegacyRole
      roles: AppRole[]
      sessionVersion: number
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    id: string
    username: string
    role: LegacyRole
    roles: AppRole[]
    sessionVersion: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    username: string
    role: LegacyRole
    roles: AppRole[]
    sessionVersion: number
  }
}
