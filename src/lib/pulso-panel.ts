import type { Locale } from '../i18n/config'
import { formatNumber, interpolate } from '../i18n/format'
import { histograma, percentil, truncar, type Pulso, type PuntoDia, type PuntoHora } from './pulso-publico'

// Del `Pulso` (números) a lo que se pinta (barras, textos, unidades).
//
// Módulo PURO a propósito, separado de `pulso-publico.ts` porque ese importa
// `../db`: aquí vive todo lo que decide la forma del gráfico, y eso se prueba
// con una tabla de números en vez de con una base de datos. Cada regla de
// escala de este archivo es una decisión sobre qué se ve y qué se esconde, así
// que ninguna debería quedar enterrada en el marcado de un `.astro`.

/** Escala de color de una barra. `vacio` es un día sin ningún registro. */
export type Tono = 'ok' | 'info' | 'medio' | 'mal' | 'vacio'

/** `alto` es una fracción 0..1 de la altura disponible del gráfico. */
export type Barra = { alto: number; etiqueta: string; tono: Tono }

export type Panel = {
  titulo: string
  descripcion: string
  fuente: string
  barras: Barra[]
  ejeIzq: string
  ejeDer: string
  resumen: { k: string; v: string }[]
}

export type Senal = {
  id: string
  valor: string
  etiqueta: string
  href: string
  panel: Panel
}

// Marcador de dato ausente, el mismo que ya usa /status.
const AUSENTE = '-'
// Suelo de la escala de uptime. Con la escala a cero, la diferencia entre un
// 99,9% y un 97% (que son mundos distintos: 43 minutos de caída al día) es
// medio píxel y las treinta barras salen idénticas. Anclarla al 98% convierte
// esa diferencia en la mitad del gráfico, que es lo que de verdad pasó.
const PISO_UPTIME = 0.98
// Altura mínima de una barra con datos: sin esto, un día al 0% desaparece y se
// lee como "no hubo datos", que es justo lo contrario de lo que pasó.
const ALTO_MINIMO = 0.06
// Los cortes del histograma de LCP son los umbrales de Web Vitals (2,5 s bueno,
// 4 s pobre) más dos divisiones internas para que la zona buena tenga forma.
const CORTES_LCP = [1000, 1800, 2500, 4000]
const TONOS_LCP: Tono[] = ['ok', 'ok', 'info', 'medio', 'mal']

/** Reparte 0..1 dentro de la escala, con suelo y mínimo visible. */
function altoDesde(valor: number, piso: number, techo: number): number {
  if (techo <= piso) return 1
  const frac = (valor - piso) / (techo - piso)
  return Math.max(ALTO_MINIMO, Math.min(1, frac))
}

/** Altura relativa a un máximo, para series de volumen (cuentas, no tasas). */
function altoPorMaximo(valor: number, maximo: number): number {
  if (maximo <= 0) return 0
  return Math.max(ALTO_MINIMO, valor / maximo)
}

/**
 * Etiqueta de día para el tooltip.
 *
 * Las claves de las series son días UTC ('YYYY-MM-DD'). Se formatean forzando
 * UTC porque en Colombia (-05) un 'YYYY-MM-DD' interpretado como hora local
 * retrocede al día anterior, y el tooltip acabaría nombrando un día distinto
 * del que pinta la barra. Es el mismo cuidado que ya toma /status.
 */
export function etiquetaDia(dia: string, locale: Locale): string {
  const d = new Date(`${dia}T12:00:00.000Z`)
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(d)
}

function barrasUptime(serie: PuntoDia[], locale: Locale, sinDatos: string): Barra[] {
  return serie.map((p) => {
    const dia = etiquetaDia(p.dia, locale)
    if (p.valor === null) return { alto: 0.12, etiqueta: `${dia} · ${sinDatos}`, tono: 'vacio' }
    const porcentaje = truncar(p.valor * 100, 2)
    const tono: Tono = porcentaje >= 99.5 ? 'ok' : porcentaje >= 98 ? 'medio' : 'mal'
    return {
      alto: altoDesde(p.valor, PISO_UPTIME, 1),
      etiqueta: `${dia} · ${formatNumber(porcentaje, locale, { maximumFractionDigits: 2 })}%`,
      tono,
    }
  })
}

function barrasVolumen(
  serie: PuntoDia[],
  locale: Locale,
  sinDatos: string,
  tono: Tono,
  sufijo: string,
): Barra[] {
  const maximo = Math.max(...serie.map((p) => p.total), 0)
  return serie.map((p) => {
    const dia = etiquetaDia(p.dia, locale)
    if (p.total === 0) return { alto: 0.12, etiqueta: `${dia} · ${sinDatos}`, tono: 'vacio' }
    return {
      alto: altoPorMaximo(p.total, maximo),
      etiqueta: `${dia} · ${formatNumber(p.total, locale)} ${sufijo}`,
      tono,
    }
  })
}

