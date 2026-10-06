// Qué cambió entre dos versiones de una propuesta, dicho en frases.
//
// Es lo que acaba con el "pero usted me había dicho": el cliente ve, en su
// enlace, exactamente qué se movió desde la versión anterior.
//
// Módulo PURO e isomorfo.

import { formatearMonto } from '../../data/tarifario'
import { fechaCorta } from './fechas'
import { NIVEL_LABEL, type Snapshot } from './tipos'

export type Cambio = { tipo: 'mas' | 'menos' | 'cambio'; texto: string }

const PLAN_LABEL = { hitos: 'por entregas', cuotas: 'en cuotas', contado: 'de contado' } as const

export function diferencias(antes: Snapshot, despues: Snapshot): Cambio[] {
  const out: Cambio[] = []
  const m = (v: number) => formatearMonto(v, despues.moneda)

  if (antes.precio !== despues.precio) {
    out.push({
      tipo: despues.precio > antes.precio ? 'mas' : 'menos',
      texto: `El precio pasó de ${formatearMonto(antes.precio, antes.moneda)} a ${m(despues.precio)}.`,
    })
  }
  if (antes.version !== despues.version) {
    out.push({ tipo: 'cambio', texto: `La versión propuesta pasó de ${NIVEL_LABEL[antes.version]} a ${NIVEL_LABEL[despues.version]}.` })
  }
  if ((antes.base?.id ?? null) !== (despues.base?.id ?? null)) {
    out.push({ tipo: 'cambio', texto: despues.base ? `Ahora parte del plan web ${despues.base.nombre}.` : 'Ya no parte de un plan web.' })
  }

  const inc = (s: Snapshot) => new Map(s.lineas.filter((l) => l.incluida).map((l) => [l.id, l]))
  const a = inc(antes)
  const d = inc(despues)
  for (const [id, l] of d) {
    const prev = a.get(id)
    if (!prev) out.push({ tipo: 'mas', texto: `Se agregó: ${l.nombre}${l.cantidad > 1 ? ` (${l.cantidad})` : ''}.` })
    else if (prev.cantidad !== l.cantidad) out.push({ tipo: 'cambio', texto: `${l.nombre}: de ${prev.cantidad} a ${l.cantidad}.` })
  }
  for (const [id, l] of a) if (!d.has(id)) out.push({ tipo: 'menos', texto: `Se quitó: ${l.nombre}.` })

  if (antes.plan.tipo !== despues.plan.tipo) {
    out.push({ tipo: 'cambio', texto: `La forma de pago pasó de ${PLAN_LABEL[antes.plan.tipo]} a ${PLAN_LABEL[despues.plan.tipo]}.` })
  } else if (antes.plan.pagos.length !== despues.plan.pagos.length) {
    out.push({ tipo: 'cambio', texto: `Ahora son ${despues.plan.pagos.length} pagos en vez de ${antes.plan.pagos.length}.` })
  }

  const pub = (s: Snapshot) => s.hitos.find((h) => h.id === 'publicacion')?.fecha
  const pa = pub(antes)
  const pd = pub(despues)
  if (pa && pd && pa !== pd) out.push({ tipo: 'cambio', texto: `La publicación estimada pasó del ${fechaCorta(pa)} al ${fechaCorta(pd)}.` })

  const act = (s: Snapshot) => new Map(s.clausulas.filter((c) => c.activa).map((c) => [c.id, c]))
  const ca = act(antes)
  const cd = act(despues)
  for (const [id, c] of cd) if (!ca.has(id)) out.push({ tipo: 'mas', texto: `Nueva condición: ${c.titulo}.` })
  for (const [id, c] of ca) if (!cd.has(id)) out.push({ tipo: 'menos', texto: `Se retiró la condición: ${c.titulo}.` })

  const ea = new Set(antes.exclusiones)
  const ed = new Set(despues.exclusiones)
  for (const x of ed) if (!ea.has(x)) out.push({ tipo: 'cambio', texto: `No incluye: ${x}` })
  for (const x of ea) if (!ed.has(x)) out.push({ tipo: 'cambio', texto: `Ya no se excluye: ${x}` })

  if (antes.contacto.contacto.nombre !== despues.contacto.contacto.nombre && despues.contacto.contacto.nombre) {
    out.push({ tipo: 'cambio', texto: `El contacto del proyecto ahora es ${despues.contacto.contacto.nombre}.` })
  }
  return out
}
