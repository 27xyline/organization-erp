import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // This is a simple placeholder auth using environment variables or hardcoded values
        // For a real app, you would check database credentials here.
        if (
          credentials?.username === (process.env.ADMIN_USERNAME || 'admin') &&
          credentials?.password === (process.env.ADMIN_PASSWORD || 'admin')
        ) {
          return { id: '1', name: 'Admin User', email: 'admin@example.com', role: 'admin' }
        }
        return null
      }
    })
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
  },
}
