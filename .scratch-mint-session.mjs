import { encode } from '@auth/core/jwt'

const secret = process.env.AUTH_SECRET
if (!secret) throw new Error('AUTH_SECRET no está en el entorno')

const sid = crypto.randomUUID()
const token = await encode({
  token: { sub: 'test-user-id', login: 'mikerb95', picture: '', sid },
  secret,
  salt: 'authjs.session-token',
})

console.log(JSON.stringify({ token, sid }))
