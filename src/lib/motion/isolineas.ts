// Isolíneas: el terreno del hero de la portada.
//
// Una malla de 200×200 vértices desplazada en el vertex shader por un campo de
// ruido que avanza hacia la cámara, y sus curvas de nivel dibujadas POR PÍXEL
// en el fragment shader. Las dos mitades son deliberadas:
//   · La malla da relieve de verdad: una colina tapa las curvas que tiene
//     detrás (prueba de profundidad), cosa que un mapa plano en perspectiva no
//     puede hacer y que es lo que lo hace leer como terreno y no como textura.
//   · Las curvas no salen de la altura interpolada entre vértices (quedarían
//     quebradas en cada triángulo), sino de evaluar el mismo campo en cada
//     píxel, con el grosor medido por `fwidth`: un píxel de ancho a cualquier
//     distancia y sin escalones.
//
// El cursor levanta un pico (el terreno forma anillos a su alrededor), un clic
// emite un pulso que recorre el suelo como una onda, y cada pocos segundos un
// barrido cruza el terreno de cerca a lejos: el mismo vocabulario de sondeo y
// escaneo del resto del sitio.
//
// Sin dependencias: WebGL2 directo. Módulo solo de navegador.

import { mezclar, multiplicar, perspectiva, rayoAlSuelo, vista, type Camara } from './camara'
import { LINEA, programa as enlazar, RUIDO } from './glsl'

// ── Shaders ────────────────────────────────────────────────────────────────

// Campo de alturas compartido por los dos shaders. Tiene que ser el MISMO
// código en ambos: el vertex shader decide dónde está la superficie y el
// fragment decide dónde caen las curvas, y si no coinciden las curvas flotan
// separadas de las colinas que las tapan.
const CAMPO = /* glsl */ `
uniform float uAvance;
uniform float uAmplitud;
uniform vec3 uPico;       // x, z, intensidad (0..1)
uniform vec4 uPulsos[4];  // x, z, edad en segundos, intensidad

${RUIDO}

float terreno(vec2 xz) {
  vec2 p = vec2(xz.x, xz.y + uAvance) * 0.17;
  // Deformación de dominio con una octava barata: convierte las colinas
  // redondas del fbm en crestas y valles alargados, que es lo que hace que las
  // curvas de nivel parezcan de un mapa y no de un ruido.
  vec2 w = vec2(ruido(p * 0.55 + vec2(3.1, 7.7)), ruido(p * 0.55 + vec2(8.3, 1.9)));
  float h = fbm(p + w * 1.1) * uAmplitud;

  vec2 d = xz - uPico.xy;
  h += uPico.z * 1.05 * exp(-dot(d, d) / 1.4);

  for (int i = 0; i < 4; i++) {
    vec4 P = uPulsos[i];
    if (P.w <= 0.0) continue;
    float r = length(xz - P.xy);
    float frente = P.z * 3.4;
    float onda = exp(-pow((r - frente) / 0.6, 2.0));
    h += P.w * 0.6 * onda * exp(-P.z * 0.75);
  }
  return h;
}
`

