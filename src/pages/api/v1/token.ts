import type { APIRoute } from 'astro'
import { serveHoneypot } from '../../../lib/security/honeypot'

// Honeypot: endpoint de API señuelo (los scanners prueban /api/v1/token). El
// middleware registra el evento; aquí solo tarpit + 401 plausible.
export const ALL: APIRoute = () => serveHoneypot('apitoken')
