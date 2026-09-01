// Catálogo de lo que corre solo en este proyecto. Fuente de verdad de
// `/automatizaciones`: la página no escribe a mano ni un horario ni un nombre.
//
// Lo que NO va aquí, por el mismo criterio OPSEC de /status y /security: rutas
// señuelo, nombres exactos de reglas de detección y umbrales de bloqueo. Se
// describe QUÉ hace cada automatismo, nunca cómo esquivarlo.

export type Disparador = 'push' | 'pull_request' | 'semanal' | 'manual' | 'vercel' | 'externo'

export type Workflow = {
  /** Nombre tal como aparece en la pestaña Actions. */
  nombre: string
  archivo: string
  disparadores: Disparador[]
  /** Qué hace, en una frase. */
  hace: string
  /** Lo que no es obvio leyendo el nombre. */
  detalle?: string
}

export type Cron = {
  /** Último segmento de `/api/cron/*`, y la clave con la que se registra. */
  job: string
  /** Horario declarado, en UTC. */
  horario: string
  /** Quién lo dispara de verdad. */
  origen: 'vercel' | 'cron-job.org'
  hace: string
  /** Qué se pierde si deja de correr. Es la columna que justifica la bitácora. */
  siFalla: string
}

export type Automatismo = {
  nombre: string
  hace: string
  cuando: string
}

/**
 * Workflows de GitHub Actions. Se cruzan con la API de Actions para pintar el
 * resultado de la última corrida de cada uno.
 */
export const WORKFLOWS: readonly Workflow[] = [
  {
    nombre: 'CI',
    archivo: 'ci.yml',
    disparadores: ['push', 'pull_request'],
    hace: 'Pruebas con cobertura, build, end to end con Playwright y verificación del despliegue.',
    detalle:
      'La etapa final espera hasta 8 minutos a que el endpoint de salud devuelva el commit recién desplegado, hace tres comprobaciones y revierte sola si dos de las tres salen insanas. También reporta sus métricas al panel del sitio.',
  },
  {
    nombre: 'Security',
    archivo: 'security.yml',
    disparadores: ['push', 'pull_request', 'semanal'],
    hace: 'Auditoría de dependencias y análisis estático con CodeQL.',
    detalle: 'Además del push, corre sola los domingos, para que una vulnerabilidad publicada después del último commit no espere al siguiente.',
  },
  {
    nombre: 'Accessibility',
    archivo: 'a11y.yml',
    disparadores: ['push', 'pull_request'],
    hace: 'Auditoría de accesibilidad con axe sobre las páginas públicas.',
  },
  {
    nombre: 'DAST',
    archivo: 'dast.yml',
    disparadores: ['pull_request'],
    hace: 'Análisis dinámico con ZAP contra el despliegue de vista previa de la rama.',
    detalle: 'Solo en pull request: necesita un sitio desplegado al que atacar, y ese es el preview que Vercel publica por rama.',
  },
  {
    nombre: 'Mutation testing',
    archivo: 'mutation.yml',
    disparadores: ['semanal', 'manual'],
    hace: 'Introduce fallos a propósito en el código y comprueba si alguna prueba se entera.',
    detalle:
      'La cobertura dice que una línea se ejecutó; esto dice si romperla se detecta. Corre los domingos porque es caro.',
  },
  {
    nombre: 'Distribuir nota',
    archivo: 'distribute-note.yml',
    disparadores: ['push', 'manual'],
    hace: 'Al publicar un artículo, lo anuncia y avisa a los buscadores.',
    detalle: 'Solo se dispara si el push toca `src/content/notes/`.',
  },
]

/**
 * Tareas programadas. El plan Hobby de Vercel permite una ejecución diaria por
 * cron, así que todo lo que necesita más frecuencia se dispara desde
 * cron-job.org contra el mismo endpoint, autenticado con el mismo secreto.
 */
