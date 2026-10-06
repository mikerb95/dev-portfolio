// Render de la propuesta del cliente (/propuesta/<token>) a HTML.
//
// Funciones puras que devuelven cadenas: las usa la página en el servidor (la
// propuesta se lee aunque falle el JavaScript) y el script del navegador para
// repintar al mover una perilla. Un solo render para los dos lados evita que
// el servidor y el navegador muestren cosas distintas.
//
// La pieza central es el plano: el proyecto dibujado como la planta de una
// casa, una habitación por componente. Lo incluido está construido; lo que se
// puede agregar está punteado.

import { formatearMonto } from '../../data/tarifario'
import { CANAL_LABEL, SEGUIMIENTO_LABEL } from '../../lib/plano/contacto'
import { fechaCorta } from '../../lib/plano/fechas'
import type { VistaCliente } from '../../lib/plano/publico'
import { NIVEL_LABEL } from '../../lib/plano/tipos'

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const m = (v: VistaCliente, x: number) => formatearMonto(x, v.moneda)

// ── Plano ───────────────────────────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number }
type Pieza = { id: string; nombre: string; peso: number; incluida: boolean; prioridad: string }

const PESO = { esencial: 3, recomendado: 2, extra: 1.4 } as const

/**
 * Treemap binario: parte las piezas en dos grupos de peso parecido y corta el
 * rectángulo por su lado largo. Determinista (mismo orden, misma planta) y con
 * habitaciones razonablemente cuadradas, que es lo que se lee como un plano.
 */
function repartir(piezas: Pieza[], r: Rect, out: { p: Pieza; r: Rect }[]) {
  if (!piezas.length) return
  if (piezas.length === 1) {
    out.push({ p: piezas[0], r })
    return
  }
  const total = piezas.reduce((t, p) => t + p.peso, 0)
  let acum = 0
  let corte = 1
  for (let i = 0; i < piezas.length - 1; i++) {
    acum += piezas[i].peso
    corte = i + 1
    if (acum >= total / 2) break
  }
  const a = piezas.slice(0, corte)
  const b = piezas.slice(corte)
  const fa = a.reduce((t, p) => t + p.peso, 0) / total
  if (r.w >= r.h) {
    repartir(a, { x: r.x, y: r.y, w: r.w * fa, h: r.h }, out)
    repartir(b, { x: r.x + r.w * fa, y: r.y, w: r.w * (1 - fa), h: r.h }, out)
  } else {
    repartir(a, { x: r.x, y: r.y, w: r.w, h: r.h * fa }, out)
    repartir(b, { x: r.x, y: r.y + r.h * fa, w: r.w, h: r.h * (1 - fa) }, out)
  }
}

/** Parte un nombre en hasta tres renglones que quepan en el ancho. */
function renglones(nombre: string, ancho: number, size: number): string[] {
  const max = Math.max(4, Math.floor(ancho / (size * 0.56)))
  const out: string[] = []
  let buf = ''
  for (const w of nombre.split(' ')) {
    const probe = buf ? `${buf} ${w}` : w
    if (probe.length > max && buf) {
      out.push(buf)
      buf = w
    } else buf = probe
  }
  if (buf) out.push(buf)
  return out.slice(0, 3)
}

/**
 * `cambiadas`: ids de habitaciones que acaban de construirse o quitarse. Solo
 * esas se animan al repintar; el resto de la casa no se vuelve a trazar.
 */
