import GitHub from '@auth/core/providers/github'
import { defineConfig } from 'auth-astro'
import { isAllowedLogin } from './src/lib/auth'

export default defineConfig({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      return isAllowedLogin(profile?.login as string | undefined)
    },
    async jwt({ token, profile }) {
      if (profile) {
        if (profile.login) token.login = (profile.login as string).toLowerCase()
        if (profile.avatar_url) token.picture = profile.avatar_url as string
        // Id único por sesión/dispositivo: permite listar y revocar sesiones
        // desde el panel. Va firmado dentro del JWT, así que no se puede eludir.
        token.sid = crypto.randomUUID()
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) (session.user as { id?: string }).id = token.sub
        if (token.login) (session.user as { login?: string }).login = token.login as string
        if (token.picture) session.user.image = token.picture as string
      }
      if (token.sid) (session as { sid?: string }).sid = token.sid as string
      return session
    },
  },
})
