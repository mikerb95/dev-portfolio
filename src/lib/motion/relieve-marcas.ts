// Relieve de marcas: el mapa topográfico de la sección de marcas de la portada.
//
// Es el mismo terreno del hero, ahora visto desde arriba: el hero se aplana en
// la cinta de señales y aquí vuelve a levantarse como un mapa. Cada logo es
// una cumbre. Un solo fragment shader sobre un triángulo que cubre el lienzo:
//   · La altura de cada cumbre sale de la distancia a la CAJA del logo (con
//     esquinas redondeadas), no a su centro. Así las curvas cercanas abrazan la
//     forma del logo (un wordmark alargado es una loma, el gorila un cerro) y
//     se van redondeando al alejarse, como las de un mapa de verdad.
//   · La caja más un margen es una meseta plana: ninguna curva cruza un logo.
//   · Ruido de fondo (el mismo RUIDO/fbm del hero) para que entre cumbres haya
//     terreno y no un vacío con seis dianas.
//   · Elevar una cumbre (cursor, foco, selección) le suma altura: aparecen más
//     anillos, se aprietan y se tiñen del color de la marca.
//   · Los pulsos (clic o latido) salen de la caja de la cumbre hacia afuera,
//     siguiendo su forma: el sondeo del hero, con el contorno de cada marca.
//
// Sin dependencias: WebGL2 directo. Módulo solo de navegador. Si no hay WebGL2
// o el shader no compila, devuelve null y la sección queda con su fondo de CSS.

import { acercar } from '../marcas-relieve'
import { LINEA, programa as enlazar, RUIDO } from './glsl'

const MAX_CUMBRES = 6
const MAX_PULSOS = 4

const VERTEX = /* glsl */ `#version 300 es
precision highp float;
const vec2 V[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(V[gl_VertexID], 0.0, 1.0); }
`

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uRes;              // px de dispositivo
uniform float uU;               // px de dispositivo por px CSS
uniform int uN;
uniform vec4 uCumbres[${MAX_CUMBRES}];  // centro xy, semiejes xy (px dispositivo, y hacia arriba)
uniform float uAltura[${MAX_CUMBRES}];  // entrada de la cumbre × (1 + elevación)
uniform float uElev[${MAX_CUMBRES}];    // 0..1, solo elevación (para el color)
uniform vec3 uColor[${MAX_CUMBRES}];
uniform float uTiempo;
uniform float uEntrada;         // 0 = suelo plano, 1 = mapa completo
uniform vec3 uCursor;           // xy, intensidad
uniform vec4 uPulsos[${MAX_PULSOS}];    // xy (si es libre), edad s, intensidad
uniform float uPulsoCumbre[${MAX_PULSOS}]; // índice de cumbre, o -1 si sale de un punto

out vec4 color;

${RUIDO}
${LINEA}