const VERTEX = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 aUV;
uniform mat4 uVistaProy;
uniform vec3 uCamPos;
uniform vec2 uTam;     // ancho, fondo
uniform float uCerca;
out vec2 vXZ;
out float vDist;
${CAMPO}
void main() {
  float x = (aUV.x - 0.5) * uTam.x;
  // Más densa cerca de la cámara: ahí cada celda ocupa decenas de píxeles y en
  // la silueta de las colinas se notaría la faceta.
  float z = uCerca + uTam.y * pow(aUV.y, 1.8);
  vec3 mundo = vec3(x, terreno(vec2(x, z)), z);
  vXZ = vec2(x, z);
  vDist = distance(mundo, uCamPos);
  gl_Position = uVistaProy * vec4(mundo, 1.0);
}
`

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vXZ;
in float vDist;
uniform float uDensidad;
uniform float uBarrido;   // posición z del barrido
uniform float uLejos;     // distancia a la que el terreno termina de fundirse
uniform float uAncho;     // semiancho útil de la malla
uniform float uBrillo;
out vec4 color;
${CAMPO}

${LINEA}

void main() {
  float h = terreno(vXZ);
  float v = h * uDensidad;
  float fw = fwidth(v);

  float menor = linea(v, 1.0);
  float mayor = linea(v / 5.0, 1.7);

  // Donde las curvas se apiñan más de lo que un píxel puede separar, se
  // desvanecen en vez de convertirse en moiré. Es lo que mantiene limpio el
  // horizonte: sin esto, la franja del fondo es un zumbido de aliasing.
  float separables = 1.0 - smoothstep(0.1, 0.32, fw);

  float cerca = exp(-vDist * 0.07);
  vec3 cian = vec3(0.0, 0.949, 1.0);
  vec3 violeta = vec3(0.655, 0.545, 1.0);
  vec3 c = mix(violeta, cian, smoothstep(0.05, 0.55, cerca));

  vec2 dp = vXZ - uPico.xy;
  float brilloPico = uPico.z * exp(-dot(dp, dp) / 2.0);

  float brilloPulso = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 P = uPulsos[i];
    if (P.w <= 0.0) continue;
    float r = length(vXZ - P.xy);
    brilloPulso += P.w * exp(-pow((r - P.z * 3.4) / 0.5, 2.0)) * exp(-P.z * 0.75);
  }

  float barrido = exp(-pow((vXZ.y - uBarrido) / 0.9, 2.0));

  float a = (menor * 0.2 + mayor * 0.42) * separables;
  a *= mix(0.35, 1.0, cerca);
  a *= 1.0 - smoothstep(uLejos * 0.3, uLejos * 0.78, vDist);
  a *= 1.0 - smoothstep(uAncho * 0.6, uAncho, abs(vXZ.x));
  a *= 1.0 + barrido * 1.6 + brilloPico * 1.5 + brilloPulso * 2.2;

  c = mix(c, vec3(0.85, 1.0, 1.0), clamp(barrido * 0.5 + brilloPico * 0.45 + brilloPulso * 0.6, 0.0, 1.0));
  // Lima en la cresta del pulso: el sondeo que vuelve en verde.
  c = mix(c, vec3(0.79, 1.0, 0.36), clamp(brilloPulso * 0.55, 0.0, 0.7));

  a = clamp(a * uBrillo, 0.0, 1.0);
  color = vec4(c * a, a);
}
`

// ── Parámetros de escena ───────────────────────────────────────────────────

const CELDAS = 200
const TAM: [number, number] = [64, 42]
const CERCA = 0.6
const LEJOS = 40
const FOV = (44 * Math.PI) / 180
const DENSIDAD = 15
const VELOCIDAD = 0.55 // unidades de mundo por segundo
const PERIODO_BARRIDO = 8.5
const MAX_PULSOS = 4
const ALTURA_PICO = 1.05

// Cámara en reposo y cámara "aplanada" (al final del scroll del hero): baja
// hasta rozar el suelo y levanta la mirada al horizonte, así el terreno se
// comprime en una franja fina que continúa en la cinta de señales.
const CAMARA_REPOSO = { y: 2.5, objetivo: [0, 0.1, 10] as [number, number, number] }
const CAMARA_PLANA = { y: 0.55, objetivo: [0, 0.45, 16] as [number, number, number] }

export type Isolineas = {
  /** 0 = terreno completo, 1 = aplanado en una línea. Lo mueve el scroll. */
  aplanar: (t: number) => void
  /** Emite un pulso desde una coordenada de pantalla (px del cliente). */
  pulso: (clienteX: number, clienteY: number, intensidad?: number) => void
  destruir: () => void
}

type Opciones = {
  /** Contenedor que recibe el cursor (normalmente el hero entero). */
  zona: HTMLElement
  /** Movimiento reducido: un solo fotograma quieto, sin bucle ni cursor. */
  reducido?: boolean
}

