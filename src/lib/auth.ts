import { verify } from '@node-rs/argon2'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { z } from 'zod'
import { getDb } from '@/lib/prisma'

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(100).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(512),
})

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$+36IIFx11COz7QN/lSuvTw$mH1nOGOKWcF2DybAY21pMM2Wetr5VL1IleeYHCasrfs'
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000
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

        const db = getDb()
        const user = await db.user.findUnique({
          where: { username: parsed.data.username },
          include: { roleAssignments: { select: { role: true } } },
        })

        if (!user) {
          await verify(DUMMY_PASSWORD_HASH, parsed.data.password)
          return null
        }

        const now = new Date()
        if (!user.isActive || (user.lockedUntil && user.lockedUntil > now)) {
          return null
        }

        const passwordIsValid = await verify(user.passwordHash, parsed.data.password)
        if (!passwordIsValid) {
          const failedLoginAttempts = user.failedLoginAttempts + 1
          await db.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts,
              lockedUntil:
                failedLoginAttempts >= MAX_FAILED_ATTEMPTS
                  ? new Date(now.getTime() + LOCK_DURATION_MS)
                  : null,
            },
          })
          return null
        }

        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: now,
          },
        })

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          roles: user.roleAssignments.map((assignment) => assignment.role),
          sessionVersion: user.sessionVersion,
        }
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