function barrasCrons(
  serie: PuntoHora[],
  locale: Locale,
  plantilla: string,
  sinDatos: string,
): Barra[] {
  const maximo = Math.max(...serie.map((p) => p.total), 0)
  return serie.map((p) => {
    const hora = p.hora === 0 ? '0 h' : `-${p.hora} h`
    if (p.total === 0) return { alto: 0.12, etiqueta: `${hora} · ${sinDatos}`, tono: 'vacio' }
    return {
      alto: altoPorMaximo(p.total, maximo),
      // Una hora con una sola corrida roja se pinta roja entera: en una serie
      // de fiabilidad el fallo ES la información, y promediarlo con los
      // aciertos de esa hora lo escondería.
      tono: p.ok === p.total ? 'ok' : 'mal',
      etiqueta: `${hora} · ${interpolate(plantilla, {
        ok: formatNumber(p.ok, locale),
        total: formatNumber(p.total, locale),
      })}`,
    }
  })
}

function barrasLcp(muestras: number[], locale: Locale, etiquetas: string[]): Barra[] {
  const conteo = histograma(muestras, CORTES_LCP)
  const maximo = Math.max(...conteo, 0)
  return conteo.map((n, i) => ({
    alto: n === 0 ? 0.04 : altoPorMaximo(n, maximo),
    tono: n === 0 ? ('vacio' as Tono) : TONOS_LCP[i],
    etiqueta: `${etiquetas[i]} · ${formatNumber(n, locale)}`,
  }))
}

const seg = (ms: number, locale: Locale) =>
  `${formatNumber(truncar(ms / 1000, 1), locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} s`

const porcentaje = (frac: number, locale: Locale) =>
  `${formatNumber(truncar(frac * 100, 2), locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`

// Los textos llegan tal cual del diccionario i18n, que infiere `string[]` para
// las listas: describir aquí tuplas de longitud fija haría que el nodo del
// diccionario dejara de encajar con su propio tipo.
type TextosPanel = {
  titulo: string
  descripcion: string
  fuente: string
  resumen: readonly string[]
}

/** Diccionario que necesita este módulo (el nodo `home.pulso` de i18n). */
export type TextosPulso = {
  uptime: string
  sondeos: string
  siem: string
  crons: string
  lcp: string
  paneles: {
    sinDatos: string
    haceDias: string
    hoy: string
    hace24h: string
    ahora: string
    corridasHora: string
    objetivo: string
    tramosLcp: readonly string[]
    uptime: TextosPanel
    sondeos: TextosPanel
    siem: TextosPanel
    crons: TextosPanel
    lcp: TextosPanel
  }
}

/**
 * Construye las señales que se pintan, descartando las que no tienen dato.
 *
 * El descarte es la regla importante: sin base, la cinta encoge y, si no queda
 * ninguna señal, desaparece entera. Una portada que afirma "0 sondeos · 30 d"
 * no está degradada con elegancia: está mintiendo sobre el sistema que dice
 * medir.
 */