function malla(n: number): { uv: Float32Array; indices: Uint16Array } {
  const lado = n + 1
  const uv = new Float32Array(lado * lado * 2)
  for (let j = 0; j < lado; j++) {
    for (let i = 0; i < lado; i++) {
      const k = (j * lado + i) * 2
      uv[k] = i / n
      uv[k + 1] = j / n
    }
  }
  const indices = new Uint16Array(n * n * 6)
  let p = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * lado + i
      const b = a + 1
      const c = a + lado
      const d = c + 1
      indices[p++] = a
      indices[p++] = c
      indices[p++] = b
      indices[p++] = b
      indices[p++] = c
      indices[p++] = d
    }
  }
  return { uv, indices }
}

/**
 * Monta el terreno en el lienzo. Devuelve null si el navegador no tiene
 * WebGL2 o si algo falla al compilar: el hero conserva su halo de CSS y la
 * página sigue igual. Una decoración que puede romper la portada no se monta.
 */
export function montarIsolineas(lienzo: HTMLCanvasElement, opciones: Opciones): Isolineas | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = lienzo.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: true,
      powerPreference: 'default',
    })
  } catch {
    gl = null
  }
  if (!gl) return null

  let programa: WebGLProgram
  try {
    programa = enlazar(gl, VERTEX, FRAGMENT)
  } catch (err) {
    console.warn('[isolineas]', err)
    return null
  }

  const { uv, indices } = malla(CELDAS)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const bufUV = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, bufUV)
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW)
  const locUV = gl.getAttribLocation(programa, 'aUV')
  gl.enableVertexAttribArray(locUV)
  gl.vertexAttribPointer(locUV, 2, gl.FLOAT, false, 0, 0)
  const bufIdx = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

  const u = (n: string) => gl!.getUniformLocation(programa, n)
  const U = {
    vistaProy: u('uVistaProy'),
    camPos: u('uCamPos'),
    tam: u('uTam'),
    cerca: u('uCerca'),
    avance: u('uAvance'),
    amplitud: u('uAmplitud'),
    pico: u('uPico'),
    pulsos: u('uPulsos'),
    densidad: u('uDensidad'),
    barrido: u('uBarrido'),
    lejos: u('uLejos'),
    ancho: u('uAncho'),
    brillo: u('uBrillo'),
  }

  gl.useProgram(programa)
  gl.uniform2f(U.tam, TAM[0], TAM[1])
  gl.uniform1f(U.cerca, CERCA)
  gl.uniform1f(U.densidad, DENSIDAD)
  gl.uniform1f(U.lejos, LEJOS)
  gl.uniform1f(U.ancho, TAM[0] / 2)
  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LESS)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  // ── Estado ──
  const reducido = !!opciones.reducido
  let aplanado = 0
  let camara: Camara = { pos: [0, CAMARA_REPOSO.y, 0], objetivo: CAMARA_REPOSO.objetivo, fov: FOV, aspecto: 1 }

  // Cursor en NDC (objetivo y suavizado) y el pico que levanta.
  const cursor = { x: 0, y: -0.4, dentro: false }
  const pico = { x: 0, z: 6, intensidad: 0 }
  const pulsos: { x: number; z: number; t0: number; intensidad: number }[] = []

  // Escala de resolución adaptativa: arranca en el DPR del dispositivo (con
  // techo de 2) y baja si los fotogramas se alargan. Un terreno a 30 fps en
  // una laptop modesta se ve peor que uno a 60 con algo menos de nitidez.
  let escala = Math.min(window.devicePixelRatio || 1, 2)
  const muestras: number[] = []

  const ajustarTam = () => {
    const w = Math.max(1, Math.round(lienzo.clientWidth * escala))
    const h = Math.max(1, Math.round(lienzo.clientHeight * escala))
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w
      lienzo.height = h
    }
    camara = { ...camara, aspecto: lienzo.clientWidth / Math.max(1, lienzo.clientHeight) }
  }

  const actualizarCamara = () => {
    const t = aplanado
    const e = t * t * (3 - 2 * t)
    camara = {
      ...camara,
      pos: [0, mezclar(CAMARA_REPOSO.y, CAMARA_PLANA.y, e), 0],
      objetivo: [
        0,
        mezclar(CAMARA_REPOSO.objetivo[1], CAMARA_PLANA.objetivo[1], e),
        mezclar(CAMARA_REPOSO.objetivo[2], CAMARA_PLANA.objetivo[2], e),
      ],
    }
  }

  const aNDC = (clienteX: number, clienteY: number) => {
    const r = lienzo.getBoundingClientRect()
    return {
      x: ((clienteX - r.left) / Math.max(1, r.width)) * 2 - 1,
      y: -(((clienteY - r.top) / Math.max(1, r.height)) * 2 - 1),
    }
  }

  const inicio = performance.now()
  const segundos = () => (performance.now() - inicio) / 1000

  const emitir = (ndcX: number, ndcY: number, intensidad: number) => {
    const p = rayoAlSuelo(camara, ndcX, ndcY)
    if (!p || p.distancia > LEJOS * 0.8) return
    if (pulsos.length >= MAX_PULSOS) pulsos.shift()
    pulsos.push({ x: p.x, z: p.z, t0: segundos(), intensidad })
  }

  // Latido: un sondeo automático cada pocos segundos en un punto al azar de la
  // mitad baja, para que el terreno se vea vivo también sin cursor (móvil).
  let proximoLatido = 2.2

  const pulsosUniform = new Float32Array(MAX_PULSOS * 4)

  const dibujar = (t: number) => {
    ajustarTam()
    gl!.viewport(0, 0, lienzo.width, lienzo.height)
    gl!.clearColor(0, 0, 0, 0)
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT)

    const proy = perspectiva(camara.fov, camara.aspecto, 0.1, 120)
    gl!.uniformMatrix4fv(U.vistaProy, false, multiplicar(proy, vista(camara)))
    gl!.uniform3f(U.camPos, camara.pos[0], camara.pos[1], camara.pos[2])
    gl!.uniform1f(U.avance, t * VELOCIDAD)
    gl!.uniform1f(U.amplitud, mezclar(1.15, 0.12, aplanado))
    gl!.uniform3f(U.pico, pico.x, pico.z, pico.intensidad * (1 - aplanado))

    pulsosUniform.fill(0)
    pulsos.forEach((p, i) => {
      pulsosUniform[i * 4] = p.x
      pulsosUniform[i * 4 + 1] = p.z
      pulsosUniform[i * 4 + 2] = t - p.t0
      pulsosUniform[i * 4 + 3] = p.intensidad
    })
    gl!.uniform4fv(U.pulsos, pulsosUniform)

    const fase = (t % PERIODO_BARRIDO) / PERIODO_BARRIDO
    // El barrido solo cruza en el primer 60% del ciclo; el resto del tiempo
    // está fuera del terreno (z negativa) y el suelo descansa.
    gl!.uniform1f(U.barrido, fase < 0.6 ? mezclar(2, LEJOS * 0.55, fase / 0.6) : -50)
    gl!.uniform1f(U.brillo, 1 - aplanado * 0.35)

    gl!.drawElements(gl!.TRIANGLES, indices.length, gl!.UNSIGNED_SHORT, 0)
  }

  // ── Bucle ──
  let raf = 0
  let visible = true
  let anterior = performance.now()

  const paso = (ahora: number) => {
    raf = 0
    const dt = Math.min(0.05, (ahora - anterior) / 1000)
    anterior = ahora
    const t = segundos()

    // Pico: sigue al cursor con inercia y se hunde al salir. La inercia es la
    // diferencia entre "el terreno reacciona" y "hay un sprite pegado al ratón".
    if (cursor.dentro) {
      // El rayo se corta a la altura de la cima y no en el suelo: la cima queda
      // una unidad por encima, y cortando en y = 0 aparecía muy por
      // encima del puntero en pantalla, como si el terreno huyera del cursor.
      const p = rayoAlSuelo(camara, cursor.x, cursor.y, ALTURA_PICO)
      if (p && p.distancia < LEJOS * 0.7) {
        const k = 1 - Math.exp(-dt * 7)
        pico.x += (p.x - pico.x) * k
        pico.z += (p.z - pico.z) * k
        pico.intensidad += (1 - pico.intensidad) * (1 - Math.exp(-dt * 3))
      } else {
        pico.intensidad *= Math.exp(-dt * 2.5)
      }
    } else {
      pico.intensidad *= Math.exp(-dt * 2)
    }

    while (pulsos.length && t - pulsos[0].t0 > 5.5) pulsos.shift()
    if (t > proximoLatido) {
      emitir(Math.random() * 1.4 - 0.7, -0.35 - Math.random() * 0.5, 0.55)
      proximoLatido = t + 4.5 + Math.random() * 3
    }

    dibujar(t)

    // Adaptación de resolución con una ventana de 40 fotogramas.
    muestras.push(dt)
    if (muestras.length >= 40) {
      const media = muestras.reduce((s, v) => s + v, 0) / muestras.length
      muestras.length = 0
      if (media > 0.024 && escala > 1) escala = Math.max(1, escala - 0.25)
    }

    if (visible && !document.hidden) raf = requestAnimationFrame(paso)
  }

  const arrancar = () => {
    if (raf || reducido) return
    anterior = performance.now()
    raf = requestAnimationFrame(paso)
  }
  const parar = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  // ── Entrada ──
  const zona = opciones.zona
  const alMover = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const n = aNDC(e.clientX, e.clientY)
    cursor.x = n.x
    cursor.y = n.y
    cursor.dentro = true
  }
  const alSalir = () => {
    cursor.dentro = false
  }
  const alPulsar = (e: PointerEvent) => {
    // Un clic en un enlace o botón es para navegar, no para sondear el suelo.
    if ((e.target as HTMLElement).closest('a, button, input, [role="button"]')) return
    const n = aNDC(e.clientX, e.clientY)
    emitir(n.x, n.y, 1)
  }

  const io = new IntersectionObserver(
    ([entrada]) => {
      visible = entrada.isIntersecting
      if (visible) arrancar()
      else parar()
    },
    { rootMargin: '80px' },
  )
  const alVisibilidad = () => (document.hidden ? parar() : visible && arrancar())

  if (reducido) {
    ajustarTam()
    actualizarCamara()
    // Un fotograma quieto, con el terreno ya desarrollado: la pieza sigue ahí,
    // solo que no se mueve.
    dibujar(14)
  } else {
    zona.addEventListener('pointermove', alMover, { passive: true })
    zona.addEventListener('pointerleave', alSalir)
    zona.addEventListener('pointerdown', alPulsar)
    document.addEventListener('visibilitychange', alVisibilidad)
    io.observe(lienzo)
    arrancar()
  }

  const ro = new ResizeObserver(() => {
    ajustarTam()
    if (reducido) dibujar(14)
  })
  ro.observe(lienzo)

  return {
    aplanar(t) {
      aplanado = Math.min(1, Math.max(0, t))
      actualizarCamara()
    },
    pulso(clienteX, clienteY, intensidad = 1) {
      const n = aNDC(clienteX, clienteY)
      emitir(n.x, n.y, intensidad)
    },
    destruir() {
      parar()
      io.disconnect()
      ro.disconnect()
      zona.removeEventListener('pointermove', alMover)
      zona.removeEventListener('pointerleave', alSalir)
      zona.removeEventListener('pointerdown', alPulsar)
      document.removeEventListener('visibilitychange', alVisibilidad)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