// Distancia con signo a una caja de esquinas redondeadas (negativa dentro).
float caja(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float distCumbre(vec2 p, int i) {
  vec4 C = uCumbres[i];
  return caja(p - C.xy, C.zw, min(C.z, C.w) * 0.6) / uU; // en px CSS
}

void main() {
  vec2 px = gl_FragCoord.xy;
  // Deformación suave del dominio: los anillos dejan de ser offsets perfectos
  // de un rectángulo y pasan a parecer curvas de nivel levantadas a mano.
  vec2 q = px / (uU * 210.0);
  vec2 alabeo = vec2(ruido(q + vec2(1.7, 9.2) + uTiempo * 0.03), ruido(q + vec2(8.3, 2.8) - uTiempo * 0.025));
  vec2 pw = px + alabeo * uU * 34.0;

  // Ruido de fondo bajo a propósito: con más amplitud, sus curvas vagaban por
  // el mapa con el mismo peso que los anillos y las cumbres no se leían.
  float h = fbm(px / (uU * 460.0) + vec2(uTiempo * 0.012, 0.0)) * 0.7;
  float mascara = 1.0;     // 0 sobre los logos
  float tinte = 0.0;
  vec3 colorMarca = vec3(0.0);
  float brillo = 0.0;

  for (int i = 0; i < ${MAX_CUMBRES}; i++) {
    if (i >= uN) break;
    float s = distCumbre(pw, i);
    float sReal = distCumbre(px, i);
    // Meseta de 16 px alrededor de la caja; caída más larga que gaussiana para
    // que los anillos exteriores se separen como en una ladera que se suaviza.
    float t = max(s - 16.0, 0.0) / 150.0;
    float f = exp(-pow(t, 1.25) * 1.35);
    h += uAltura[i] * 2.7 * f;
    mascara *= smoothstep(6.0, 26.0, sReal);

    float w = pow(f, 0.7) * (0.38 + 0.62 * uElev[i]) * min(uAltura[i], 1.0);
    colorMarca += uColor[i] * w;
    tinte += w;
    brillo += uElev[i] * exp(-pow(max(sReal, 0.0) / 120.0, 2.0));
  }

  // Pico del cursor: el mismo gesto del hero, más suave.
  vec2 dc = (px - uCursor.xy) / (uU * 80.0);
  h += uCursor.z * 0.9 * exp(-dot(dc, dc));
  brillo += uCursor.z * 0.5 * exp(-dot(dc, dc) * 0.5);

  float pulso = 0.0;
  for (int k = 0; k < ${MAX_PULSOS}; k++) {
    vec4 P = uPulsos[k];
    if (P.w <= 0.0) continue;
    int ic = int(uPulsoCumbre[k]);
    float r = ic >= 0 ? max(distCumbre(pw, ic) - 16.0, 0.0) : length(px - P.xy) / uU;
    float frente = P.z * 240.0;
    pulso += P.w * exp(-pow((r - frente) / 22.0, 2.0)) * exp(-P.z * 1.15);
  }
  h += pulso * 0.35;

  h *= uEntrada;
  float v = h * 2.2;
  float menor = linea(v, 1.0);
  float mayor = linea(v / 4.0, 1.6);
  // Donde las curvas se apiñan más de lo que un píxel separa, se apagan en vez
  // de hacer moiré (mismo criterio que el terreno del hero).
  float separables = 1.0 - smoothstep(0.12, 0.34, fwidth(v));

  vec3 cian = vec3(0.0, 0.949, 1.0);
  vec3 violeta = vec3(0.655, 0.545, 1.0);
  vec3 base = mix(violeta, cian, smoothstep(0.0, 1.0, px.y / uRes.y));
  vec3 marca = tinte > 0.0 ? colorMarca / tinte : base;
  vec3 c = mix(base, marca, clamp(tinte * 1.15, 0.0, 1.0));
  c = mix(c, vec3(0.86, 1.0, 1.0), clamp(pulso * 0.5, 0.0, 0.6));

  float a = (menor * 0.24 + mayor * 0.38) * separables;
  a *= 1.0 + clamp(tinte, 0.0, 1.0) * 0.9 + brillo * 1.1 + pulso * 1.8;
  a *= mascara;
  // Bordes: el mapa se funde arriba y abajo con la página y a los lados.
  vec2 uv = px / uRes;
  a *= smoothstep(0.0, 0.16, uv.y) * smoothstep(1.0, 0.84, uv.y);
  a *= smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x);
  a = clamp(a * uEntrada, 0.0, 1.0);
  color = vec4(c * a, a);
}
`

export type Cumbre = {
  /** Centro y semiejes de la caja del logo, en px CSS relativos al lienzo. */
  x: number
  y: number
  semiAncho: number
  semiAlto: number
  color: [number, number, number]
}

export type Relieve = {
  /** Cajas de los logos (al montar y en cada cambio de tamaño). */
  medir: (cumbres: Cumbre[]) => void
  /** Elevación objetivo de una cumbre, 0..1 (cursor, foco, selección). */
  elevar: (i: number, objetivo: number) => void
  /** Entrada global (0 = plano) y por cumbre; las mueve la coreografía. */
  estado: { entrada: number; base: number[] }
  /** Onda que sale de la cumbre i, siguiendo su contorno. */
  pulso: (i: number, intensidad?: number) => void
  /** Onda desde un punto del lienzo (px CSS del cliente). */
  pulsoLibre: (clienteX: number, clienteY: number) => void
  /** Pausa/reanuda el bucle (fuera de pantalla, pestaña oculta). */
  activar: (si: boolean) => void
  /** Repinta una vez (modo quieto: movimiento reducido). */
  pintar: () => void
  destruir: () => void
}

type Opciones = {
  zona: HTMLElement
  reducido?: boolean
  /** Índices que no deben recibir latidos (la seleccionada ya está elevada). */
  enReposo?: () => boolean
}

export function montarRelieve(lienzo: HTMLCanvasElement, opciones: Opciones): Relieve | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = lienzo.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false })
  } catch {
    gl = null
  }
  if (!gl) return null

  let prog: WebGLProgram
  try {
    prog = enlazar(gl, VERTEX, FRAGMENT)
  } catch (err) {
    console.warn('[relieve-marcas]', err)
    return null
  }
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  gl.useProgram(prog)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  const u = (n: string) => gl!.getUniformLocation(prog, n)
  const U = {
    res: u('uRes'),
    u: u('uU'),
    n: u('uN'),
    cumbres: u('uCumbres'),
    altura: u('uAltura'),
    elev: u('uElev'),
    color: u('uColor'),
    tiempo: u('uTiempo'),
    entrada: u('uEntrada'),
    cursor: u('uCursor'),
    pulsos: u('uPulsos'),
    pulsoCumbre: u('uPulsoCumbre'),
  }

  const reducido = !!opciones.reducido
  let cumbres: Cumbre[] = []
  const elev = new Array(MAX_CUMBRES).fill(0)
  const objetivo = new Array(MAX_CUMBRES).fill(0)
  const estado = { entrada: reducido ? 1 : 0, base: new Array(MAX_CUMBRES).fill(reducido ? 1 : 0) }
  const cursor = { x: 0, y: 0, dentro: false, intensidad: 0 }
  const pulsos: { x: number; y: number; cumbre: number; t0: number; intensidad: number }[] = []

  // Resolución adaptativa: techo de 1.5 (un mapa de líneas finas no gana nada
  // a 2x y cuesta el doble), y baja si los fotogramas se alargan.
  let escala = Math.min(window.devicePixelRatio || 1, 1.5)
  const muestras: number[] = []
  const inicio = performance.now()
  const segundos = () => (performance.now() - inicio) / 1000

  const bufCumbres = new Float32Array(MAX_CUMBRES * 4)
  const bufAltura = new Float32Array(MAX_CUMBRES)
  const bufElev = new Float32Array(MAX_CUMBRES)
  const bufColor = new Float32Array(MAX_CUMBRES * 3)
  const bufPulsos = new Float32Array(MAX_PULSOS * 4)
  const bufPulsoCumbre = new Float32Array(MAX_PULSOS)

  const ajustar = () => {
    const w = Math.max(1, Math.round(lienzo.clientWidth * escala))
    const h = Math.max(1, Math.round(lienzo.clientHeight * escala))
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w
      lienzo.height = h
    }
  }

  const dibujar = (t: number) => {
    ajustar()
    const k = lienzo.width / Math.max(1, lienzo.clientWidth)
    const H = lienzo.height
    gl!.viewport(0, 0, lienzo.width, H)
    gl!.clearColor(0, 0, 0, 0)
    gl!.clear(gl!.COLOR_BUFFER_BIT)

    bufCumbres.fill(0)
    bufColor.fill(0)
    cumbres.forEach((c, i) => {
      // y hacia arriba: gl_FragCoord tiene el origen abajo a la izquierda.
      bufCumbres.set([c.x * k, H - c.y * k, c.semiAncho * k, c.semiAlto * k], i * 4)
      bufColor.set(c.color, i * 3)
      bufAltura[i] = estado.base[i] * (1 + 0.95 * elev[i])
      bufElev[i] = elev[i] * estado.base[i]
    })
    bufPulsos.fill(0)
    bufPulsoCumbre.fill(-1)
    pulsos.forEach((p, i) => {
      bufPulsos.set([p.x * k, H - p.y * k, t - p.t0, p.intensidad], i * 4)
      bufPulsoCumbre[i] = p.cumbre
    })

    gl!.uniform2f(U.res, lienzo.width, H)
    gl!.uniform1f(U.u, k)
    gl!.uniform1i(U.n, cumbres.length)
    gl!.uniform4fv(U.cumbres, bufCumbres)
    gl!.uniform1fv(U.altura, bufAltura)
    gl!.uniform1fv(U.elev, bufElev)
    gl!.uniform3fv(U.color, bufColor)
    gl!.uniform1f(U.tiempo, t)
    gl!.uniform1f(U.entrada, estado.entrada)
    gl!.uniform3f(U.cursor, cursor.x * k, H - cursor.y * k, cursor.intensidad)
    gl!.uniform4fv(U.pulsos, bufPulsos)
    gl!.uniform1fv(U.pulsoCumbre, bufPulsoCumbre)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  // ── Bucle ──
  let raf = 0
  let activo = false
  let anterior = performance.now()
  let proximoLatido = 3.5

  const paso = (ahora: number) => {
    raf = 0
    const dt = Math.min(0.05, (ahora - anterior) / 1000)
    anterior = ahora
    const t = segundos()

    // Sube rápido y baja despacio: al pasar el cursor de un logo al vecino la
    // primera cumbre se va asentando mientras la otra se levanta, no se apaga.
    for (let i = 0; i < cumbres.length; i++) {
      elev[i] = acercar(elev[i], objetivo[i], dt, objetivo[i] > elev[i] ? 7 : 2.6)
    }
    cursor.intensidad = acercar(cursor.intensidad, cursor.dentro ? 1 : 0, dt, cursor.dentro ? 3 : 2)

    while (pulsos.length && t - pulsos[0].t0 > 4) pulsos.shift()
    // Latido: con el mapa en reposo, una cumbre al azar emite una onda tenue
    // cada pocos segundos. Sin cursor (móvil) es lo que dice "esto responde".
    if (t > proximoLatido && estado.entrada > 0.95 && cumbres.length) {
      if (!opciones.enReposo || opciones.enReposo()) {
        emitir(Math.floor(Math.random() * cumbres.length), 0, 0, 0.5)
      }
      proximoLatido = t + 5 + Math.random() * 3
    }

    dibujar(t)

    muestras.push(dt)
    if (muestras.length >= 40) {
      const media = muestras.reduce((s, v) => s + v, 0) / muestras.length
      muestras.length = 0
      if (media > 0.024 && escala > 0.75) escala = Math.max(0.75, escala - 0.25)
    }
    if (activo && !document.hidden) raf = requestAnimationFrame(paso)
  }

  const arrancar = () => {
    if (raf || reducido || !activo || document.hidden) return
    anterior = performance.now()
    raf = requestAnimationFrame(paso)
  }
  const parar = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const emitir = (cumbre: number, x: number, y: number, intensidad: number) => {
    // Una onda es movimiento: con movimiento reducido no se emite.
    if (reducido) return
    if (pulsos.length >= MAX_PULSOS) pulsos.shift()
    pulsos.push({ x, y, cumbre, t0: segundos(), intensidad })
  }

  const zona = opciones.zona
  const posLocal = (clienteX: number, clienteY: number) => {
    const r = lienzo.getBoundingClientRect()
    return { x: clienteX - r.left, y: clienteY - r.top }
  }
  const alMover = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const p = posLocal(e.clientX, e.clientY)
    cursor.x = p.x
    cursor.y = p.y
    cursor.dentro = true
  }
  const alSalir = () => {
    cursor.dentro = false
  }
  const alVisibilidad = () => (document.hidden ? parar() : arrancar())

  if (!reducido) {
    zona.addEventListener('pointermove', alMover, { passive: true })
    zona.addEventListener('pointerleave', alSalir)
    document.addEventListener('visibilitychange', alVisibilidad)
  }
  const ro = new ResizeObserver(() => {
    ajustar()
    if (reducido) dibujar(14)
  })
  ro.observe(lienzo)

  return {
    medir(c) {
      cumbres = c.slice(0, MAX_CUMBRES)
      if (reducido) dibujar(14)
    },
    elevar(i, v) {
      objetivo[i] = v
      if (reducido) {
        // Sin animación: la cumbre aparece ya levantada.
        elev[i] = v
        dibujar(14)
      }
    },
    estado,
    pulso(i, intensidad = 1) {
      emitir(i, 0, 0, intensidad)
    },
    pulsoLibre(clienteX, clienteY) {
      const p = posLocal(clienteX, clienteY)
      emitir(-1, p.x, p.y, 0.8)
    },
    activar(si) {
      activo = si
      if (si) arrancar()
      else parar()
    },
    pintar() {
      dibujar(reducido ? 14 : segundos())
    },
    destruir() {
      parar()
      ro.disconnect()
      zona.removeEventListener('pointermove', alMover)
      zona.removeEventListener('pointerleave', alSalir)
      document.removeEventListener('visibilitychange', alVisibilidad)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
