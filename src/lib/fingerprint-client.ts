// Recolector de fingerprint de dispositivo — SOLO se ejecuta en el navegador
// (usa canvas/WebGL/audio/DOM). Nunca se importa desde código de servidor.
// Cada señal se etiqueta con su peso en bits de entropía: son valores de
// referencia tomados de estudios públicos de fingerprinting (EFF Panopticlick
// y AmIUnique), NO una medición poblacional en vivo — se muestra así en la UI.

// `value` es el valor COMPLETO (se usa para el hash de identidad); `display`
// es la versión recortada para pintar en la UI. `bits` es 0 cuando la señal no
// aportó (error/blocked/vacío): así la entropía refleja lo que de verdad se
// midió en ESTE dispositivo, no una constante fija.
export type FingerprintSignal = { key: string; label: string; value: string; display: string; bits: number }
export type FingerprintResult = { hash: string; signals: FingerprintSignal[]; entropyBits: number; libFpHash: string | null }

export type BehaviorSample = {
  avgKeyIntervalMs: number | null
  keySamples: number
  avgMouseSpeed: number | null
  mouseSamples: number
  tiltX: number | null
  tiltY: number | null
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function canvasSignal(): string {
  try {
    const c = document.createElement('canvas')
    c.width = 240
    c.height = 60
    const ctx = c.getContext('2d')
    if (!ctx) return 'no-canvas'
    ctx.textBaseline = 'top'
    ctx.font = '14px "Arial"'
    ctx.fillStyle = '#f60'
    ctx.fillRect(0, 0, 100, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('fingerprint 🔍 lab,1', 2, 15)
    ctx.strokeStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.beginPath()
    ctx.arc(50, 40, 15, 0, Math.PI * 2)
    ctx.stroke()
    return c.toDataURL()
  } catch {
    return 'error'
  }
}

function webglSignal(): string {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return 'no-webgl'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return 'blocked'
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
    return `${vendor}~${renderer}`
  } catch {
    return 'error'
  }
}

async function audioSignal(): Promise<string> {
  try {
    const AudioCtx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
    const ctx = new AudioCtx(1, 5000, 44100)
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = 10000
    const compressor = ctx.createDynamicsCompressor()
    osc.connect(compressor)
    compressor.connect(ctx.destination)
    osc.start(0)
    const buffer = await ctx.startRendering()
    const data = buffer.getChannelData(0)
    let sum = 0
    for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i] ?? 0)
    return sum.toFixed(6)
  } catch {
    return 'error'
  }
}

const FONT_CANDIDATES = [
  'Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 'Comic Sans MS',
  'Trebuchet MS', 'Impact', 'Segoe UI', 'Tahoma', 'Calibri', 'Cambria', 'Consolas',
  'Helvetica Neue', 'Noto Sans', 'Roboto', 'Ubuntu', 'DejaVu Sans',
]

function fontsSignal(): string {
  try {
    const baseFonts = ['monospace', 'sans-serif', 'serif']
    const testString = 'mmmmmmmmmmlli'
    const testSize = '72px'
    const span = document.createElement('span')
    span.style.position = 'absolute'
    span.style.left = '-9999px'
    span.style.fontSize = testSize
    span.textContent = testString
    document.body.appendChild(span)

    const baseSizes: Record<string, { w: number; h: number }> = {}
    for (const base of baseFonts) {
      span.style.fontFamily = base
      baseSizes[base] = { w: span.offsetWidth, h: span.offsetHeight }
    }

    const available: string[] = []
    for (const font of FONT_CANDIDATES) {
      const detected = baseFonts.some((base) => {
        span.style.fontFamily = `"${font}", ${base}`
        const size = { w: span.offsetWidth, h: span.offsetHeight }
        return size.w !== baseSizes[base]!.w || size.h !== baseSizes[base]!.h
      })
      if (detected) available.push(font)
    }
    document.body.removeChild(span)
    return available.join(',')
  } catch {
    return 'error'
  }
}

// Valores que significan "esta señal no aportó nada" → 0 bits de entropía.
const ABSENT = new Set(['', '?', 'error', 'blocked', 'no-webgl', 'no-canvas', 'no-canvas-ctx'])
function bitsFor(value: string, weight: number): number {
  return ABSENT.has(value.trim()) ? 0 : weight
}

/**
 * FingerprintJS (open source) como segunda opinión: su `visitorId` se compara
 * contra nuestro hash propio. Si la librería no carga, no rompe la demo.
 */
async function libFingerprint(): Promise<string | null> {
  try {
    const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default
    const agent = await FingerprintJS.load()
    const { visitorId } = await agent.get()
    return visitorId
  } catch {
    return null
  }
}

