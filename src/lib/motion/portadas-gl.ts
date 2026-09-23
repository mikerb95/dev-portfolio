// Renderizador de las portadas generativas (ver portadas.ts). Un solo contexto
// WebGL2 para todo el índice de proyectos:
//   · En la ventana flotante del índice dibuja en vivo la portada del proyecto
//     apuntado, y al cambiar de proyecto NO corta: el campo de alturas se
//     interpola del mapa de uno al del otro, así que las curvas de nivel se
//     deforman de un terreno al siguiente.
//   · Para las miniaturas (táctil, sin ventana flotante) pinta cada portada
//     una vez y la copia a un <canvas> 2D. Un contexto por miniatura serían
//     trece contextos WebGL, y los navegadores empiezan a tirar los viejos
//     pasada la decena.
//
// Mismo ruido y mismas curvas que el terreno del hero, pero visto en planta,
// como un mapa: el vocabulario visual del sitio es uno solo.
//
// Módulo solo de navegador.

import type { Paleta, RGB, Semilla } from './portadas'
import { LINEA, programa, RUIDO, trianguloCompleto, VERTEX_COMPLETO } from './glsl'

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uTiempo;
uniform vec3 uSemA;
uniform vec3 uSemB;
uniform float uMezcla;
uniform vec3 uLineaA;
uniform vec3 uLineaB;
uniform vec3 uHaloA;
uniform vec3 uHaloB;
out vec4 color;