export function construirSenales(
  pulso: Pulso,
  t: TextosPulso,
  locale: Locale,
  L: (path: string) => string,
): Senal[] {
  const p = t.paneles
  const dias = pulso.ventanaDias
  const ejeDias = interpolate(p.haceDias, { n: dias })
  const senales: Senal[] = []

  if (pulso.uptime !== null) {
    const conDatos = pulso.serieUptime.filter((d) => d.valor !== null)
    const peor = conDatos.reduce<number | null>(
      (min, d) => (min === null || (d.valor as number) < min ? (d.valor as number) : min),
      null,
    )
    const perfectos = conDatos.filter((d) => d.valor === 1).length
    senales.push({
      id: 'uptime',
      valor: porcentaje(pulso.uptime, locale),
      etiqueta: interpolate(t.uptime, { dias }),
      href: L('/status'),
      panel: {
        titulo: interpolate(p.uptime.titulo, { dias }),
        descripcion: p.uptime.descripcion,
        fuente: p.uptime.fuente,
        barras: barrasUptime(pulso.serieUptime, locale, p.sinDatos),
        ejeIzq: ejeDias,
        ejeDer: p.hoy,
        resumen: [
          { k: p.uptime.resumen[0], v: peor === null ? AUSENTE : porcentaje(peor, locale) },
          {
            k: p.uptime.resumen[1],
            v: `${formatNumber(perfectos, locale)}/${formatNumber(conDatos.length, locale)}`,
          },
          { k: p.uptime.resumen[2], v: p.objetivo },
        ],
      },
    })
  }

  if (pulso.sondeos > 0) {
    const conDatos = pulso.serieUptime.filter((d) => d.total > 0)
    const media = conDatos.length > 0 ? pulso.sondeos / conDatos.length : 0
    const huecos = pulso.serieUptime.length - conDatos.length
    senales.push({
      id: 'sondeos',
      valor: formatNumber(pulso.sondeos, locale, { notation: 'compact', maximumFractionDigits: 1 }),
      etiqueta: interpolate(t.sondeos, { dias }),
      href: L('/status'),
      panel: {
        titulo: interpolate(p.sondeos.titulo, { dias }),
        descripcion: p.sondeos.descripcion,
        fuente: p.sondeos.fuente,
        barras: barrasVolumen(pulso.serieUptime, locale, p.sinDatos, 'info', p.sondeos.resumen[0]),
        ejeIzq: ejeDias,
        ejeDer: p.hoy,
        resumen: [
          { k: p.sondeos.resumen[1], v: formatNumber(Math.round(media), locale) },
          {
            k: p.sondeos.resumen[2],
            v: formatNumber(Math.max(...conDatos.map((d) => d.total), 0), locale),
          },
          { k: p.sinDatos, v: formatNumber(huecos, locale) },
        ],
      },
    })
  }

  if (pulso.eventos > 0) {
    const conDatos = pulso.serieEventos.filter((d) => d.total > 0)
    const pico = Math.max(...conDatos.map((d) => d.total), 0)
    const limpios = pulso.serieEventos.length - conDatos.length
    senales.push({
      id: 'siem',
      valor: formatNumber(pulso.eventos, locale, { notation: 'compact', maximumFractionDigits: 1 }),
      etiqueta: interpolate(t.siem, { dias }),
      href: L('/security'),
      panel: {
        titulo: interpolate(p.siem.titulo, { dias }),
        descripcion: p.siem.descripcion,
        fuente: p.siem.fuente,
        barras: barrasVolumen(pulso.serieEventos, locale, p.sinDatos, 'medio', p.siem.resumen[0]),
        ejeIzq: ejeDias,
        ejeDer: p.hoy,
        resumen: [
          { k: p.siem.resumen[1], v: formatNumber(pico, locale) },
          {
            k: p.siem.resumen[2],
            v: formatNumber(Math.round(pulso.eventos / pulso.serieEventos.length), locale),
          },
          { k: p.sinDatos, v: formatNumber(limpios, locale) },
        ],
      },
    })
  }

  if (pulso.crons.total > 0) {
    const horaPico = pulso.serieCrons.reduce((a, b) => (b.total > a.total ? b : a))
    senales.push({
      id: 'crons',
      valor: `${formatNumber(pulso.crons.ok, locale)}/${formatNumber(pulso.crons.total, locale)}`,
      etiqueta: t.crons,
      href: L('/automatizaciones'),
      panel: {
        titulo: p.crons.titulo,
        descripcion: p.crons.descripcion,
        fuente: p.crons.fuente,
        barras: barrasCrons(pulso.serieCrons, locale, p.corridasHora, p.sinDatos),
        ejeIzq: p.hace24h,
        ejeDer: p.ahora,
        resumen: [
          { k: p.crons.resumen[0], v: formatNumber(pulso.crons.total - pulso.crons.ok, locale) },
          {
            k: p.crons.resumen[1],
            v: formatNumber(pulso.crons.total / 24, locale, { maximumFractionDigits: 1 }),
          },
          { k: p.crons.resumen[2], v: formatNumber(horaPico.total, locale) },
        ],
      },
    })
  }

  if (pulso.lcpP75 !== null) {
    const p50 = percentil(pulso.muestrasLcp, 50)
    const p95 = percentil(pulso.muestrasLcp, 95)
    senales.push({
      id: 'lcp',
      valor: seg(pulso.lcpP75, locale),
      etiqueta: t.lcp,
      href: L('/engineering'),
      panel: {
        titulo: p.lcp.titulo,
        descripcion: p.lcp.descripcion,
        fuente: p.lcp.fuente,
        barras: barrasLcp(pulso.muestrasLcp, locale, p.tramosLcp),
        ejeIzq: p.tramosLcp[0],
        ejeDer: p.tramosLcp[p.tramosLcp.length - 1],
        resumen: [
          { k: p.lcp.resumen[0], v: p50 === null ? AUSENTE : seg(p50, locale) },
          { k: p.lcp.resumen[1], v: p95 === null ? AUSENTE : seg(p95, locale) },
          { k: p.lcp.resumen[2], v: formatNumber(pulso.muestrasLcp.length, locale) },
        ],
      },
    })
  }

  return senales
}
