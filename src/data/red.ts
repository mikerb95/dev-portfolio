// Fuente de verdad del diagrama de red de /docs/diagrama-red.
//
// Es la vista de operación, no la de diseño: zonas de confianza, qué host puede
// alcanzar a cuál, por qué puerto y qué control atraviesa el tráfico al cruzar
// la frontera. Complementa al diagrama de despliegue, que responde a la otra
// pregunta (qué artefacto corre en qué entorno de ejecución).
//
// OPSEC: aquí solo entra lo que ya es público en /security y /status. Puertos
// estándar, protocolos, nombres de proveedores y controles POR CATEGORÍA.
// Nunca umbrales del rate limit, nombres de reglas de detección, rutas
// honeypot ni patrones de la blocklist: un diagrama de red con ese detalle
// deja de documentar la defensa y pasa a ser el manual para rodearla.

import type { RedModel } from '../lib/red-layout'

const produccion: RedModel = {
  id: 'produccion',
  titulo: 'Red de producción (codebymike.tech)',
  desc:
    'Quién puede hablar con quién. Cuatro zonas de confianza y un único camino entre Internet y los datos: todo request atraviesa el perímetro antes de existir para la aplicación, y ningún origen externo alcanza la base de datos, ni siquiera la pasarela de pagos cuando devuelve un webhook.',
  origen: 'src/middleware.ts · src/lib/security/* · src/db/index.ts · src/lib/demo.ts',
  nota:
    'El dato que este diagrama aporta y el de despliegue no puede: la pasarela de pagos aparece dos veces a propósito. Sale del cómputo como destino de confianza baja (flujo 15) y vuelve como origen no confiable por la puerta principal (flujo 5), sujeta al mismo perímetro que cualquier visitante. Un webhook que entrara por un camino privilegiado sería una zona de confianza regalada a un tercero.',
  zonas: [
    {
      id: 'internet',
      label: 'Internet',
      nota: 'No confiable. Todo lo que entra por aquí se asume hostil hasta que el perímetro diga lo contrario.',
      nivel: 0,
      col: 0,
      span: 5,
    },
    {
      id: 'borde',
      label: 'Perímetro (red de borde de Vercel)',
      nota: 'Corre antes de la caché y antes del cómputo. Es el único punto de entrada.',
      nivel: 1,
      col: 0,
      span: 5,
    },
    {
      id: 'computo',
      label: 'Cómputo de aplicación',
      nota: 'Solo alcanzable desde el perímetro. Nunca se expone una dirección directa.',
      nivel: 2,
      col: 0,
      span: 5,
    },
    {
      id: 'datos',
      label: 'Datos gestionados',
      nota: 'Privada. Sin ruta desde Internet: sus credenciales solo existen en el servidor.',
      nivel: 3,
      col: 0,
      span: 3,
    },
    {
      id: 'terceros',
      label: 'Terceros salientes',
      nota: 'No confiables. Reciben tráfico, nunca lo originan hacia dentro.',
      nivel: 0,
      col: 3,
      span: 2,
    },
  ],
  hosts: [
    // ── Internet
    {
      id: 'visitante',
      zona: 'internet',
      label: 'Navegador del visitante',
      rol: 'cliente anónimo',
      col: 0,
      detalle: ['/ · /status · /notes · /docs'],
    },
    {
      id: 'operador',
      zona: 'internet',
      label: 'Navegador autenticado',
      rol: 'cliente con sesión',
      col: 1,
      detalle: ['/admin · /portal'],
    },
    {
      id: 'cron',
      zona: 'internet',
      label: 'cron-job.org',
      rol: 'disparador externo',
      col: 2,
      detalle: ['GET /api/cron/*'],
    },
    {
      id: 'github',
      zona: 'internet',
      label: 'GitHub',
      rol: 'identidad y despliegue',
      col: 3,
      detalle: ['OAuth 2.0 · Actions'],
    },
    {
      id: 'wompi-hook',
      zona: 'internet',
      label: 'Wompi (webhook)',
      rol: 'tercero entrante',
      col: 4,
      detalle: ['evento de pago de vuelta'],
    },

    // ── Perímetro
    {
      id: 'waf',
      zona: 'borde',
      label: 'Mitigación DDoS y WAF',
      rol: 'perímetro',
      col: 0,
      detalle: ['filtra antes de que exista el request'],
    },
    {
      id: 'middleware',
      zona: 'borde',
      label: 'Routing Middleware',
      rol: 'perímetro programable',
      col: 1,
      detalle: ['clasificador de amenazas · rate limit durable', 'blocklist · allowlist de /admin · cabeceras'],
    },
    {
      id: 'cache',
      zona: 'borde',
      label: 'Caché de borde',
      rol: 'perímetro',
      col: 2,
      detalle: ['respuestas públicas ya calculadas'],
    },

    // ── Cómputo
    {
      id: 'app',
      zona: 'computo',
      label: 'Fluid Compute · Node 22',
      rol: 'cómputo',
      col: 1,
      detalle: ['páginas SSR y rutas /api', 'única identidad con credenciales de datos'],
    },

    // ── Datos
    { id: 'turso', zona: 'datos', label: 'Turso · producción', rol: 'datos', col: 0, detalle: ['libSQL gestionado'] },
    { id: 'turso-demo', zona: 'datos', label: 'Turso · demo', rol: 'datos', col: 1, detalle: ['instancia separada'] },
    { id: 'blob', zona: 'datos', label: 'Vercel Blob', rol: 'datos', col: 2, detalle: ['respaldos y capturas'] },
    { id: 'redis', zona: 'datos', label: 'Upstash Redis', rol: 'datos efímeros', col: 3, detalle: ['estado vivo con TTL'] },

    // ── Terceros
    { id: 'wompi', zona: 'terceros', label: 'Wompi · pasarela', rol: 'tercero', col: 0, detalle: ['cobros salientes'] },
    { id: 'ntfy', zona: 'terceros', label: 'ntfy.sh', rol: 'tercero', col: 1, detalle: ['canal de alertas'] },
    { id: 'resend', zona: 'terceros', label: 'Resend', rol: 'tercero', col: 2, detalle: ['correo transaccional'] },
  ],
  flujos: [
    // ── Internet → perímetro. Todo entra por el mismo sitio, sin excepción.
    {
      from: 'visitante',
      to: 'waf',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      bidireccional: true,
      controles: ['TLS 1.3', 'HSTS con preload', 'CSP en enforce sobre la respuesta'],
    },
    {
      from: 'operador',
      to: 'waf',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      bidireccional: true,
      controles: ['TLS 1.3', 'cookie de sesión HttpOnly y SameSite', 'noindex y no-store en toda ruta privada'],
    },
    {
      from: 'cron',
      to: 'waf',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      controles: ['Bearer CRON_SECRET comparado en tiempo constante'],
    },
    {
      from: 'github',
      to: 'waf',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      controles: ['OAuth 2.0', 'allowlist de cuentas revalidada en cada request'],
    },
    {
      from: 'wompi-hook',
      to: 'waf',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      controles: ['firma del evento verificada', 'idempotencia por clave del pago'],
      detalle: 'El webhook de la pasarela entra como cualquier otro request de Internet.',
    },

    // ── Dentro del perímetro
    {
      from: 'waf',
      to: 'middleware',
      protocolo: 'en proceso',
      detalle: 'Lo que sobrevive al filtro llega al middleware, todavía antes de la caché.',
    },
    {
      from: 'middleware',
      to: 'cache',
      protocolo: 'en proceso',
      detalle: 'Un acierto de caché se sirve aquí: la respuesta sale sin tocar el cómputo.',
    },

    // ── Perímetro → cómputo
    {
      from: 'middleware',
      to: 'app',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      bidireccional: true,
      controles: [
        'request ya clasificado y limitado',
        'ruta canónica sin prefijo de idioma',
        'sesión de admin o de portal exigida por ruta',
      ],
    },

    // ── Cómputo → datos
    {
      from: 'app',
      to: 'turso',
      protocolo: 'libSQL sobre TLS',
      puerto: '443/tcp',
      controles: ['credencial solo de servidor', 'clientId de la sesión siempre en el WHERE del portal'],
    },
    {
      from: 'app',
      to: 'turso-demo',
      protocolo: 'libSQL sobre TLS',
      puerto: '443/tcp',
      controles: ['pase HMAC de corta vida', 'solo GET y HEAD', 'base distinta de la de producción'],
    },
    {
      from: 'app',
      to: 'blob',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      controles: ['token de escritura solo de servidor'],
    },
    {
      from: 'app',
      to: 'redis',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      controles: ['token de solo lectura para el público', 'TTL corto sobre todo el estado vivo'],
    },

    // ── Cómputo → terceros
    {
      from: 'app',
      to: 'wompi',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      controles: ['idempotencyKey por cobro', 'máquina de estados de pago del lado propio'],
    },
    {
      from: 'app',
      to: 'ntfy',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      controles: ['tópico privado', 'no-op silencioso si falta la credencial'],
    },
    {
      from: 'app',
      to: 'resend',
      protocolo: 'HTTPS',
      puerto: '443/tcp',
      controles: ['clave de API solo de servidor', 'no-op silencioso si falta la credencial'],
    },
  ],
}

export const REDES: RedModel[] = [produccion]
