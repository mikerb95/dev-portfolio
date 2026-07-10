// IndexNow: notifica a los motores compatibles (Bing, Yandex, Seznam, Naver,
// Yep) qué URLs cambiaron, sin esperar al rastreo. Google NO usa IndexNow; su
// canal es el sitemap en Search Console.
//
// La clave es pública por diseño: se publica en `public/<key>.txt` y el motor
// la valida contra esa ubicación. Mantener ambos valores sincronizados.

export const INDEXNOW_KEY = 'eec9c30b0348b882cba9349b7fb125f2'

const ENDPOINT = 'https://api.indexnow.org/indexnow'

export type IndexNowResult = {
  ok: boolean
  status: number
  submitted: number
}

/** Extrae los <loc> de un XML de sitemap. */
export function locsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

/**
 * Envía una lista de URLs absolutas a IndexNow. `siteUrl` fija el host y la
 * ubicación de la clave. Devuelve el resultado sin lanzar en errores HTTP.
 */
export async function submitToIndexNow(siteUrl: string, urls: string[]): Promise<IndexNowResult> {
  const base = siteUrl.replace(/\/$/, '')
  if (urls.length === 0) return { ok: false, status: 0, submitted: 0 }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(base).host,
      key: INDEXNOW_KEY,
      keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  })

  // 200 = procesado, 202 = aceptado (clave pendiente de validación).
  return { ok: res.ok || res.status === 202, status: res.status, submitted: urls.length }
}

/** Lee el sitemap del propio sitio y envía todas sus URLs a IndexNow. */
export async function submitSitemapToIndexNow(siteUrl: string): Promise<IndexNowResult> {
  const base = siteUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/sitemap.xml`)
  if (!res.ok) return { ok: false, status: res.status, submitted: 0 }
  const urls = locsFromSitemap(await res.text())
  return submitToIndexNow(base, urls)
}
