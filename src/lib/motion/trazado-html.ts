// Marcado de las pasadas de un caso del trazador (/architecture): la lista de
// pasos que se lee a la izquierda del diagrama.
//
// Una sola función para los dos lados: el servidor la pinta con `set:html`
// (sin JS se lee el recorrido completo sin fallos) y el navegador la repinta
// con `innerHTML` cuando se rompe una pieza. Dos plantillas terminarían
// contando recorridos distintos.
//
// Módulo puro y apto para el navegador: solo tipos del guion, nada del
// clasificador.
import type { FinalId, NodoId, NotaId, Pasada, PasadaId } from './trazado'

export type TextosTrazado = {
  notas: Record<NotaId, string>
  finales: Record<FinalId, string>
  pasadas: Record<PasadaId, string>
  nombres: Record<NodoId, string>
  sinCodigo: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Texto del código final: `200 · HIT`, `403`, o la palabra de "sin código". */
export function rotuloStatus(p: Pick<Pasada, 'status' | 'cache'>, sinCodigo: string): string {
  const codigo = p.status === null ? sinCodigo : String(p.status)
  return p.cache ? `${codigo} · ${p.cache}` : codigo
}

/** Familia de color del código: 2xx bien, 3xx desvío, 4xx/5xx o sin código, corte. */
export function tonoStatus(status: number | null): 'ok' | 'desvio' | 'corte' {
  if (status === null || status >= 400) return 'corte'
  return status >= 300 ? 'desvio' : 'ok'
}

export function pasadasHtml(pasadas: readonly Pasada[], t: TextosTrazado): string {
  return pasadas
    .map((p, ip) => {
      const pasos = p.pasos
        .map(
          (paso, i) =>
            `<li class="tz-paso" data-estado="${paso.estado}" data-i="${i}">` +
            `<span class="tz-paso-nodo">${esc(t.nombres[paso.nodo])}</span>` +
            `<span class="tz-paso-nota">${esc(t.notas[paso.nota])}</span></li>`
        )
        .join('')
      const etiqueta = p.etiqueta ? `<span class="tz-pasada-etiqueta">${esc(t.pasadas[p.etiqueta])}</span>` : ''
      return (
        `<div class="tz-pasada" data-pasada="${ip}">` +
        `<div class="tz-pasada-cab">${etiqueta}<code class="tz-peticion">${esc(p.metodo)} ${esc(p.ruta)}</code></div>` +
        `<ol class="tz-pasos">${pasos}</ol>` +
        `<p class="tz-final"><span class="tz-status" data-tono="${tonoStatus(p.status)}">${esc(rotuloStatus(p, t.sinCodigo))}</span>` +
        `<span class="tz-final-texto">${esc(t.finales[p.final])}</span></p>` +
        `</div>`
      )
    })
    .join('')
}
