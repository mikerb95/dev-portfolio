import Credentials from '@auth/core/providers/credentials'
import { defineConfig } from 'auth-astro'

export default defineConfig({
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      authorize(credentials) {
        if (
          credentials.username === process.env.DEV_USER &&
          credentials.password === process.env.DEV_PASSWORD
        ) {
          return { id: '1', name: credentials.username as string }
        }
        return null
      },
    }),
  ],
})
