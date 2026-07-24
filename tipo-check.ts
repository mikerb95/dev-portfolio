import { sinSecretos } from './src/lib/vault'
const out = sinSecretos({ id: 1, secrets: 'cipher' })
console.log(out.secrets)
