// Fragmentos GLSL compartidos por los lienzos de la portada (terreno del hero,
// portadas de proyectos, huella del lab). Un solo ruido para todos: las tres
// piezas son el mismo lenguaje visual de isolíneas y tienen que tener la misma
// textura de relieve, no tres parecidas.

/**
 * Ruido de gradiente 2D con hash entero (PCG 2D) e interpolación quíntica.
 *   · Hash entero y no de senos: con senos el ruido se degrada a coordenadas
 *     grandes, y el terreno del hero avanza sin parar en z.
 *   · Quíntica (continuidad C2): sin ella, las curvas de nivel hacen codos
 *     visibles en los bordes de cada celda.
 */
export const RUIDO = /* glsl */ `
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  return v;
}

vec2 gradiente(vec2 celda) {
  uvec2 h = pcg2d(uvec2(ivec2(celda) + ivec2(4096)));
  float a = float(h.x) * (6.2831853 / 4294967295.0);
  return vec2(cos(a), sin(a));
}

float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(gradiente(i), f);
  float b = dot(gradiente(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(gradiente(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(gradiente(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Cuatro octavas con rotación entre ellas: sin la rotación las octavas se
// alinean con la rejilla y el relieve deja ver direcciones preferentes.
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.55;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    s += a * ruido(p);
    p = r * p * 2.03;
    a *= 0.5;
  }
  return s;
}
`

/**
 * Curva de nivel antialiasada: 1 sobre la isolínea entera más cercana a `v`,
 * con un ancho de `grosor` píxeles medido por `fwidth`, así el trazo mide lo
 * mismo cerca que lejos.
 */
export const LINEA = /* glsl */ `
float linea(float v, float grosor) {
  float fw = max(fwidth(v), 1e-4);
  float d = 0.5 - abs(fract(v) - 0.5);
  return 1.0 - smoothstep(0.0, fw * grosor, d);
}
`

/** Compila y enlaza un programa; lanza con el log del driver si algo falla. */
export function programa(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const compilar = (tipo: number, fuente: string) => {
    const s = gl.createShader(tipo)!
    gl.shaderSource(s, fuente)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s)
      gl.deleteShader(s)
      throw new Error(`shader: ${log}`)
    }
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, compilar(gl.VERTEX_SHADER, vertex))
  gl.attachShader(p, compilar(gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`)
  return p
}

/** Triángulo que cubre todo el lienzo (sin la costura diagonal de dos). */
export function trianguloCompleto(gl: WebGL2RenderingContext, prog: WebGLProgram, atributo = 'aPos') {
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, atributo)
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
}

export const VERTEX_COMPLETO = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`
