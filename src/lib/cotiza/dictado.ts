// Dictado por voz en los campos de texto de Cotiza.
//
// Usa el reconocimiento de voz del propio navegador (Web Speech API) y no un
// servicio de transcripción propio: no cuesta nada, no agrega dependencias ni
// un proveedor de pago (regla del repo) y funciona en Chrome, Edge y Safari.
// En Firefox no existe y el botón simplemente no aparece.
//
// Ojo con la privacidad: en Chrome y Edge el audio lo transcriben los
// servidores de Google o Microsoft. Para notas de trabajo es aceptable; por eso
// el dictado solo se ofrece en Cotiza y el permiso del micrófono solo se abre
// en sus páginas (ver Permissions-Policy en src/middleware.ts).
//
// La parte pura (cómo se escribe lo dictado) está separada del navegador para
// poder probarla.

/**
 * Comandos de puntuación dichos en voz alta. El reconocimiento en español casi
 * no pone signos solo, así que se dicen. "punto" solo cuenta al final de una
 * frase dictada: en medio ("punto de venta") es una palabra normal.
 */
export function aplicarComandos(texto: string): string {
  let t = ` ${texto.trim()} `
  t = t.replace(/\s+(nuevo párrafo|punto y aparte)\s+/gi, '.\n\n')
  t = t.replace(/\s+(nueva línea|nueva linea)\s+/gi, '\n')
  t = t.replace(/\s+coma\s+/gi, ', ')
  t = t.replace(/\s+dos puntos\s+/gi, ': ')
  t = t.replace(/\s+signo de pregunta\s*$/i, '?')
  t = t.replace(/\s+(punto final|punto seguido|punto)\s*$/i, '.')
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim()
}

/** Primera letra en mayúscula si lo anterior termina una frase (o no hay nada antes). */
function capitalizar(texto: string, antes: string): string {
  // El salto de línea se mira antes de recortar: trimEnd() también lo borra.
  const previo = antes.replace(/[ \t]+$/, '')
  if (previo.trim() === '' || /[.!?¡¿\n]$/.test(previo)) return texto.charAt(0).toLocaleUpperCase('es-CO') + texto.slice(1)
  return texto
}

export type Insercion = { valor: string; cursor: number }

/**
 * Inserta lo dictado en la posición del cursor (o reemplaza la selección),
 * cuidando los espacios con lo que hay alrededor y la mayúscula inicial.
 */
export function insertarDictado(valor: string, inicio: number, fin: number, dictado: string): Insercion {
  const limpio = aplicarComandos(dictado)
  if (!limpio) return { valor, cursor: fin }
  const antes = valor.slice(0, inicio)
  const despues = valor.slice(fin)
  let pieza = capitalizar(limpio, antes)
  // Un espacio antes si lo anterior es una palabra y lo nuevo no empieza con signo.
  if (antes && !/[\s(¿¡]$/.test(antes) && !/^[.,:;?!\n]/.test(pieza)) pieza = ` ${pieza}`
  // Un espacio después si lo que sigue es una palabra.
  if (despues && /^[\p{L}\p{N}]/u.test(despues) && !/\s$/.test(pieza)) pieza = `${pieza} `
  return { valor: antes + pieza + despues, cursor: antes.length + pieza.length }
}

// ── Navegador ───────────────────────────────────────────────────────────────

type Reconocimiento = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

type ConstructorReconocimiento = new () => Reconocimiento

function constructor(): ConstructorReconocimiento | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocimiento; webkitSpeechRecognition?: ConstructorReconocimiento }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const dictadoDisponible = (): boolean => constructor() !== null

const ICONO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/></svg>'

const ERRORES: Record<string, string> = {
  'not-allowed': 'El navegador no dio permiso para usar el micrófono.',
  'service-not-allowed': 'El navegador no dio permiso para usar el micrófono.',
  'no-speech': 'No te escuché. Intenta de nuevo.',
  'audio-capture': 'No encontré un micrófono.',
  network: 'El dictado necesita conexión a internet.',
}

let activo: { detener: (mensaje?: string) => void } | null = null

/**
 * Pone un botón "Dictar" debajo de cada campo con `data-dictado`. Solo un campo
 * dicta a la vez: empezar en otro detiene el anterior.
 */
export function activarDictado(raiz: ParentNode = document): void {
  const Rec = constructor()
  if (!Rec) return
  raiz.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('[data-dictado]').forEach((campo) => {
    if (campo.dataset.dictadoListo) return
    campo.dataset.dictadoListo = '1'

    const barra = document.createElement('div')
    barra.className = 'mt-1.5 flex items-center gap-2'
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className =
      'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-white/10 bg-white/[.03] text-[11.5px] text-ink-200 hover:text-ink-50 hover:bg-white/[.06] transition-colors aria-pressed:bg-ember/15 aria-pressed:text-ember aria-pressed:border-ember/30'
    boton.setAttribute('aria-pressed', 'false')
    boton.innerHTML = `${ICONO}<span>Dictar</span>`
    const estado = document.createElement('span')
    estado.className = 'text-[11.5px] text-ink-300 truncate'
    estado.setAttribute('aria-live', 'polite')
    barra.append(boton, estado)
    campo.insertAdjacentElement('afterend', barra)

    let rec: Reconocimiento | null = null
    let escuchando = false

    const etiqueta = (t: string) => {
      boton.querySelector('span')!.textContent = t
    }

    const detener = (mensaje = '') => {
      escuchando = false
      estado.textContent = mensaje
      rec?.stop()
      rec = null
      boton.setAttribute('aria-pressed', 'false')
      etiqueta('Dictar')
      if (activo?.detener === detener) activo = null
    }

    const empezar = () => {
      activo?.detener()
      rec = new Rec()
      rec.lang = 'es-CO'
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (e) => {
        let parcial = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          const texto = r[0].transcript
          if (r.isFinal) {
            const inicio = campo.selectionStart ?? campo.value.length
            const fin = campo.selectionEnd ?? campo.value.length
            const { valor, cursor } = insertarDictado(campo.value, inicio, fin, texto)
            campo.value = valor
            campo.setSelectionRange(cursor, cursor)
            // Para que el editor recalcule y marque cambios sin guardar.
            campo.dispatchEvent(new Event('input', { bubbles: true }))
          } else {
            parcial += texto
          }
        }
        estado.textContent = parcial ? `… ${parcial}` : 'Escuchando'
      }
      rec.onerror = (e) => {
        const mensaje = ERRORES[e.error] ?? 'El dictado se detuvo.'
        if (e.error === 'no-speech') estado.textContent = mensaje
        else detener(mensaje)
      }
      // Chrome corta el reconocimiento tras un silencio largo aunque sea
      // continuo: si el usuario no lo detuvo, se reanuda.
      rec.onend = () => {
        if (escuchando && rec) {
          try {
            rec.start()
            return
          } catch {
            // Si no se puede reanudar, se detiene limpio.
          }
        }
        if (escuchando) detener()
      }
      escuchando = true
      boton.setAttribute('aria-pressed', 'true')
      etiqueta('Detener')
      estado.textContent = 'Escuchando'
      activo = { detener }
      campo.focus()
      try {
        rec.start()
      } catch {
        detener('No se pudo iniciar el dictado.')
      }
    }

    boton.addEventListener('click', () => (escuchando ? detener() : empezar()))
  })
}
