// Catálogo de lo que corre solo en este proyecto. Fuente de verdad de
// `/automatizaciones`: la página no escribe a mano ni un horario ni un nombre.
//
// Lo que NO va aquí, por el mismo criterio OPSEC de /status y /security: rutas
// señuelo, nombres exactos de reglas de detección y umbrales de bloqueo. Se
// describe QUÉ hace cada automatismo, nunca cómo esquivarlo.
//
// Los textos son `Bilingual` (`tx()` los resuelve), como en los módulos de
// /docs: el catálogo cambia cada vez que nace una automatización, y un archivo
// gemelo en inglés se desincronizaría en semanas. Lo que NO se traduce es lo
// que también es un identificador - el nombre del workflow en la pestaña
// Actions, el nombre del job y el del archivo - porque son la clave con la que
// se cruza contra GitHub y contra la bitácora, no prosa.

import type { Bilingual, BilingualOptional } from '../i18n/bilingual'

export type Disparador = 'push' | 'pull_request' | 'semanal' | 'manual' | 'vercel' | 'externo'

export type Workflow = {
  /** Nombre tal como aparece en la pestaña Actions. Es la clave del cruce. */
  nombre: string
  archivo: string
  disparadores: Disparador[]
  /** Qué hace, en una frase. */
  hace: Bilingual
  /** Lo que no es obvio leyendo el nombre. */
  detalle?: BilingualOptional
}

export type Cron = {
  /** Último segmento de `/api/cron/*`, y la clave con la que se registra. */
  job: string
  /** Horario declarado, en UTC. */
  horario: Bilingual
  /**
   * El mismo horario en minutos entre ejecuciones. Lo lee el detector de
   * silencio (`src/lib/cron-silencio.ts`) para saber a partir de cuándo la
   * ausencia de este job en la bitácora es una avería y no una pausa normal.
   * Va aquí, y no en una tabla aparte, para que el horario que se publica y el
   * que se vigila no puedan divergir.
   */
  cadaMin: number
  /** Quién lo dispara de verdad. */
  origen: 'vercel' | 'cron-job.org'
  hace: Bilingual
  /** Qué se pierde si deja de correr. Es la columna que justifica la bitácora. */
  siFalla: Bilingual
}

