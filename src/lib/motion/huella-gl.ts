// Huella dactilar generativa de la sección Lab (parámetros en huella.ts).
//
// Las crestas son isolíneas de un campo radial deformado: el mismo lenguaje del
// terreno del hero y de las portadas, aplicado a un dedo. Tres gestos:
//   · Escaneo: una línea recorre el dedo de arriba abajo como en un lector de
//     huellas. La primera pasada REVELA la huella (encima de la línea ya está,
//     debajo todavía no); después vuelve a pasar cada pocos segundos.
//   · Transformación: mientras se leen las señales del navegador se dibuja una
//     huella neutra, y cuando llega el hash las crestas se deforman hasta la
//     del visitante, en vez de cambiar de golpe.
//   · Presión: bajo el cursor la piel se abomba, como un dedo apoyado.
//
// Módulo solo de navegador.

import { HUELLA_NEUTRA, type ParametrosHuella } from './huella'
import { programa, RUIDO, trianguloCompleto, VERTEX_COMPLETO } from './glsl'

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform vec4 uA0;
uniform vec4 uB0;
uniform vec4 uA1;
uniform vec4 uB1;
uniform float uMezcla;
uniform vec3 uCursor;     // x, y (en coordenadas del lienzo), intensidad
uniform float uEscaneo;   // y de la línea de escaneo
uniform float uRevelado;  // por encima de esta y la huella ya está revelada
out vec4 color;

${RUIDO}

// Separación entre crestas, en unidades del lienzo (alto = 1).
const float PASO = 0.0175;

