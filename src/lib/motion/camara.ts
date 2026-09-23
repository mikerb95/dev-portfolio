// Matemática de cámara para los lienzos WebGL de la portada (isolíneas del
// hero). Módulo puro: sin DOM ni WebGL, para poder probarlo en Vitest y para
// que el navegador y los tests calculen EXACTAMENTE lo mismo. Matrices en orden
// de columnas, que es como las espera `uniformMatrix4fv` sin transponer.

export type Vec3 = [number, number, number]
export type Mat4 = Float32Array

export type Camara = {
  pos: Vec3
  objetivo: Vec3
  /** Campo de visión vertical, en radianes. */
  fov: number
  aspecto: number
}

const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cruz = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const normalizar = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * Base ortonormal de la cámara. Se mira hacia +z con la derecha en +x: el
 * mismo convenio que la malla del terreno, que crece en profundidad hacia +z.
 */
export function base(c: Camara): { frente: Vec3; derecha: Vec3; arriba: Vec3 } {
  const frente = normalizar(resta(c.objetivo, c.pos))
  // cruz(arriba del mundo, frente) y no al revés: con la mano derecha, ese
  // orden deja la derecha de la pantalla en +x mirando hacia +z.
  const derecha = normalizar(cruz([0, 1, 0], frente))
  const arriba = cruz(frente, derecha)
  return { frente, derecha, arriba }
}

export function perspectiva(fov: number, aspecto: number, cerca: number, lejos: number): Mat4 {
  const f = 1 / Math.tan(fov / 2)
  const nf = 1 / (cerca - lejos)
  // prettier-ignore
  return new Float32Array([
    f / aspecto, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (lejos + cerca) * nf, -1,
    0, 0, 2 * lejos * cerca * nf, 0,
  ])
}

/**
 * Matriz de vista. Se construye con -frente como eje z de la cámara (OpenGL
 * mira hacia -z), así que un punto delante de la cámara queda con z negativa
 * en espacio de vista y la perspectiva estándar lo proyecta bien.
 */
export function vista(c: Camara): Mat4 {
  const { frente, derecha, arriba } = base(c)
  const z: Vec3 = [-frente[0], -frente[1], -frente[2]]
  // prettier-ignore
  return new Float32Array([
    derecha[0], arriba[0], z[0], 0,
    derecha[1], arriba[1], z[1], 0,
    derecha[2], arriba[2], z[2], 0,
    -punto(derecha, c.pos), -punto(arriba, c.pos), -punto(z, c.pos), 1,
  ])
}

export function multiplicar(a: Mat4, b: Mat4): Mat4 {
  const r = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let fila = 0; fila < 4; fila++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + fila] * b[col * 4 + k]
      r[col * 4 + fila] = s
    }
  }
  return r
}

/**
 * Punto del suelo (plano y = alturaSuelo) bajo una coordenada de pantalla en
 * NDC (-1..1, y hacia arriba). Devuelve null si el rayo no baja: el cursor está
 * sobre el horizonte y no hay terreno que levantar.
 *
 * Se resuelve con la base de la cámara y no invirtiendo la matriz: son tres
 * productos y no hay precisión que perder en la inversión.
 */
export function rayoAlSuelo(
  c: Camara,
  ndcX: number,
  ndcY: number,
  alturaSuelo = 0,
): { x: number; z: number; distancia: number } | null {
  const { frente, derecha, arriba } = base(c)
  const t = Math.tan(c.fov / 2)
  const dir = normalizar([
    frente[0] + derecha[0] * ndcX * t * c.aspecto + arriba[0] * ndcY * t,
    frente[1] + derecha[1] * ndcX * t * c.aspecto + arriba[1] * ndcY * t,
    frente[2] + derecha[2] * ndcX * t * c.aspecto + arriba[2] * ndcY * t,
  ])
  // Un rayo casi horizontal corta el suelo en el infinito: por debajo de este
  // umbral el punto quedaría tan lejos que el pico del cursor sería invisible.
  if (dir[1] > -1e-3) return null
  const d = (alturaSuelo - c.pos[1]) / dir[1]
  return { x: c.pos[0] + dir[0] * d, z: c.pos[2] + dir[2] * d, distancia: d }
}

/** Interpolación lineal, compartida por las transiciones de cámara. */
export const mezclar = (a: number, b: number, t: number) => a + (b - a) * t
