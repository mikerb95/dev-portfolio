import type { APIRoute } from 'astro'
import { serveHoneypot } from '../lib/security/honeypot'

// Honeypot: ruta señuelo de panel PHP. El middleware registra el evento; aquí
// solo tarpit + formulario falso.
export const ALL: APIRoute = () => serveHoneypot('admin')