export const CRONS: readonly Cron[] = [
  {
    job: 'backup',
    horario: '03:00',
    origen: 'vercel',
    hace: 'Copia de seguridad diaria de la base.',
    siFalla: 'Se envejece la última copia disponible para restaurar.',
  },
  {
    job: 'portal-demo-reseed',
    horario: '04:00',
    origen: 'vercel',
    hace: 'Repuebla la base de la demo pública con datos ficticios.',
    siFalla: 'La demo va acumulando lo que hayan dejado los visitantes.',
  },
  {
    job: 'monitor-rollup',
    horario: '05:00',
    origen: 'vercel',
    hace: 'Resume los sondeos del día en una fila por monitor.',
    siFalla: 'El historial de disponibilidad deja de consolidarse y consultarlo se vuelve caro.',
  },
  {
    job: 'uptime-check',
    horario: '07:00',
    origen: 'vercel',
    hace: 'Sondeo de disponibilidad, refresco de certificados, gestión de incidentes y purga de historial.',
    siFalla: 'Una caída deja de abrir incidente y nadie se entera.',
  },
  {
    job: 'domain-check',
    horario: '08:00',
    origen: 'vercel',
    hace: 'Vigila el vencimiento de los dominios y avisa, sin repetir el aviso.',
    siFalla: 'Un dominio puede vencer sin previo aviso.',
  },
  {
    job: 'indexnow',
    horario: '08:30',
    origen: 'vercel',
    hace: 'Reenvía el sitemap a los buscadores que admiten IndexNow.',
    siFalla: 'El contenido nuevo tarda más en indexarse.',
  },
  {
    job: 'invoices-overdue',
    horario: '09:00',
    origen: 'vercel',
    hace: 'Marca facturas vencidas y notifica.',
    siFalla: 'Una factura vencida se queda figurando al día.',
  },
  {
    job: 'uptime-check',
    horario: 'cada ~5 min',
    origen: 'cron-job.org',
    hace: 'El mismo sondeo, a la frecuencia que la monitorización necesita de verdad.',
    siFalla: 'La resolución del monitoreo cae a una medición al día.',
  },
  {
    job: 'security-rollup',
    horario: 'cada ~15 min',
    origen: 'cron-job.org',
    hace: 'Agrega la última hora de eventos, contrasta contra la línea base y aplica el bloqueo automático.',
    siFalla: 'La detección de anomalías se queda sin agregados con los que comparar.',
  },
  {
    job: 'sena-recordatorio',
    horario: 'diario',
    origen: 'cron-job.org',
    hace: 'Recordatorio de la calculadora de etapa productiva.',
    siFalla: 'Se pierde el recordatorio del día.',
  },
]

/**
 * Automatismos que viven dentro del producto: no los dispara un calendario ni
 * un push, sino el propio tráfico.
 */
export const AUTOMATISMOS: readonly Automatismo[] = [
  {
    nombre: 'Apertura y cierre de incidentes',
    hace: 'Un sondeo fallido abre incidente; el primero que vuelve a salir bien lo cierra.',
    cuando: 'En cada sondeo',
  },
  {
    nombre: 'Bloqueo automático de abuso',
    hace: 'Una intención inequívocamente maliciosa bloquea el origen, con salvaguardas para no bloquear a la propia infraestructura ni al administrador, y un tope por encima del cual avisa en vez de bloquear.',
    cuando: 'En línea con el request, y al agregar cada hora',
  },
  {
    nombre: 'Detección de anomalías',
    hace: 'Compara la hora cerrada contra la línea base histórica y señala lo que se sale de rango.',
    cuando: 'Al cerrar cada hora',
  },
  {
    nombre: 'Modo respaldo del portal',
    hace: 'Si la base no responde, el portal sirve un snapshot versionado y lo anuncia; se apaga solo cuando la base vuelve.',
    cuando: 'Al detectar la base caída',
  },
  {
    nombre: 'Reversión post-despliegue',
    hace: 'Si el sitio recién publicado no responde sano, el pipeline revierte a la versión anterior y avisa.',
    cuando: 'Después de cada despliegue a producción',
  },
  {
    nombre: 'Purga de retención',
    hace: 'El historial viejo se borra por capas para que la base no crezca sin límite.',
    cuando: 'Dentro de los crons de resumen',
  },
]
