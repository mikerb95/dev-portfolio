// Lógica pura del "filtro de capas", la pieza del hero de /security.
//
// La escena mezcla dos cosas que no pesan igual, y este módulo es el que las
// mantiene separadas:
//   · el REPARTO entre tipos de ataque sale de los agregados reales de 30 días
//     (las mismas consultas que ya hacía la página, ninguna nueva), así que la
//     proporción de puntos de cada categoría es un dato;
//   · la proporción entre tráfico limpio y hostil NO la mide el sitio (no
//     guarda las visitas limpias), así que es una constante ilustrativa y la
//     pieza lo dice en su pie.
//
// Cada punto hostil tiene un destino según su categoría, que es lo que hace
// de verdad el sistema con ese tipo de petición: la lista de bloqueo y el
// límite de tasa la frenan en el clasificador (capa 2), un endpoint señuelo la
// atrapa (capa 3) y el resto se registra en la bitácora y sigue a un 404
// normal. El cron horario (capa 4) no está en el camino del request: barre la
// bitácora y devuelve bloqueos a la capa 2, y así se dibuja.
//
// Módulo puro (sin DOM), probado en tests/motion-security.test.ts.

export type Destino = 'limpia' | 'frenada' | 'senuelo' | 'registrada'

/** Categorías que el clasificador frena en el acto (403 o 429). */
export const CATEGORIAS_FRENADAS: readonly string[] = ['blocklist', 'api_abuse']
export const CATEGORIA_SENUELO = 'honeypot'

/**
 * Posición horizontal (0..1) de las tres membranas que están en el camino del
 * request y del sitio. La capa 1 (plataforma) es la primera: aquí se dibuja
 * punteada porque su trabajo ocurre fuera del sitio y no se mide desde aquí.
 */
export const CAPAS_X = [0.2, 0.43, 0.66] as const
export const SITIO_X = 0.92

/** Fracción ilustrativa de puntos hostiles: el sitio no cuenta visitas limpias. */
export const FRACCION_HOSTIL = 0.38

export function destinoDe(categoria: string): Exclude<Destino, 'limpia'> {
  if (categoria === CATEGORIA_SENUELO) return 'senuelo'
  if (CATEGORIAS_FRENADAS.includes(categoria)) return 'frenada'
  return 'registrada'
}

export type Reparto = { categoria: string; peso: number; destino: Exclude<Destino, 'limpia'> }[]

/**
 * Normaliza los conteos por categoría a pesos que suman 1, de mayor a menor.
 * Los conteos llegan de SQLite como número o como texto según el driver, y un
 * conteo no positivo no aporta puntos.
 */
export function repartoHostil(filas: { category: string; count: number | string }[]): Reparto {
  const limpias = filas
    .map((f) => ({ categoria: f.category, n: Number(f.count) }))
    .filter((f) => Number.isFinite(f.n) && f.n > 0)
  const total = limpias.reduce((s, f) => s + f.n, 0)
  if (total === 0) return []
  return limpias
    .sort((a, b) => b.n - a.n)
    .map((f) => ({ categoria: f.categoria, peso: f.n / total, destino: destinoDe(f.categoria) }))
}

export type ResumenCapas = {
  detectados: number
  frenadas: number
  senuelos: number
  bloqueos: number
}

/** Cifras que se leen bajo cada capa. Todas salen de agregados ya publicados. */
export function resumenCapas(
  filas: { category: string; count: number | string }[],
  detectados: number,
  bloqueos: number,
): ResumenCapas {
  let frenadas = 0
  let senuelos = 0
  for (const f of filas) {
    const n = Number(f.count) || 0
    const d = destinoDe(f.category)
    if (d === 'frenada') frenadas += n
    else if (d === 'senuelo') senuelos += n
  }
  return { detectados, frenadas, senuelos, bloqueos }
}

// ── Azar con semilla ───────────────────────────────────────────────────────

/**
 * mulberry32: la escena estática del servidor y la animada del navegador
 * arrancan de la misma semilla, así que la primera no se ve como una foto de
 * otra cosa cuando el script toma el relevo.
 */