export function renderPlano(v: VistaCliente, puedeTocar: (id: string) => boolean, cambiadas?: ReadonlySet<string>): string {
  const W = 640
  const H = 400
  const pad = 46
  const piezas: Pieza[] = v.lineas.map((l) => ({ id: l.id, nombre: l.nombre + (l.cantidad > 1 ? ` ×${l.cantidad}` : ''), peso: PESO[l.prioridad], incluida: l.incluida, prioridad: l.prioridad }))
  const caja: Rect = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 - 12 }
  const cuartos: { p: Pieza; r: Rect }[] = []
  repartir(piezas, caja, cuartos)
  const g = 5 // grosor de los muros interiores

  const habitaciones = cuartos
    .map(({ p, r }, i) => {
      const x = r.x + g / 2
      const y = r.y + g / 2
      const w = Math.max(r.w - g, 8)
      const h = Math.max(r.h - g, 8)
      const size = Math.min(13, Math.max(9, Math.min(w, h) / 6.5))
      const lineas = renglones(p.nombre, w - 16, size)
      const ty = y + h / 2 - ((lineas.length - 1) * (size + 3)) / 2
      const tocar = puedeTocar(p.id)
      // Puerta: un arco en la esquina inferior izquierda de cada habitación
      // construida. Detalle de plano, sin información.
      const puerta = p.incluida && w > 60 && h > 50 ? `<path class="pv-puerta" d="M ${x + 10} ${y + h} a 18 18 0 0 1 18 -18" />` : ''
      return `<g class="pv-cuarto ${p.incluida ? 'pv-cuarto--hecho' : 'pv-cuarto--posible'} ${tocar ? 'pv-cuarto--tocable' : ''} ${cambiadas?.has(p.id) ? 'pv-cuarto--cambio' : ''}" style="--i:${i}" ${tocar ? `data-linea="${esc(p.id)}" role="button" tabindex="0" aria-pressed="${p.incluida}" aria-label="${esc(p.incluida ? `Quitar ${p.nombre}` : `Agregar ${p.nombre}`)}"` : ''}>
        <rect class="pv-cuarto__piso" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" />
        <rect class="pv-cuarto__muro" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" ${p.incluida ? 'pathLength="100"' : ''} />
        ${puerta}
        <text class="pv-cuarto__nombre" x="${(x + w / 2).toFixed(1)}" y="${ty.toFixed(1)}" font-size="${size.toFixed(1)}">${lineas
          .map((l, k) => `<tspan x="${(x + w / 2).toFixed(1)}" dy="${k === 0 ? 0 : size + 3}">${esc(l)}</tspan>`)
          .join('')}</text>
        ${!p.incluida ? `<text class="pv-cuarto__mas" x="${(x + w - 12).toFixed(1)}" y="${(y + 16).toFixed(1)}">+</text>` : ''}
      </g>`
    })
    .join('')

  const pub = v.hitos.find((h) => h.id === 'publicacion')
  const baseTxt = v.base ? `Cimientos: plan web ${v.base.nombre}` : 'Sistema a la medida'
  return `<svg class="pv-plano" viewBox="0 0 ${W} ${H}" role="img" aria-label="Plano del proyecto: ${esc(v.lineas.filter((l) => l.incluida).map((l) => l.nombre).join(', '))}">
    <defs>
      <pattern id="pv-rayado" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="pv-rayado" /></pattern>
      <marker id="pv-flecha" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="pv-flecha" /></marker>
    </defs>
    <rect class="pv-exterior" x="${caja.x - 4}" y="${caja.y - 4}" width="${caja.w + 8}" height="${caja.h + 8}" pathLength="100" />
    ${habitaciones}
    <g class="pv-cota">
      <line x1="${caja.x}" y1="22" x2="${caja.x + caja.w}" y2="22" marker-start="url(#pv-flecha)" marker-end="url(#pv-flecha)" />
      <line class="pv-cota__guia" x1="${caja.x - 4}" y1="14" x2="${caja.x - 4}" y2="${caja.y - 8}" />
      <line class="pv-cota__guia" x1="${caja.x + caja.w + 4}" y1="14" x2="${caja.x + caja.w + 4}" y2="${caja.y - 8}" />
      <rect class="pv-cota__fondo" x="${W / 2 - 92}" y="11" width="184" height="22" rx="4" />
      <text class="pv-cota__txt" x="${W / 2}" y="26" data-cota-precio>${esc(m(v, v.precio))}</text>
    </g>
    <text class="pv-rotulo" x="${caja.x}" y="${H - 14}">${esc(baseTxt)}</text>
    ${pub ? `<text class="pv-rotulo pv-rotulo--der" x="${caja.x + caja.w}" y="${H - 14}">Entrega estimada ${esc(fechaCorta(pub.fecha))}</text>` : ''}
  </svg>`
}

