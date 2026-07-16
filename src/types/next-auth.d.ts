import type { DefaultSession, DefaultUser } from 'next-auth'
import type { DefaultJWT } from 'next-auth/jwt'

type AppRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username: string
      role: AppRole
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    id: string
    username: string
    role: AppRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    username: string
    role: AppRole
  }
}