export function crearAzar(semilla: number): () => number {
  let s = semilla >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Elige un elemento con probabilidad proporcional a su peso. `r` en [0, 1). */
export function elegirPonderado<T extends { peso: number }>(items: readonly T[], r: number): T | null {
  const total = items.reduce((s, i) => s + Math.max(0, i.peso), 0)
  if (total <= 0) return null
  let x = r * total
  for (const it of items) {
    x -= Math.max(0, it.peso)
    if (x < 0) return it
  }
  return items[items.length - 1]
}

/** Tipo de un punto nuevo: limpio, o una categoría hostil según el reparto real. */
export function nuevoTipo(reparto: Reparto, azar: () => number): { destino: Destino; categoria: string | null } {
  if (reparto.length === 0 || azar() >= FRACCION_HOSTIL) return { destino: 'limpia', categoria: null }
  const c = elegirPonderado(reparto, azar())!
  return { destino: c.destino, categoria: c.categoria }
}

/**
 * Hasta dónde llega un punto según su destino (0..1 del ancho). El limpio
 * cruza hasta el sitio; el frenado rebota en la capa 2; el señuelo queda en la
 * capa 3; el registrado se desvía a la bitácora justo después de la capa 2.
 */
export function alcance(destino: Destino): number {
  switch (destino) {
    case 'limpia':
      return SITIO_X
    case 'frenada':
      return CAPAS_X[1]
    case 'senuelo':
      return CAPAS_X[2]
    case 'registrada':
      return CAPAS_X[1] + 0.06
  }
}

// ── Membranas ──────────────────────────────────────────────────────────────

export type Onda = { y: Float32Array; v: Float32Array }

export function crearOnda(segmentos: number): Onda {
  return { y: new Float32Array(segmentos + 1), v: new Float32Array(segmentos + 1) }
}

/**
 * Un impacto en la altura `pos` (0..1) empuja la membrana con una campana de
 * tres segmentos. Una campana y no un punto: un solo nodo desplazado se ve como
 * un pico dentado, no como una tela que cede.
 */
export function golpear(onda: Onda, pos: number, fuerza: number): void {
  const n = onda.y.length - 1
  const c = Math.round(Math.min(1, Math.max(0, pos)) * n)
  for (let k = -3; k <= 3; k++) {
    const i = c + k
    if (i <= 0 || i >= n) continue
    onda.v[i] += fuerza * Math.exp(-(k * k) / 3)
  }
}

/**
 * Un paso de la ecuación de onda amortiguada, con los extremos fijos. `dt` en
 * segundos; se subdivide para que un fotograma lento (pestaña que vuelve, GPU
 * ocupada) no haga explotar la integración. Devuelve la amplitud máxima, que
 * el lienzo usa para saber si la membrana ya está quieta y dibujarla recta.
 */
export function pasoOnda(onda: Onda, dt: number, tension = 900, amortiguacion = 5.5): number {
  const { y, v } = onda
  const n = y.length - 1
  const pasos = Math.max(1, Math.ceil(dt / (1 / 240)))
  const h = Math.min(dt, 0.1) / pasos
  let max = 0
  for (let p = 0; p < pasos; p++) {
    for (let i = 1; i < n; i++) {
      const acel = tension * (y[i - 1] + y[i + 1] - 2 * y[i]) / 4 - amortiguacion * v[i] - 30 * y[i]
      v[i] += acel * h
    }
    for (let i = 1; i < n; i++) y[i] += v[i] * h
  }
  for (let i = 1; i < n; i++) max = Math.max(max, Math.abs(y[i]))
  return max
}

// ── Escena estática ────────────────────────────────────────────────────────

export type PuntoEstatico = { x: number; y: number; destino: Destino }

/**
 * Los puntos que pinta el servidor: una instantánea verosímil del flujo, sin
 * JS ni movimiento. Cada punto está en un tramo que su destino recorre de
 * verdad (un frenado nunca aparece pasada la capa 2, un registrado aparece
 * bajando hacia la bitácora), así la foto quieta ya explica la pieza.
 * Coordenadas en 0..1; `y` deja libre la franja de la bitácora (abajo).
 */
export function escenaEstatica(reparto: Reparto, semilla: number, cantidad: number): PuntoEstatico[] {
  const azar = crearAzar(semilla)
  const puntos: PuntoEstatico[] = []
  for (let i = 0; i < cantidad; i++) {
    const { destino } = nuevoTipo(reparto, azar)
    const y = 0.08 + azar() * 0.66
    let x: number
    let yy = y
    if (destino === 'limpia') x = 0.03 + azar() * (SITIO_X - 0.05)
    else if (destino === 'frenada') x = 0.03 + azar() * (CAPAS_X[1] - 0.05)
    else if (destino === 'senuelo') x = 0.03 + azar() * (CAPAS_X[2] - 0.04)
    else {
      const t = azar()
      if (t < 0.6) x = 0.03 + (t / 0.6) * (CAPAS_X[1] - 0.04)
      else {
        // Tramo de caída: pasada la capa 2, el punto se curva hacia la bitácora.
        const u = (t - 0.6) / 0.4
        x = CAPAS_X[1] + 0.02 + u * 0.08
        yy = y + (0.86 - y) * u * u
      }
    }
    puntos.push({ x, y: yy, destino })
  }
  return puntos
}

/**
 * Tramos de la bitácora (la barra apilada de abajo): el reparto real, con el
 * inicio de cada tramo acumulado. Se agrupa la cola de categorías pequeñas
 * para que ningún tramo quede más fino que un pelo e ilegible al apuntarlo,
 * salvo las que la escena pinta de otro color (frenadas y señuelo): esas son
 * justo las que el ojo busca en la barra aunque sean pocas.
 */
export function tramosBitacora(reparto: Reparto, minimo = 0.025): { categoria: string; desde: number; ancho: number; destino: Destino }[] {
  const tramos: { categoria: string; desde: number; ancho: number; destino: Destino }[] = []
  let acum = 0
  let resto = 0
  for (const r of reparto) {
    if (r.peso < minimo && r.destino === 'registrada') {
      resto += r.peso
      continue
    }
    tramos.push({ categoria: r.categoria, desde: acum, ancho: r.peso, destino: r.destino })
    acum += r.peso
  }
  if (resto > 0) tramos.push({ categoria: 'otros', desde: acum, ancho: resto, destino: 'registrada' })
  return tramos
}