export type Automatismo = {
  nombre: Bilingual
  hace: Bilingual
  cuando: Bilingual
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
    hace: {
      es: 'Pruebas con cobertura, build, end to end con Playwright y verificación del despliegue.',
      en: 'Tests with coverage, build, end to end with Playwright and post-deploy verification.',
    },
    detalle: {
      es: 'La etapa final espera hasta 8 minutos a que el endpoint de salud devuelva el commit recién desplegado, hace tres comprobaciones y revierte sola si dos de las tres salen insanas. También reporta sus métricas al panel del sitio.',
      en: 'The final stage waits up to 8 minutes for the health endpoint to report the commit that was just deployed, runs three checks and rolls back on its own if two of the three come back unhealthy. It also reports its metrics to the site dashboard.',
    },
  },
  {
    nombre: 'Security',
    archivo: 'security.yml',
    disparadores: ['push', 'pull_request', 'semanal'],
    hace: {
      es: 'Auditoría de dependencias y análisis estático con CodeQL.',
      en: 'Dependency audit and static analysis with CodeQL.',
    },
    detalle: {
      es: 'Además del push, corre sola los domingos, para que una vulnerabilidad publicada después del último commit no espere al siguiente.',
      en: 'Beyond the push, it also runs by itself on Sundays, so a vulnerability published after the last commit does not have to wait for the next one.',
    },
  },
  {
    nombre: 'Accessibility',
    archivo: 'a11y.yml',
    disparadores: ['push', 'pull_request'],
    hace: {
      es: 'Auditoría de accesibilidad con axe sobre las páginas públicas.',
      en: 'Accessibility audit with axe over the public pages.',
    },
  },
  {
    nombre: 'DAST',
    archivo: 'dast.yml',
    disparadores: ['pull_request'],
    hace: {
      es: 'Análisis dinámico con ZAP contra el despliegue de vista previa de la rama.',
      en: 'Dynamic analysis with ZAP against the branch preview deployment.',
    },
    detalle: {
      es: 'Solo en pull request: necesita un sitio desplegado al que atacar, y ese es el preview que Vercel publica por rama.',
      en: 'Pull requests only: it needs a deployed site to attack, and that is the preview Vercel publishes per branch.',
    },
  },
  {
    nombre: 'Mutation testing',
    archivo: 'mutation.yml',
    disparadores: ['semanal', 'manual'],
    hace: {
      es: 'Introduce fallos a propósito en el código y comprueba si alguna prueba se entera.',
      en: 'Injects faults into the code on purpose and checks whether any test notices.',
    },
    detalle: {
      es: 'La cobertura dice que una línea se ejecutó; esto dice si romperla se detecta. Corre los domingos porque es caro.',
      en: 'Coverage says a line ran; this says whether breaking it gets caught. It runs on Sundays because it is expensive.',
    },
  },
  {
    nombre: 'Distribuir nota',
    archivo: 'distribute-note.yml',
    disparadores: ['push', 'manual'],
    hace: {
      es: 'Al publicar un artículo, lo anuncia y avisa a los buscadores.',
      en: 'When an article ships, it announces it and pings the search engines.',
    },
    detalle: {
      es: 'Solo se dispara si el push toca `src/content/notes/`.',
      en: 'It only fires when the push touches `src/content/notes/`.',
    },
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
    cadaMin: 1440,
    origen: 'vercel',
    hace: { es: 'Copia de seguridad diaria de la base.', en: 'Daily backup of the database.' },
    siFalla: {
      es: 'Se envejece la última copia disponible para restaurar.',
      en: 'The newest copy available to restore from keeps getting older.',
    },
  },
  {
    job: 'portal-demo-reseed',
    horario: '04:00',
    cadaMin: 1440,
    origen: 'vercel',
    hace: {
      es: 'Repuebla la base de la demo pública con datos ficticios.',
      en: 'Reseeds the public demo database with fictional data.',
    },
    siFalla: {
      es: 'La demo va acumulando lo que hayan dejado los visitantes.',
      en: 'The demo piles up whatever visitors left behind.',
    },
  },
  {
    job: 'monitor-rollup',
    horario: '05:00',
    cadaMin: 1440,
    origen: 'vercel',
    hace: {
      es: 'Resume los sondeos del día en una fila por monitor.',
      en: "Rolls up the day's probes into one row per monitor.",
    },
    siFalla: {
      es: 'El historial de disponibilidad deja de consolidarse y consultarlo se vuelve caro.',
      en: 'The uptime history stops being consolidated and reading it turns expensive.',
    },
  },
  {
    job: 'computo-rollup',
    horario: '06:00',
    cadaMin: 1440,
    origen: 'vercel',
    hace: {
      es: 'Consolida el consumo de cómputo medido en cada proyecto de cliente y avisa si la cuota gratis compartida de la cuenta va camino de agotarse.',
      en: 'Consolidates the compute usage measured on each client project and warns if the account’s shared free quota is on track to run out.',
    },
    siFalla: {
      es: 'El consumo se sigue midiendo, pero el mes en curso deja de reflejarlo y los avisos de cuota no salen hasta la siguiente pasada.',
      en: 'Usage is still measured, but the current month stops reflecting it and quota warnings are not sent until the next pass.',
    },
  },
  {
    job: 'uptime-check',
    horario: '07:00',
    cadaMin: 1440,
    origen: 'vercel',
    hace: {
      es: 'Sondeo de disponibilidad, refresco de certificados, gestión de incidentes y purga de historial.',
      en: 'Uptime probe, certificate refresh, incident handling and history purge.',
    },
    siFalla: {
      es: 'Una caída deja de abrir incidente y nadie se entera.',
      en: 'An outage stops opening an incident and nobody finds out.',
    },
  },
  {
    job: 'domain-check',
    horario: '08:00',
    cadaMin: 1440,
    origen: 'vercel',
    hace: {
      es: 'Vigila el vencimiento de los dominios y avisa, sin repetir el aviso.',
      en: 'Watches domain expiry and warns once, without repeating itself.',
    },
    siFalla: {
      es: 'Un dominio puede vencer sin previo aviso.',
      en: 'A domain can expire with no warning at all.',
    },
  },
  {
    job: 'indexnow',
    horario: '08:30',
    cadaMin: 1440,
    origen: 'vercel',
    hace: {
      es: 'Reenvía el sitemap a los buscadores que admiten IndexNow.',
      en: 'Resubmits the sitemap to the search engines that support IndexNow.',
    },
    siFalla: {
      es: 'El contenido nuevo tarda más en indexarse.',
      en: 'New content takes longer to get indexed.',
    },
  },
  {
    job: 'invoices-overdue',
    horario: '09:00',
    cadaMin: 1440,
    origen: 'vercel',
    hace: { es: 'Marca facturas vencidas y notifica.', en: 'Flags overdue invoices and notifies.' },
    siFalla: {
      es: 'Una factura vencida se queda figurando al día.',
      en: 'An overdue invoice keeps showing up as current.',
    },
  },
  {
    job: 'uptime-check',
    horario: { es: 'cada ~5 min', en: 'every ~5 min' },
    cadaMin: 5,
    origen: 'cron-job.org',
    hace: {
      es: 'El mismo sondeo, a la frecuencia que la monitorización necesita de verdad.',
      en: 'The same probe, at the frequency monitoring actually needs.',
    },
    siFalla: {
      es: 'La resolución del monitoreo cae a una medición al día.',
      en: 'Monitoring resolution drops to one measurement a day.',
    },
  },
  {
    job: 'security-rollup',
    horario: { es: 'cada ~15 min', en: 'every ~15 min' },
    cadaMin: 15,
    origen: 'cron-job.org',
    hace: {
      es: 'Agrega la última hora de eventos, contrasta contra la línea base y aplica el bloqueo automático.',
      en: 'Aggregates the last hour of events, compares it against the baseline and applies automatic blocking.',
    },
    siFalla: {
      es: 'La detección de anomalías se queda sin agregados con los que comparar.',
      en: 'Anomaly detection is left without aggregates to compare against.',
    },
  },
  {
    job: 'sena-recordatorio',
    horario: '12:00',
    cadaMin: 1440,
    origen: 'cron-job.org',
    hace: {
      es: 'Recordatorio de la calculadora de etapa productiva.',
      en: 'Reminder from the apprenticeship-stage calculator.',
    },
    siFalla: { es: 'Se pierde el recordatorio del día.', en: "The day's reminder is lost." },
  },
]

