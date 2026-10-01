// Reglas de las piezas de /contact: la validación de campos (la misma que
// pinta las pistas del formulario), el plazo de respuesta que promete la
// página y en qué tramo de la ruta se detiene un envío que falla.
//
// Módulo puro: lo usan el navegador y sus pruebas.

// ── Campos ─────────────────────────────────────────────────────────────────

export type CampoRequerido = 'name' | 'email' | 'body'
export const CAMPOS_REQUERIDOS: CampoRequerido[] = ['name', 'email', 'body']
export const MIN_MENSAJE = 20
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function campoValido(campo: CampoRequerido, valor: string): boolean {
  if (campo === 'name') return valor.length >= 2
  if (campo === 'email') return EMAIL_RE.test(valor)
  return valor.length >= MIN_MENSAJE
}

// ── Hora de Bogotá y plazo de respuesta ────────────────────────────────────
// Colombia no cambia de horario: UTC-5 fijo. Se calcula con aritmética y no
// con Intl para que el plazo no dependa de la zona del navegador de quien
// mira (un visitante en Madrid tiene que ver la hora de Mike, no la suya).

const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS
const DESFASE_MS = -5 * HORA_MS

export interface PartesBogota {
  dow: number
  dia: number
  mes: number
  anio: number
  h: number
  m: number
}

export function partesBogota(ms: number): PartesBogota {
  const d = new Date(ms + DESFASE_MS)
  return {
    dow: d.getUTCDay(),
    dia: d.getUTCDate(),
    mes: d.getUTCMonth(),
    anio: d.getUTCFullYear(),
    h: d.getUTCHours(),
    m: d.getUTCMinutes(),
  }
}

export const esDiaHabil = (ms: number) => {
  const dow = partesBogota(ms).dow
  return dow >= 1 && dow <= 5
}

/**
 * Hasta cuándo corre la promesa "respondo en menos de 24 horas de lunes a
 * viernes", leída al pie de la letra: se cuentan 24 horas, pero las del
 * sábado y el domingo no corren. Un mensaje del viernes a las 15:00 vence el
 * lunes a las 15:00; uno del sábado, al terminar el lunes.
 */
export function limiteRespuesta(ahoraMs: number): number {
  let cursor = ahoraMs + DESFASE_MS
  let falta = DIA_MS
  for (let i = 0; i < 10; i++) {
    const dow = new Date(cursor).getUTCDay()
    const finDelDia = Math.floor(cursor / DIA_MS) * DIA_MS + DIA_MS
    if (dow === 0 || dow === 6) {
      cursor = finDelDia
      continue
    }
    const disponible = finDelDia - cursor
    if (falta <= disponible) return cursor + falta - DESFASE_MS
    falta -= disponible
    cursor = finDelDia
  }
  return cursor - DESFASE_MS
}

/**
 * Fecha y hora de Bogotá para leer. La medianoche exacta se escribe como el
 * final del día anterior ("lun 5 oct · 24:00"): "antes del martes a las 00:00"
 * se lee como un día más de plazo del que es.
 */
export function formatoBogota(ms: number, dias: string[], meses: string[]): string {
  let p = partesBogota(ms)
  let hora = `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}`
  if (p.h === 0 && p.m === 0) {
    p = partesBogota(ms - 60_000)
    hora = '24:00'
  }
  return `${dias[p.dow]} ${p.dia} ${meses[p.mes]} · ${hora}`
}

// ── Ruta del mensaje ───────────────────────────────────────────────────────
// Tramos: 0 tu navegador, 1 revisado (el servidor valida y frena ráfagas),
// 2 guardado, 3 aviso. Un envío que falla se detiene donde falló de verdad:
// sin red no salió del navegador; un 4xx lo rechazó la revisión (campos o
// demasiados intentos); un 5xx pasó la revisión y falló al guardar.

export type Resultado = number | 'red'

/** Tramo donde se detuvo el envío, o null si llegó entero. */
export function tramoFallido(r: Resultado): 0 | 1 | 2 | null {
  if (r === 'red') return 0
  if (r >= 200 && r < 300) return null
  if (r >= 500) return 2
  return 1
}
