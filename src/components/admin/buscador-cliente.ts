// Lista de resultados instantáneos bajo un campo de texto: la usan la caja del
// dashboard y la paleta de Ctrl+K del resto del panel. Pide a
// /api/admin/buscar (sin IA, sin costo) mientras se escribe y deja moverse con
// las flechas. La primera fila es siempre "Preguntarle a la IA".
//
// Solo navegador.

export type Resultado = { tipo: string; titulo: string; detalle: string | null; href: string }

type Opciones = {
  input: HTMLInputElement | HTMLTextAreaElement
  lista: HTMLElement
  /** Enter sobre "Preguntar" (o sin resultados). */
  preguntar: (texto: string) => void
  /** Texto de la fila de la IA cuando está apagada (demo, sin API key). null = encendida. */
  iaApagada?: string | null
}

const ICONOS: Record<string, string> = {
  pagina: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  cliente: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 7m-4 0a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
  proyecto: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M8 7v10',
  cuenta: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4',
  factura: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4',
  cotizacion: 'M9 12h6 M9 16h6 M17 3H7a2 2 0 0 0-2 2v16l3-3 2 2 2-2 2 2 2-2 3 3V5a2 2 0 0 0-2-2z',
  propuesta: 'M3 3h18v18H3z M3 9h8v12 M11 13h10',
  ia: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 16v5 M16.5 18.5h5',
}

function icono(tipo: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', ICONOS[tipo] ?? ICONOS.pagina!)
  svg.append(path)
  return svg
}

export function crearBuscador({ input, lista, preguntar, iaApagada = null }: Opciones) {
  let resultados: Resultado[] = []
  let activo = 0
  let pedido = 0
  let espera: number | undefined
  const control = new AbortController()

  lista.setAttribute('role', 'listbox')
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', lista.id)
  input.setAttribute('aria-expanded', 'false')

  const texto = () => input.value.trim()
  const filas = () => [...lista.querySelectorAll<HTMLElement>('[role="option"]')]

  function cerrar() {
    lista.hidden = true
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
  }

  function marcar(i: number) {
    const fs = filas()
    if (!fs.length) return
    activo = (i + fs.length) % fs.length
    fs.forEach((f, j) => f.setAttribute('aria-selected', String(j === activo)))
    input.setAttribute('aria-activedescendant', fs[activo]!.id)
    fs[activo]!.scrollIntoView({ block: 'nearest' })
  }

  function fila(id: string, tipo: string, titulo: string, detalle: string | null, accion: () => void, deshabilitada = false) {
    const li = document.createElement('li')
    li.id = id
    li.setAttribute('role', 'option')
    li.className = `buscador-fila${tipo === 'ia' ? ' es-ia' : ''}`
    if (deshabilitada) li.setAttribute('aria-disabled', 'true')
    const ic = document.createElement('span')
    ic.className = 'buscador-icono'
    ic.append(icono(tipo))
    const cuerpo = document.createElement('span')
    cuerpo.className = 'buscador-cuerpo'
    const t = document.createElement('span')
    t.className = 'buscador-titulo'
    t.textContent = titulo
    cuerpo.append(t)
    if (detalle) {
      const d = document.createElement('span')
      d.className = 'buscador-detalle'
      d.textContent = detalle
      cuerpo.append(d)
    }
    li.append(ic, cuerpo)
    // mousedown y no click: el blur del campo cerraría la lista antes del click.
    li.addEventListener('mousedown', (ev) => {
      ev.preventDefault()
      if (!deshabilitada) accion()
    })
    li.addEventListener('mousemove', () => marcar(filas().indexOf(li)))
    return li
  }

  function pintar() {
    const q = texto()
    lista.replaceChildren()
    if (!q) return cerrar()
    const ia = fila(
      `${lista.id}-ia`,
      'ia',
      iaApagada ?? `Preguntarle a la IA: «${q.length > 70 ? q.slice(0, 70) + '…' : q}»`,
      iaApagada ? null : 'Enter',
      () => preguntar(q),
      !!iaApagada
    )
    lista.append(ia)
    resultados.forEach((r, i) => lista.append(fila(`${lista.id}-r${i}`, r.tipo, r.titulo, r.detalle, () => (location.href = r.href))))
    lista.hidden = false
    input.setAttribute('aria-expanded', 'true')
    // Dos palabras o menos con resultados suele ser "llévame a": se marca el
    // primer resultado. Una frase larga es una pregunta: se marca la IA.
    const palabras = q.split(/\s+/).length
    marcar(resultados.length && (palabras <= 2 || iaApagada) ? 1 : 0)
  }

  async function buscar() {
    const q = texto()
    const mio = ++pedido
    if (q.length < 2) {
      resultados = []
      return pintar()
    }
    try {
      const r = await fetch(`/api/admin/buscar?q=${encodeURIComponent(q)}`, { signal: control.signal, headers: { Accept: 'application/json' } })
      const d = (await r.json()) as { resultados?: Resultado[] }
      if (mio !== pedido) return
      resultados = d.resultados ?? []
    } catch {
      if (mio !== pedido) return
      resultados = []
    }
    pintar()
  }

  input.addEventListener('input', () => {
    pintar()
    window.clearTimeout(espera)
    espera = window.setTimeout(buscar, 160)
  })
  input.addEventListener('focus', () => texto() && pintar())
  input.addEventListener('blur', () => window.setTimeout(cerrar, 120))
  input.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent
    if (e.key === 'Escape') return cerrar()
    if (lista.hidden) {
      // Lista cerrada con Escape: Enter sigue siendo "preguntar".
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && texto() && !iaApagada) {
        e.preventDefault()
        preguntar(texto())
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      marcar(activo + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      marcar(activo - 1)
    } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      const f = filas()[activo]
      if (f) f.dispatchEvent(new MouseEvent('mousedown', { cancelable: true }))
    }
  })

  return {
    cerrar,
    limpiar() {
      resultados = []
      cerrar()
    },
    destruir: () => control.abort(),
  }
}
