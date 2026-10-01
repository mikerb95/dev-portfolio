// Resumen semanal de operación (etapa 11 del roadmap): qué pasó en el sitio
// la semana pasada, redactado por Claude y mandado al celular el lunes.
//
// Módulo PURO: el contrato de lo que entra al modelo vive aquí y se prueba
// sin red ni base. La recolección está en resumen-semanal-db.ts y la llamada
// a la API en resumen-semanal-ia.ts.
//
// Qué NO entra nunca al modelo: IPs, rutas (tampoco las señuelo), user-agents,
// nombres de reglas de detección, datos de clientes. Solo agregados con
// nombres legibles. Y si la API falla o no hay key, el resumen sale igual,
// armado aquí sin IA: fail-open.

export type Uptime = { nombre: string; pct: number; caidas: number }

export type DatosSemana = {
  desde: string // YYYY-MM-DD
  hasta: string
  uptime: Uptime[]
  incidentes: { total: number; minutos: number; abiertos: number }
  seguridad: { intentos: number; origenes: number; porCategoria: { categoria: string; intentos: number }[]; bloqueos: number }
  crons: { corridas: number; fallos: number; conFallo: string[] }
  ci: { corridas: number; fallidas: number; revertidas: number }
  analista: { analisis: number; costoUsd: number }
}

export type Resumen = {
  creado: string // ISO
  desde: string
  hasta: string
  /** Una frase: es lo que llega en la notificación. */
  titular: string
  texto: string
  conIa: boolean
  costoUsd: number
  datos: DatosSemana
}

// Topes del contrato: el JSON que va al modelo no crece con el sitio.
const MAX_MONITORES = 12
const MAX_CATEGORIAS = 6
const MAX_JOBS = 6

/** Recorta las listas y redondea, para que la entrada al modelo tenga tamaño fijo. */
export function recortar(d: DatosSemana): DatosSemana {
  return {
    ...d,
    // Primero los que peor estuvieron: son los que importan.
    uptime: [...d.uptime].sort((a, b) => a.pct - b.pct).slice(0, MAX_MONITORES).map((u) => ({ ...u, pct: Math.round(u.pct * 100) / 100 })),
    seguridad: {
      ...d.seguridad,
      porCategoria: [...d.seguridad.porCategoria].sort((a, b) => b.intentos - a.intentos).slice(0, MAX_CATEGORIAS),
    },
    crons: { ...d.crons, conFallo: d.crons.conFallo.slice(0, MAX_JOBS) },
    analista: { ...d.analista, costoUsd: Math.round(d.analista.costoUsd * 100) / 100 },
  }
}

// Nombres legibles. Una categoría sin traducir sale tal cual: es un nombre de
// familia de ataque (recon_cms), no el de una regla concreta.
const CATEGORIAS: Record<string, string> = {
  honeypot: 'cayeron en una trampa',
  recon_cms: 'buscaban WordPress y paneles',
  secrets_probing: 'buscaban archivos secretos',
  path_traversal: 'intentaban leer archivos del servidor',
  injection: 'intentaban inyectar código',
  auth_probing: 'intentaban entrar a cuentas',
  bad_bot: 'bots maliciosos',
  protocol_anomaly: 'peticiones malformadas',
  blocklist: 'rebotados por estar bloqueados',
  rate_limit: 'frenados por insistir',
}

export const nombreCategoria = (c: string) => CATEGORIAS[c] ?? c

const num = (n: number) => new Intl.NumberFormat('es-CO').format(n)

