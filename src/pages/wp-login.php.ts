import type { APIRoute } from 'astro'
import { serveHoneypot } from '../lib/security/honeypot'

// Honeypot: ruta señuelo de WordPress. Ningún usuario legítimo la toca; el
// middleware ya registra el evento. Aquí solo tarpit + login falso.
export const ALL: APIRoute = () => serveHoneypot('wp')