// ── Bloques ─────────────────────────────────────────────────────────────────

export function renderVersiones(v: VistaCliente): string {
  if (!v.perillas.version) return ''
  const visibles = v.versiones.filter((x) => !x.repetida)
  if (visibles.length < 2) return ''
  return `<div class="pv-versiones">${visibles
    .map(
      (x) => `<button type="button" class="pv-version" data-version="${x.nivel}" aria-pressed="${v.version === x.nivel}">
      <span class="pv-version__nivel">${esc(NIVEL_LABEL[x.nivel])}${x.nivel === 'recomendada' ? ' <em>la que te recomiendo</em>' : ''}</span>
      <span class="pv-version__precio">${esc(m(v, x.precio))}</span>
      <span class="pv-version__sin">${x.sinIncluir.length ? `Sin ${esc(x.sinIncluir.join(', ').toLowerCase())}` : 'Todo lo de este plano'}</span>
    </button>`,
    )
    .join('')}</div>`
}

export function renderLineas(v: VistaCliente): string {
  const incl = v.lineas.filter((l) => l.incluida)
  const fuera = v.lineas.filter((l) => !l.incluida)
  const tocable = (id: string) => v.perillas.lineas.includes(id)
  const item = (l: VistaCliente['lineas'][number]) =>
    `<li class="pv-item ${l.incluida ? '' : 'pv-item--fuera'}">
      <span class="pv-item__dot pv-item__dot--${l.prioridad}" aria-hidden="true"></span>
      <span class="pv-item__nombre">${esc(l.nombre)}${l.cantidad > 1 ? ` <span class="pv-sub">(${l.cantidad})</span>` : ''}</span>
      ${tocable(l.id) ? `<button type="button" class="pv-toggle" data-linea="${esc(l.id)}" role="switch" aria-checked="${l.incluida}" aria-label="${esc(l.nombre)}"><span></span></button>` : ''}
    </li>`
  return `
    ${v.base ? `<p class="pv-base">Sobre el plan web <b>${esc(v.base.nombre)}</b>: diseño, secciones, publicación y el primer año de dominio y servidor.</p>` : ''}
    <ul class="pv-items">${incl.map(item).join('')}</ul>
    ${fuera.length ? `<p class="pv-label mt">Se puede agregar</p><ul class="pv-items">${fuera.map(item).join('')}</ul>` : ''}
    ${v.exclusiones.length ? `<p class="pv-label mt">No incluye</p><ul class="pv-excl">${v.exclusiones.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`
}

const PLAN_TXT = {
  hitos: { t: 'Por entregas', d: 'Pagas a medida que ves avances.' },
  cuotas: { t: 'En cuotas', d: 'Un anticipo y el resto en cuotas mensuales después de publicar.' },
  contado: { t: 'De contado', d: 'Un solo pago, con descuento.' },
} as const

export function renderPagos(v: VistaCliente): string {
  const opciones = (['hitos', 'cuotas', 'contado'] as const).filter((t) => t === 'hitos' || (t === 'cuotas' ? v.opcionesPlan.cuotas : v.opcionesPlan.contado))
  const elegir = v.perillas.planPago && opciones.length > 1
  const nCuotas = v.plan.pagos.filter((p) => p.cuota).length
  return `
    ${
      elegir
        ? `<div class="pv-planes">${opciones
            .map(
              (t) => `<button type="button" class="pv-plan" data-plan="${t}" aria-pressed="${v.plan.tipo === t}"><b>${PLAN_TXT[t].t}</b><span>${PLAN_TXT[t].d}</span></button>`,
            )
            .join('')}</div>`
        : ''
    }
    ${
      v.plan.tipo === 'cuotas' && v.perillas.planPago && v.opcionesPlan.maxCuotas > 1
        ? `<div class="pv-cuotas"><span class="pv-sub">Número de cuotas</span>${Array.from({ length: v.opcionesPlan.maxCuotas }, (_, i) => i + 1)
            .map((n) => `<button type="button" data-cuotas="${n}" aria-pressed="${nCuotas === n}">${n}</button>`)
            .join('')}</div>`
        : ''
    }
    <ol class="pv-pagos">${v.plan.pagos
      .map(
        (p) => `<li>
        <span class="pv-pagos__n">${p.n}</span>
        <span class="pv-pagos__que">${esc(p.concepto)}${p.pct ? ` <span class="pv-sub">· ${p.pct} %</span>` : ''}
          ${p.cuota ? `<span class="pv-sub">${esc(m(v, p.cuota.abono))} del proyecto + ${esc(m(v, p.cuota.recargo))} de recargo</span>` : ''}
          ${p.radicarAntesDe ? `<span class="pv-sub">La cuenta de cobro te llega antes del ${esc(fechaCorta(p.radicarAntesDe))}</span>` : ''}</span>
        <span class="pv-pagos__cuando">${p.hito === 'firma' ? 'Al aceptar' : esc(fechaCorta(p.vence))}</span>
        <span class="pv-pagos__monto">${esc(m(v, p.monto))}</span>
      </li>`,
      )
      .join('')}</ol>
    <div class="pv-total"><span>Total${v.plan.recargoTotal ? ' con recargo' : v.plan.descuento ? ' con descuento' : ''}</span><b data-total>${esc(m(v, v.plan.total))}</b></div>
    ${v.plan.tipo === 'hitos' ? '<p class="pv-sub">Cada pago vence cuando se cumple su entrega, no antes. Las fechas son la estimación de hoy.</p>' : ''}`
}

export function renderCronograma(v: VistaCliente): string {
  return `<ol class="pv-crono">${v.hitos
    .map(
      (h, i) => `<li style="--i:${i}">
      <span class="pv-crono__fecha">${esc(fechaCorta(h.fecha))}</span>
      <span class="pv-crono__punto" aria-hidden="true"></span>
      <span class="pv-crono__que"><b>${esc(h.nombre)}</b>${esc(h.entregable)}</span>
    </li>`,
    )
    .join('')}</ol>`
}

export function renderContacto(v: VistaCliente): string {
  const c = v.contacto
  const persona = (rol: string, nombre: string | null, extra = '') =>
    nombre ? `<div class="pv-persona"><span class="pv-label">${rol}</span><b>${esc(nombre)}</b>${extra}</div>` : ''
  return `<div class="pv-personas">
      ${persona('Habla conmigo', c.contacto.nombre, c.contacto.rol ? `<span class="pv-sub">${esc(c.contacto.rol)}</span>` : '')}
      ${persona('Aprueba las entregas', c.decisor)}
      ${persona('Hace los pagos', c.pagador)}
      ${persona('Del otro lado', 'Mike Rodríguez', '<span class="pv-sub">Desarrollador</span>')}
    </div>
    <ul class="pv-reglas">
      <li><b>Por dónde:</b> ${esc(CANAL_LABEL[c.canal])}, ${esc(c.horario)}.</li>
      <li><b>Te respondo</b> en máximo ${c.respuestaMikeHoras} horas hábiles.</li>
      <li><b>Cuando te pida algo</b>, tienes ${c.respuestaClienteDias} días hábiles antes de que la entrega se corra.</li>
      <li><b>Seguimiento:</b> ${esc(SEGUIMIENTO_LABEL[c.seguimiento])}.</li>
    </ul>`
}

export function renderClausulas(v: VistaCliente): string {
  return `<div class="pv-clausulas">${v.clausulas
    .map(
      (c, i) => `<details class="pv-clausula">
      <summary><span class="pv-clausula__n">${String(i + 1).padStart(2, '0')}</span><span class="pv-clausula__t">${esc(c.titulo)}</span><span class="pv-clausula__s">${esc(c.simple)}</span></summary>
      <p class="pv-clausula__formal"><span class="pv-label">Texto formal</span>${esc(c.formal)}</p>
    </details>`,
    )
    .join('')}</div>`
}