${RUIDO}
float campo(vec2 uv, vec3 s) {
  vec2 p = uv * s.z + s.xy;
  // Deriva lenta: la portada respira mientras se mira, sin que el mapa cambie
  // de forma lo bastante como para dejar de ser "el de este proyecto".
  p += vec2(uTiempo * 0.035, uTiempo * 0.02);
  vec2 w = vec2(ruido(p * 0.6 + vec2(3.1, 7.7)), ruido(p * 0.6 + vec2(8.3, 1.9)));
  return fbm(p + w * 1.25);
}
${LINEA}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  // Suavizado de la mezcla (smoothstep) dentro del shader: así el ritmo de la
  // transformación es el mismo la dispare quien la dispare.
  float t = uMezcla * uMezcla * (3.0 - 2.0 * uMezcla);
  float h = mix(campo(uv, uSemA), campo(uv, uSemB), t);
  vec3 cl = mix(uLineaA, uLineaB, t);
  vec3 ch = mix(uHaloA, uHaloB, t);

  float v = h * 20.0;
  // Donde la pendiente apiña las curvas por debajo de un píxel, se apagan en
  // vez de romperse en puntos sueltos (el mismo criterio del hero).
  float menor = linea(v, 1.0) * (1.0 - smoothstep(0.3, 0.7, fwidth(v)));
  float mayor = linea(v / 5.0, 1.8) * (1.0 - smoothstep(0.3, 0.7, fwidth(v / 5.0)));

  // Tinte hipsométrico: bandas de altura con un escalón de luminancia muy
  // leve, como en un mapa impreso. Da volumen sin necesidad de sombreado.
  float banda = floor(v / 5.0);
  float tinte = 0.018 * mod(banda, 2.0) + 0.03 * smoothstep(-0.2, 0.6, h);

  // Retícula cartográfica tenue: la portada se lee como un plano medido, no
  // como un fondo decorativo.
  vec2 g = abs(fract(uv * 4.0) - 0.5);
  float reticula = (1.0 - smoothstep(0.0, fwidth(uv.x * 4.0) * 1.2, 0.5 - g.x))
                 + (1.0 - smoothstep(0.0, fwidth(uv.y * 4.0) * 1.2, 0.5 - g.y));

  vec3 fondo = vec3(0.047, 0.047, 0.063);
  float r = length(uv - vec2(0.25, 0.15));
  fondo += ch * 0.12 * exp(-r * r * 3.0);
  fondo += cl * tinte;

  vec3 c = fondo;
  c += cl * menor * 0.3;
  c += mix(cl, vec3(1.0), 0.25) * mayor * 0.78;
  c += vec3(1.0) * reticula * 0.025;

  // Viñeta: el mapa se apaga hacia los bordes y el ojo va al centro.
  vec2 q = gl_FragCoord.xy / uRes;
  c *= 0.55 + 0.45 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.25);
  color = vec4(c, 1.0);
}
`

export type Portada = { semilla: Semilla; paleta: Paleta }

export type Portadas = {
  /** Transforma la portada en vivo hacia la de `p`. */
  mostrar: (p: Portada) => void
  /** Arranca o detiene el bucle en vivo (la ventana flotante visible o no). */
  animar: (si: boolean) => void
  /** Pinta una portada fija en un canvas 2D (miniaturas). */
  pintarEn: (p: Portada, destino: HTMLCanvasElement) => void
  destruir: () => void
}

const norm = (c: RGB): [number, number, number] => [c[0] / 255, c[1] / 255, c[2] / 255]

export function montarPortadas(lienzo: HTMLCanvasElement): Portadas | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = lienzo.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true })
  } catch {
    gl = null
  }
  if (!gl) return null

  let prog: WebGLProgram
  try {
    prog = programa(gl, VERTEX_COMPLETO, FRAGMENT)
  } catch (err) {
    console.warn('[portadas]', err)
    return null
  }
  trianguloCompleto(gl, prog)
  gl.useProgram(prog)

  const U = Object.fromEntries(
    ['uRes', 'uTiempo', 'uSemA', 'uSemB', 'uMezcla', 'uLineaA', 'uLineaB', 'uHaloA', 'uHaloB'].map((n) => [
      n,
      gl!.getUniformLocation(prog, n),
    ]),
  ) as Record<string, WebGLUniformLocation | null>

  let desde: Portada | null = null
  let hacia: Portada | null = null
  let mezcla = 1
  let inicioMezcla = 0
  const DURACION = 0.9
  const t0 = performance.now()

  const ajustar = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(lienzo.clientWidth * dpr))
    const h = Math.max(1, Math.round(lienzo.clientHeight * dpr))
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w
      lienzo.height = h
    }
  }

  const fijar = (a: Portada, b: Portada, m: number, tiempo: number) => {
    gl!.viewport(0, 0, lienzo.width, lienzo.height)
    gl!.uniform2f(U.uRes, lienzo.width, lienzo.height)
    gl!.uniform1f(U.uTiempo, tiempo)
    gl!.uniform3f(U.uSemA, a.semilla.x, a.semilla.y, a.semilla.escala)
    gl!.uniform3f(U.uSemB, b.semilla.x, b.semilla.y, b.semilla.escala)
    gl!.uniform1f(U.uMezcla, m)
    gl!.uniform3fv(U.uLineaA, norm(a.paleta.linea))
    gl!.uniform3fv(U.uLineaB, norm(b.paleta.linea))
    gl!.uniform3fv(U.uHaloA, norm(a.paleta.halo))
    gl!.uniform3fv(U.uHaloB, norm(b.paleta.halo))
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  let raf = 0
  let vivo = false
  const paso = () => {
    raf = 0
    if (!hacia) return
    const t = (performance.now() - t0) / 1000
    mezcla = Math.min(1, (t - inicioMezcla) / DURACION)
    ajustar()
    fijar(desde ?? hacia, hacia, mezcla, t)
    if (vivo) raf = requestAnimationFrame(paso)
  }

  return {
    mostrar(p) {
      if (hacia && hacia.semilla.id === p.semilla.id) return
      const t = (performance.now() - t0) / 1000
      // Si la transformación anterior no terminó, se parte de donde iba: el
      // mapa intermedio se aproxima con el destino anterior, que es lo que el
      // ojo estaba mirando, en vez de saltar al origen de la mezcla vieja.
      desde = hacia && mezcla < 0.5 ? desde : hacia
      hacia = p
      inicioMezcla = desde ? t : t - DURACION
      if (!raf) raf = requestAnimationFrame(paso)
    },
    animar(si) {
      vivo = si
      if (si && !raf) raf = requestAnimationFrame(paso)
    },
    pintarEn(p, destino) {
      const w = destino.width
      const h = destino.height
      if (lienzo.width !== w || lienzo.height !== h) {
        lienzo.width = w
        lienzo.height = h
      }
      fijar(p, p, 1, 3)
      destino.getContext('2d')?.drawImage(lienzo, 0, 0, w, h)
    },
    destruir() {
      if (raf) cancelAnimationFrame(raf)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
