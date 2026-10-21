// robots.txt generado. Antes era un archivo estático en public/.
//
// Pasó a generarse por el grupo de agentes de IA: un bot que encuentra un
// grupo con su nombre IGNORA el grupo `*` (RFC 9309 §2.2.1), así que cada
// Disallow tiene que repetirse en los dos. Escrito a mano, el primer Disallow
// nuevo que alguien añadiera solo arriba dejaría /admin abierto a GPTBot.
//
// Módulo puro: sin BD ni efectos.

import { AGENTES_IA } from './agentes'

type Regla = { ruta: string; motivo?: string }

export const RUTAS_VETADAS: readonly Regla[] = [
  { ruta: '/admin' },
  { ruta: '/api' },
  {
    ruta: '/present',
    motivo:
      'Presentaciones: estado efímero de una sesión, no contenido. Las páginas ya\n' +
      'llevan noindex; esto evita además el gasto de rastrearlas. Los PIN de la raíz\n' +
      '(/{pin}) no se pueden listar aquí porque viven horas, pero caducan solos.',
  },
  { ruta: '/remote' },
  { ruta: '/decks' },
  { ruta: '/feedback' },
  {
    ruta: '/wp-login.php',
    motivo:
      'Rutas señuelo (honeypots): los crawlers legítimos las respetan; tocarlas es\n' +
      'señal de sondeo malicioso.',
  },
  { ruta: '/admin.php' },
]

function bloqueDisallow(): string {
  return RUTAS_VETADAS.map((r) => {
    const comentario = r.motivo ? r.motivo.split('\n').map((l) => `# ${l}`).join('\n') + '\n' : ''
    return `${comentario}Disallow: ${r.ruta}`
  }).join('\n')
}

export function robotsTxt(origen: string): string {
  const base = origen.replace(/\/$/, '')
  const agentes = AGENTES_IA.map((a) => `User-agent: ${a.token}`).join('\n')
  return `User-agent: *
${bloqueDisallow()}

# Agentes de IA (entrenamiento, búsqueda y los que abre una persona desde el
# asistente). Bienvenidos todos: el sitio quiere que lo citen y lo recomienden.
# El grupo repite los Disallow de arriba porque un bot con grupo propio deja
# de leer el de "*". Mapa para ellos: ${base}/llms.txt
${agentes}
Allow: /
${bloqueDisallow()}

Sitemap: ${base}/sitemap.xml
`
}
