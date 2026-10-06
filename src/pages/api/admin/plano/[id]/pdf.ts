import type { APIRoute } from 'astro'
import { cargarReglas, configDe, hoyCO, propuesta, snapshotDe, version } from '../../../../../lib/plano/db'
import { huellaSnapshot } from '../../../../../lib/plano/hash'
import { generarPdfPropuesta } from '../../../../../lib/plano/pdf'
import { armarPropuesta, PropuestaVacia } from '../../../../../lib/plano/propuesta'

// PDF de una versión congelada (`?v=3`) o, sin `v`, una previsualización de la
// configuración actual marcada como versión 0. La sesión de admin la impone el
// middleware.

export const GET: APIRoute = async ({ params, url }) => {
  const id = Number(params.id)
  const p = Number.isInteger(id) ? await propuesta(id) : null
  if (!p) return new Response('no encontrada', { status: 404 })

  const n = Number(url.searchParams.get('v'))
  let pdf: Uint8Array
  if (Number.isInteger(n) && n > 0) {
    const v = await version(p.id, n)
    if (!v) return new Response('versión no encontrada', { status: 404 })
    const aceptada = p.aceptadaVersion === n && p.aceptadaEl && p.aceptadaPor
    pdf = await generarPdfPropuesta({
      snapshot: snapshotDe(v),
      version: n,
      huella: v.huella,
      aceptacion: aceptada ? { nombre: p.aceptadaPor!, documento: p.aceptadaDocumento ?? '', el: p.aceptadaEl!, huella: p.aceptacionHuella ?? '' } : null,
    })
  } else {
    try {
      const snapshot = armarPropuesta(configDe(p), await cargarReglas(), hoyCO())
      pdf = await generarPdfPropuesta({ snapshot, version: 0, huella: huellaSnapshot(snapshot) })
    } catch (e) {
      if (e instanceof PropuestaVacia) return new Response('la propuesta todavía no tiene componentes', { status: 422 })
      throw e
    }
  }

  return new Response(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="propuesta-${p.id}${n > 0 ? `-v${n}` : ''}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
