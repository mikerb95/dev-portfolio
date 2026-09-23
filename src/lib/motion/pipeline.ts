// Geometría del pipeline de la sección "Cómo trabajo" de la portada.
//
// El trazado no es una ruta SVG escrita a mano: se construye a partir de los
// centros medidos de los nodos de cada etapa, así sirve igual con las etapas en
// fila (escritorio) que en columna (móvil) y no se descuadra si cambia la
// tipografía. Se arma como polilínea para conocer EXACTAMENTE a qué distancia
// del origen queda cada nodo: con eso se sabe en qué etapa va el paquete sin
// preguntarle nada al navegador (`getTotalLength` no da la longitud hasta un
// punto intermedio).
//
// Módulo puro, probado en tests/motion-pipeline.test.ts.

export type Punto = { x: number; y: number }

export type Trazado = {
  /** Atributo `d` de la ruta SVG. */
  d: string
  /** Longitud total del trazado. */
  total: number
  /** Distancia desde el origen hasta cada nodo, en el orden recibido. */
  nodos: number[]
}

export type EstadoEtapa = 'pendiente' | 'corriendo' | 'listo'

const dist = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y)
const f = (n: number) => Math.round(n * 10) / 10

/**
 * Trazado horizontal tipo pista de circuito: entre dos nodos la línea baja un
 * escalón en diagonal y vuelve a subir antes del siguiente. Una recta sin más
 * se lee como un separador; el escalón la hace leer como un recorrido.
 *
 * `desde` y `hasta` son los extremos antes del primer nodo y después del
 * último (el origen del commit y la salida a producción).
 */
export function trazadoHorizontal(nodos: Punto[], desde: number, hasta: number, escalon = 14): Trazado {
  if (nodos.length === 0) return { d: '', total: 0, nodos: [] }
  const y = nodos[0].y
  const puntos: Punto[] = [{ x: desde, y }]
  const indices: number[] = []
  nodos.forEach((n, i) => {
    if (i > 0) {
      const a = nodos[i - 1]
      const tramo = n.x - a.x
      // El escalón ocupa el tercio central del tramo; las diagonales son a 45°.
      const x1 = a.x + tramo * 0.34
      const x2 = a.x + tramo * 0.66
      const bajo = y + (i % 2 === 1 ? escalon : -escalon)
      puntos.push({ x: x1, y }, { x: x1 + escalon, y: bajo }, { x: x2 - escalon, y: bajo }, { x: x2, y })
    }
    indices.push(puntos.length)
    puntos.push({ x: n.x, y })
  })
  puntos.push({ x: hasta, y })
  return polilinea(puntos, indices)
}

/** Trazado vertical (móvil): recta por los centros de los nodos. */
export function trazadoVertical(nodos: Punto[], desde: number, hasta: number): Trazado {
  if (nodos.length === 0) return { d: '', total: 0, nodos: [] }
  const x = nodos[0].x
  const puntos: Punto[] = [{ x, y: desde }]
  const indices: number[] = []
  for (const n of nodos) {
    indices.push(puntos.length)
    puntos.push({ x, y: n.y })
  }
  puntos.push({ x, y: hasta })
  return polilinea(puntos, indices)
}

function polilinea(puntos: Punto[], indicesNodo: number[]): Trazado {
  const acumulado: number[] = [0]
  for (let i = 1; i < puntos.length; i++) acumulado.push(acumulado[i - 1] + dist(puntos[i - 1], puntos[i]))
  const d = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p.x)} ${f(p.y)}`).join(' ')
  return { d, total: acumulado[acumulado.length - 1], nodos: indicesNodo.map((i) => acumulado[i]) }
}

/**
 * Estado de cada etapa con el paquete a `recorrido` unidades del origen: las
 * que ya dejó atrás están listas, aquella en la que está (la última alcanzada)
 * corre, y las que no alcanzó esperan. Al llegar al final del trazado, todas
 * listas: el pipeline terminó y el trabajo está en producción.
 */
export function estadosEtapas(recorrido: number, t: Trazado): EstadoEtapa[] {
  const fin = recorrido >= t.total - 0.5
  let actual = -1
  t.nodos.forEach((n, i) => {
    if (recorrido >= n) actual = i
  })
  return t.nodos.map((_, i) => {
    if (fin || i < actual) return 'listo'
    if (i === actual) return 'corriendo'
    return 'pendiente'
  })
}
