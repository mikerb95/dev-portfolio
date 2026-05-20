import GitHub from '@auth/core/providers/github'
import { defineConfig } from 'auth-astro'

const ALLOWED_GITHUB_LOGINS = (process.env.ALLOWED_GITHUB_LOGINS ?? 'mikerb95')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export default defineConfig({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const login = (profile?.login as string | undefined)?.toLowerCase()
      if (!login) return false
      return ALLOWED_GITHUB_LOGINS.includes(login)
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        ;(session.user as { id?: string }).id = token.sub
      }
      return session
    },
  },
})
