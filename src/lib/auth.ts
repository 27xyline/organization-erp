import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { z } from 'zod'
import { BackendRequestError } from '@/lib/backend/client'
import { authenticateBackendCredentials } from '@/lib/backend/bridge'

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(100).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(512),
})

const localHosts = new Set(['localhost', '127.0.0.1'])

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        let response: Response
        try {
          response = await authenticateBackendCredentials(parsed.data.username, parsed.data.password)
        } catch (error) {
          // Authentication fails closed when Python is unavailable or its secrets are missing.
          if (error instanceof BackendRequestError) throw error
          throw new BackendRequestError('Authentication service is unavailable', 503, error)
        }
        if (response.status === 401) return null
        if (!response.ok) {
          throw new BackendRequestError('Authentication service is unavailable', response.status)
        }

        const result = await response.json() as { data?: {
          id: string
          name: string
          username: string
          role: 'ADMIN' | 'EDITOR' | 'VIEWER'
          roles: import('@/lib/auth/permissions').AppRole[]
          sessionVersion: number
          mustChangePassword: boolean
        } | null }
        const user = result.data
        if (!user) return null
        if (!user.id || !user.username || !Number.isSafeInteger(user.sessionVersion)) {
          throw new BackendRequestError('Authentication service returned invalid data', 502)
        }
        return user
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.roles = user.roles
        token.username = user.username
        token.sessionVersion = user.sessionVersion
        token.mustChangePassword = user.mustChangePassword
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || token.sub || ''
        session.user.role = token.role
        session.user.roles = token.roles
        session.user.username = token.username
        session.user.sessionVersion = token.sessionVersion
        session.user.mustChangePassword = token.mustChangePassword
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`

      try {
        const target = new URL(url)
        const base = new URL(baseUrl)
        if (target.origin === base.origin) return url
        if (localHosts.has(target.hostname) && localHosts.has(base.hostname)) return url
      } catch {
        return baseUrl
      }

      return baseUrl
    },
  },
  pages: {
    signIn: '/login',
  },
}
