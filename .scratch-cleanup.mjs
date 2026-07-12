import { createClient } from '@libsql/client'

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
const res = await client.execute({ sql: `DELETE FROM webauthn_credentials WHERE login = ?`, args: ['mikerb95'] })
console.log(`borradas: ${res.rowsAffected}`)