/** Recolecta las señales del dispositivo y calcula hash + entropía estimada. */
export async function collectFingerprint(): Promise<FingerprintResult> {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const canvas = canvasSignal()
  const webgl = webglSignal()
  const audio = await audioSignal()
  const fonts = fontsSignal()
  const screenSig = `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio}`
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const langs = nav.languages?.join(',') ?? nav.language

  // value = valor completo (entra al hash); display = recorte para la UI.
  const raw: { key: string; label: string; value: string; display: string; weight: number }[] = [
    { key: 'canvas', label: 'Render de canvas (2D)', value: canvas, display: canvas.slice(0, 40) + '…', weight: 6 },
    { key: 'webgl', label: 'GPU (WebGL vendor/renderer)', value: webgl, display: webgl, weight: 5 },
    { key: 'audio', label: 'Huella de AudioContext', value: audio, display: audio, weight: 4 },
    { key: 'fonts', label: `Fuentes instaladas (${fonts ? fonts.split(',').length : 0} detectadas)`, value: fonts, display: fonts.slice(0, 80) || '(ninguna)', weight: 5 },
    { key: 'screen', label: 'Resolución y densidad de pantalla', value: screenSig, display: screenSig, weight: 4 },
    { key: 'timezone', label: 'Zona horaria', value: tz, display: tz, weight: 3 },
    { key: 'hwConcurrency', label: 'Núcleos de CPU reportados', value: String(nav.hardwareConcurrency ?? '?'), display: String(nav.hardwareConcurrency ?? '?'), weight: 2 },
    { key: 'deviceMemory', label: 'Memoria reportada (GB)', value: String(nav.deviceMemory ?? '?'), display: String(nav.deviceMemory ?? '?'), weight: 1 },
    { key: 'platform', label: 'Plataforma', value: nav.platform ?? '?', display: nav.platform ?? '?', weight: 2 },
    { key: 'languages', label: 'Idiomas', value: langs, display: langs, weight: 2 },
    { key: 'touch', label: 'Puntos de toque máximos', value: String(nav.maxTouchPoints ?? 0), display: String(nav.maxTouchPoints ?? 0), weight: 1 },
    { key: 'ua', label: 'User-Agent', value: nav.userAgent, display: nav.userAgent, weight: 3 },
  ]

  const signals: FingerprintSignal[] = raw.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    display: s.display,
    bits: bitsFor(s.value, s.weight),
  }))

  const combined = signals.map((s) => `${s.key}:${s.value}`).join('||')
  const [hash, libFpHash] = await Promise.all([sha256Hex(combined), libFingerprint()])
  const entropyBits = signals.reduce((acc, s) => acc + s.bits, 0)

  return { hash, signals, entropyBits, libFpHash }
}

/** Instala listeners de comportamiento y devuelve un snapshot bajo demanda. */
export function startBehaviorTracking(): () => BehaviorSample {
  const keyIntervals: number[] = []
  let lastKeyAt: number | null = null
  const mouseSpeeds: number[] = []
  let lastMouse: { x: number; y: number; t: number } | null = null
  let tiltX: number | null = null
  let tiltY: number | null = null

  const onKeydown = () => {
    const now = performance.now()
    if (lastKeyAt !== null) keyIntervals.push(now - lastKeyAt)
    lastKeyAt = now
    if (keyIntervals.length > 50) keyIntervals.shift()
  }

  const onMouseMove = (e: MouseEvent) => {
    const now = performance.now()
    if (lastMouse) {
      const dt = now - lastMouse.t
      if (dt > 0) {
        const dist = Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y)
        mouseSpeeds.push(dist / dt)
        if (mouseSpeeds.length > 50) mouseSpeeds.shift()
      }
    }
    lastMouse = { x: e.clientX, y: e.clientY, t: now }
  }

  const onOrientation = (e: DeviceOrientationEvent) => {
    tiltX = e.beta ?? null
    tiltY = e.gamma ?? null
  }

  document.addEventListener('keydown', onKeydown)
  document.addEventListener('mousemove', onMouseMove)

  // iOS 13+ exige permiso explícito para `deviceorientation`, y debe pedirse
  // desde un gesto del usuario. Esta función se llama en el click de consentir,
  // así que el gesto sigue activo. Sin esto, en iPhone el giroscopio no dispara.
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }
  if (typeof DOE?.requestPermission === 'function') {
    DOE.requestPermission()
      .then((state) => { if (state === 'granted') window.addEventListener('deviceorientation', onOrientation) })
      .catch(() => {})
  } else {
    window.addEventListener('deviceorientation', onOrientation)
  }

  return () => {
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
    return {
      avgKeyIntervalMs: avg(keyIntervals),
      keySamples: keyIntervals.length,
      avgMouseSpeed: avg(mouseSpeeds),
      mouseSamples: mouseSpeeds.length,
      tiltX,
      tiltY,
    }
  }
}