/** El resumen armado sin IA: el mismo contenido, en frases fijas. */
export function resumenSinIa(d: DatosSemana): { titular: string; texto: string } {
  const caidos = d.uptime.filter((u) => u.caidas > 0 || u.pct < 99.5)
  const titular =
    d.incidentes.abiertos > 0
      ? `Semana con ${d.incidentes.abiertos} ${d.incidentes.abiertos === 1 ? 'incidente abierto' : 'incidentes abiertos'}: revisa los monitores.`
      : caidos.length > 0
        ? `Semana con caídas en ${caidos.length} ${caidos.length === 1 ? 'sitio' : 'sitios'}; todo resuelto.`
        : `Semana tranquila: todos los sitios arriba y ${num(d.seguridad.intentos)} intentos de ataque contenidos.`
  const lineas = [
    '## Qué pasó',
    `- Sitios vigilados: ${d.uptime.length}. ${caidos.length ? `Con problemas: ${caidos.map((u) => `${u.nombre} (${u.pct.toFixed(2)} %)`).join(', ')}.` : 'Ninguno bajó del 99,5 %.'}`,
    `- Incidentes: ${d.incidentes.total}, unos ${num(d.incidentes.minutos)} minutos en total.`,
    `- Seguridad: ${num(d.seguridad.intentos)} intentos desde ${num(d.seguridad.origenes)} orígenes; ${d.seguridad.bloqueos} bloqueos.` +
      (d.seguridad.porCategoria.length ? ` Lo más común: ${d.seguridad.porCategoria.slice(0, 3).map((c) => nombreCategoria(c.categoria)).join(', ')}.` : ''),
    `- Tareas programadas: ${d.crons.corridas} corridas, ${d.crons.fallos} con fallo${d.crons.conFallo.length ? ` (${d.crons.conFallo.join(', ')})` : ''}.`,
    `- Integración continua: ${d.ci.corridas} corridas, ${d.ci.fallidas} fallidas, ${d.ci.revertidas} revertidas.`,
    `- Analista de seguridad: ${d.analista.analisis} análisis, US$${d.analista.costoUsd.toFixed(2)}.`,
  ]
  return { titular, texto: lineas.join('\n') }
}

export const SYSTEM = `Eres quien redacta el resumen semanal de operación de codebymike.net, el sitio de un desarrollador independiente en Colombia.
Recibes un JSON con agregados de la semana: disponibilidad de los sitios que vigila, incidentes, ataques registrados por categoría, tareas programadas, integración continua y gasto del analista de seguridad.

Escribe en español, para el dueño del sitio, que lo lee en el celular un lunes temprano. Formato exacto:
- Primera línea: una sola frase con lo más importante de la semana (es la que llega en la notificación). Sin título ni viñeta.
- Luego "## Qué pasó" con 2 a 4 viñetas cortas.
- Luego "## Qué vigilar" con 1 a 3 viñetas.
- Luego "## Una recomendación" con una sola viñeta concreta.

Reglas: usa solo cifras que estén en el JSON, sin inventar causas ni tendencias que los datos no muestren. Si todo estuvo bien, dilo en pocas palabras; no rellenes. Nada de jerga innecesaria.`

/**
 * Lo que va como mensaje del usuario: solo el JSON recortado, con las
 * categorías ya en palabras (si no, el modelo cita `auth_probing` tal cual).
 */
export function entradaModelo(d: DatosSemana): string {
  const r = recortar(d)
  return JSON.stringify({
    ...r,
    seguridad: { ...r.seguridad, porCategoria: r.seguridad.porCategoria.map((c) => ({ tipo: nombreCategoria(c.categoria), intentos: c.intentos })) },
  })
}

/** Separa la primera línea (titular) del resto. Si el modelo no siguió el formato, el titular sale del armado sin IA. */
export function partirRespuesta(texto: string, d: DatosSemana): { titular: string; texto: string } {
  const lineas = texto.trim().split('\n')
  const primera = (lineas[0] ?? '').replace(/^[#*\-\s]+/, '').trim()
  if (!primera || primera.startsWith('Qué pasó') || primera.length > 280) {
    return { titular: resumenSinIa(d).titular, texto: texto.trim() }
  }
  return { titular: primera, texto: lineas.slice(1).join('\n').trim() }
}

/** El historial guardado: el más nuevo primero y como mucho `max` entradas. */
export function agregarAlHistorial(historial: Resumen[], nuevo: Resumen, max = 12): Resumen[] {
  return [nuevo, ...historial.filter((r) => r.desde !== nuevo.desde)].slice(0, max)
}

export function parsearHistorial(valor: string | null | undefined): Resumen[] {
  if (!valor) return []
  try {
    const v = JSON.parse(valor)
    return Array.isArray(v) ? (v as Resumen[]) : []
  } catch {
    return []
  }
}

/** Lunes a domingo de la semana anterior a `ahora`, en hora de Bogotá. */
export function semanaAnterior(ahora: Date): { desde: string; hasta: string; inicio: Date; fin: Date } {
  const BOGOTA_MS = -5 * 3_600_000
  const local = new Date(ahora.getTime() + BOGOTA_MS)
  const dia = (local.getUTCDay() + 6) % 7 // 0 = lunes
  const lunesEsta = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dia)
  const lunesPasado = lunesEsta - 7 * 86_400_000
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return {
    desde: iso(lunesPasado),
    hasta: iso(lunesEsta - 86_400_000),
    // Instantes reales: medianoche de Bogotá son las 05:00 UTC.
    inicio: new Date(lunesPasado - BOGOTA_MS),
    fin: new Date(lunesEsta - BOGOTA_MS),
  }
}