float campo(vec2 p, vec4 A, vec4 B) {
  vec2 q = (p - A.xy) / vec2(A.z, 1.0);
  float r = length(q);
  // Ángulo medido desde +y: el corte de atan queda apuntando hacia abajo, en
  // la zona donde la espiral ya se desvaneció (ver abajo).
  float th = atan(q.x, q.y);
  float f = r * (1.0 + 0.06 * sin(2.0 * th + A.w) + 0.035 * sin(3.0 * th + 1.7 * A.w));

  // Espiral del núcleo (verticilo). Se apaga al acercarse al corte del ángulo:
  // allí el término salta de valor, y apagado no hay costura.
  float sinCorte = smoothstep(3.1416, 2.2, abs(th));
  f += B.x * PASO * (th / 6.2831853) * sinCorte;

  // Lazo: por debajo del núcleo las crestas se abren en arcos que bajan hacia
  // la base del dedo, como en el patrón más común.
  float abajo = smoothstep(0.02, -0.32, q.y);
  float arcos = 0.6 * (-q.y) + 0.22 * q.x * q.x + 0.05;
  f = mix(f, arcos, B.w * abajo);

  // Ruido fino: rompe las crestas en bifurcaciones y finales, las minucias que
  // hacen que una huella parezca una huella y no un blanco de tiro.
  f += 0.011 * ruido(p * 5.0 + B.yz) + 0.0045 * ruido(p * 13.0 + B.zy);
  return f;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  vec2 dc = p - uCursor.xy;
  float presion = uCursor.z * exp(-dot(dc, dc) / 0.01);
  vec2 pw = p - dc * 0.32 * presion;

  float t = uMezcla * uMezcla * (3.0 - 2.0 * uMezcla);
  float f = mix(campo(pw, uA0, uB0), campo(pw, uA1, uB1), t);
  float v = f / PASO;
  float fw = fwidth(v);
  float c = abs(fract(v) - 0.5);
  float cresta = 1.0 - smoothstep(0.17 - fw * 0.75, 0.17 + fw * 0.75, c);
  // Donde las crestas no caben en el píxel, gris medio en vez de moiré.
  cresta = mix(cresta, 0.34, smoothstep(0.35, 0.7, fw));

  // Silueta del dedo: un óvalo algo más ancho arriba, de borde difuso.
  vec2 e = (p - vec2(0.0, 0.0)) / vec2(0.37, 0.47);
  float borde = length(vec2(e.x * (1.0 + 0.1 * e.y), e.y));
  float mascara = 1.0 - smoothstep(0.8, 1.0, borde);

  float revelado = smoothstep(uRevelado - 0.012, uRevelado + 0.012, p.y);
  float barrido = exp(-pow((p.y - uEscaneo) / 0.013, 2.0));
  float estela = p.y > uEscaneo ? exp(-(p.y - uEscaneo) / 0.07) : 0.0;

  vec3 cian = vec3(0.0, 0.949, 1.0);
  vec3 violeta = vec3(0.655, 0.545, 1.0);
  vec3 c0 = mix(violeta, cian, smoothstep(-0.4, 0.32, p.y));
  c0 = mix(c0, vec3(0.86, 1.0, 1.0), clamp(barrido * 0.85 + presion * 0.5 + estela * 0.25, 0.0, 1.0));

  float a = cresta * mascara * revelado * (0.5 + 1.1 * barrido + 0.55 * estela + 0.7 * presion);
  // La propia línea del lector, tenue, a todo el ancho del dedo.
  a += barrido * 0.3 * (1.0 - smoothstep(0.85, 1.12, borde));
  a = clamp(a, 0.0, 1.0);
  color = vec4(c0 * a, a);
}
`

export type Huella = {
  /** Transforma la huella actual hacia la del visitante. */
  fijar: (p: ParametrosHuella) => void
  activar: (si: boolean) => void
  destruir: () => void
}

const A = (p: ParametrosHuella): [number, number, number, number] => [p.cx, p.cy, p.aniso, p.fase]
const B = (p: ParametrosHuella): [number, number, number, number] => [p.espiral, p.rx, p.ry, p.lazo]

const DURACION_ESCANEO = 2.3
const PERIODO_ESCANEO = 6.5
const ARRIBA = 0.52
const ABAJO = -0.52

export function montarHuella(lienzo: HTMLCanvasElement, opciones: { reducido: boolean }): Huella | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = lienzo.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
  } catch {
    gl = null
  }
  if (!gl) return null
  let prog: WebGLProgram
  try {
    prog = programa(gl, VERTEX_COMPLETO, FRAGMENT)
  } catch (err) {
    console.warn('[huella]', err)
    return null
  }
  trianguloCompleto(gl, prog)
  gl.useProgram(prog)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  const u = (n: string) => gl!.getUniformLocation(prog, n)
  const U = {
    res: u('uRes'),
    a0: u('uA0'),
    b0: u('uB0'),
    a1: u('uA1'),
    b1: u('uB1'),
    mezcla: u('uMezcla'),
    cursor: u('uCursor'),
    escaneo: u('uEscaneo'),
    revelado: u('uRevelado'),
  }

  let desde = HUELLA_NEUTRA
  let hacia = HUELLA_NEUTRA
  let mezcla = 1
  let inicioMezcla = 0
  const cursor = { x: 0, y: 0, objetivo: 0, intensidad: 0 }
  const t0 = performance.now()
  const ahora = () => (performance.now() - t0) / 1000

  const ajustar = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(lienzo.clientWidth * dpr))
    const h = Math.max(1, Math.round(lienzo.clientHeight * dpr))
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w
      lienzo.height = h
    }
  }

  const dibujar = (t: number, revelado: number, escaneo: number) => {
    ajustar()
    gl!.viewport(0, 0, lienzo.width, lienzo.height)
    gl!.clearColor(0, 0, 0, 0)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    gl!.uniform2f(U.res, lienzo.width, lienzo.height)
    gl!.uniform4f(U.a0, ...A(desde))
    gl!.uniform4f(U.b0, ...B(desde))
    gl!.uniform4f(U.a1, ...A(hacia))
    gl!.uniform4f(U.b1, ...B(hacia))
    mezcla = Math.min(1, (t - inicioMezcla) / 1.3)
    gl!.uniform1f(U.mezcla, mezcla)
    gl!.uniform3f(U.cursor, cursor.x, cursor.y, cursor.intensidad)
    gl!.uniform1f(U.escaneo, escaneo)
    gl!.uniform1f(U.revelado, revelado)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  // Primera pasada: revela. Las siguientes solo repasan.
  let inicioEscaneo = -1
  let raf = 0
  let anterior = performance.now()

  const paso = () => {
    const t = ahora()
    const dt = Math.min(0.05, (performance.now() - anterior) / 1000)
    anterior = performance.now()
    cursor.intensidad += (cursor.objetivo - cursor.intensidad) * (1 - Math.exp(-dt * 6))

    let revelado = ARRIBA + 0.1
    let escaneo = -5
    if (inicioEscaneo >= 0) {
      const desdeInicio = t - inicioEscaneo
      const primera = Math.min(1, desdeInicio / DURACION_ESCANEO)
      revelado = ARRIBA + (ABAJO - 0.1 - ARRIBA) * primera
      const fase = (desdeInicio % PERIODO_ESCANEO) / DURACION_ESCANEO
      if (fase <= 1) escaneo = ARRIBA + (ABAJO - ARRIBA) * (fase * fase * (3 - 2 * fase))
    }
    dibujar(t, revelado, escaneo)
    raf = requestAnimationFrame(paso)
  }

  const alMover = (e: PointerEvent) => {
    const r = lienzo.getBoundingClientRect()
    cursor.x = (e.clientX - r.left - r.width / 2) / r.height
    cursor.y = -(e.clientY - r.top - r.height / 2) / r.height
    cursor.objetivo = e.pointerType === 'touch' ? 0 : 1
  }
  const alSalir = () => {
    cursor.objetivo = 0
  }

  if (opciones.reducido) {
    // Sin movimiento: la huella ya revelada y quieta. `fijar` la redibuja.
    dibujar(0, ABAJO - 0.2, -5)
  } else {
    lienzo.addEventListener('pointermove', alMover, { passive: true })
    lienzo.addEventListener('pointerleave', alSalir)
  }

  const ro = new ResizeObserver(() => {
    if (opciones.reducido) dibujar(0, ABAJO - 0.2, -5)
  })
  ro.observe(lienzo)

  return {
    fijar(p) {
      desde = hacia
      hacia = p
      inicioMezcla = ahora()
      if (opciones.reducido) {
        inicioMezcla = -10
        dibujar(0, ABAJO - 0.2, -5)
      }
    },
    activar(si) {
      if (opciones.reducido) return
      if (si && !raf) {
        if (inicioEscaneo < 0) inicioEscaneo = ahora()
        anterior = performance.now()
        raf = requestAnimationFrame(paso)
      } else if (!si && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    },
    destruir() {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      lienzo.removeEventListener('pointermove', alMover)
      lienzo.removeEventListener('pointerleave', alSalir)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
