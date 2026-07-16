import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const s = env.COBRO_HISTORY_SECRET, p = '+573104641228'
const h = (d) => createHmac('sha256', s).update(d, 'utf8').digest('hex')
console.log(`r=${h(`ref:${p}`).slice(0,16)}&t=${h(`mis-pagos:${p}`).slice(0,32)}`)