/**
 * Automatismos que viven dentro del producto: no los dispara un calendario ni
 * un push, sino el propio tráfico.
 */
export const AUTOMATISMOS: readonly Automatismo[] = [
  {
    nombre: { es: 'Apertura y cierre de incidentes', en: 'Opening and closing incidents' },
    hace: {
      es: 'Un sondeo fallido abre incidente; el primero que vuelve a salir bien lo cierra.',
      en: 'A failed probe opens an incident; the first one that comes back healthy closes it.',
    },
    cuando: { es: 'En cada sondeo', en: 'On every probe' },
  },
  {
    nombre: { es: 'Bloqueo automático de abuso', en: 'Automatic abuse blocking' },
    hace: {
      es: 'Una intención inequívocamente maliciosa bloquea el origen, con salvaguardas para no bloquear a la propia infraestructura ni al administrador, y un tope por encima del cual avisa en vez de bloquear.',
      en: 'Unmistakably malicious intent blocks the source, with safeguards against blocking the infrastructure itself or the administrator, and a ceiling above which it warns instead of blocking.',
    },
    cuando: {
      es: 'En línea con el request, y al agregar cada hora',
      en: 'Inline with the request, and on every hourly aggregation',
    },
  },
  {
    nombre: { es: 'Detección de anomalías', en: 'Anomaly detection' },
    hace: {
      es: 'Compara la hora cerrada contra la línea base histórica y señala lo que se sale de rango.',
      en: 'Compares the closed hour against the historical baseline and flags whatever falls out of range.',
    },
    cuando: { es: 'Al cerrar cada hora', en: 'As each hour closes' },
  },
  {
    nombre: { es: 'Modo respaldo del portal', en: 'Portal fallback mode' },
    hace: {
      es: 'Si la base no responde, el portal sirve un snapshot versionado y lo anuncia; se apaga solo cuando la base vuelve.',
      en: 'If the database stops answering, the portal serves a versioned snapshot and says so; it turns itself off when the database returns.',
    },
    cuando: {
      es: 'Al detectar la base caída',
      en: 'When the database is detected as down',
    },
  },
  {
    nombre: { es: 'Reversión post-despliegue', en: 'Post-deploy rollback' },
    hace: {
      es: 'Si el sitio recién publicado no responde sano, el pipeline revierte a la versión anterior y avisa.',
      en: 'If the freshly published site does not answer healthy, the pipeline reverts to the previous version and warns.',
    },
    cuando: {
      es: 'Después de cada despliegue a producción',
      en: 'After every production deployment',
    },
  },
  {
    nombre: { es: 'Purga de retención', en: 'Retention purge' },
    hace: {
      es: 'El historial viejo se borra por capas para que la base no crezca sin límite.',
      en: 'Old history is deleted in layers so the database does not grow without bound.',
    },
    cuando: { es: 'Dentro de los crons de resumen', en: 'Inside the rollup crons' },
  },
]
