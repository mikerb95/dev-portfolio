import GitHub from '@auth/core/providers/github'
import Credentials from '@auth/core/providers/credentials'
import { defineConfig } from 'auth-astro'
import { isAllowedLogin } from './src/lib/auth'
import { verifyPasskeyProof } from './src/lib/webauthn'

export default defineConfig({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    // Login alternativo con llave de seguridad (passwordless). La ceremonia
    // FIDO2 ya corrió en /api/auth/webauthn/*; aquí solo se valida el proof
    // firmado que certifica el resultado, sin repetir esa criptografía.
    Credentials({
      id: 'passkey',
      name: 'Llave de seguridad',
      credentials: { proof: { label: 'proof', type: 'text' } },
      async authorize(credentials) {
        const login = verifyPasskeyProof(credentials?.proof as string | undefined)
        if (!login || !isAllowedLogin(login)) return null
        return { id: login, name: login, login } as unknown as { id: string; name: string }
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, user, account }) {
      if (account?.provider === 'passkey') {
        return isAllowedLogin((user as { login?: string } | undefined)?.login)
      }
      return isAllowedLogin(profile?.login as string | undefined)
    },
    async jwt({ token, profile, user, account }) {
      if (profile) {
        if (profile.login) token.login = (profile.login as string).toLowerCase()
        if (profile.avatar_url) token.picture = profile.avatar_url as string
        // Id único por sesión/dispositivo: permite listar y revocar sesiones
        // desde el panel. Va firmado dentro del JWT, así que no se puede eludir.
        token.sid = crypto.randomUUID()
      } else if (account?.provider === 'passkey' && user) {
        token.login = (user as { login?: string }).login
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
