// Endpoints públicos propios que /status sondea EN VIVO cuando la base no
// responde y no se puede leer la tabla `monitors`.
//
// NO ES UNA COPIA DE ESA TABLA, y es importante no confundirlas. Los monitores
// reales son 9 (docs/plan-testing-docs.md) y sus URLs solo existen en base de
// datos: incluyen servicios que desde aquí no se pueden adivinar. Esta lista es
// el bote salvavidas, no el barco.
//
// Procedencia de cada destino, para que se sepa qué está verificado y qué no:
//   - "Portal de clientes" está copiado de scripts/register-portal-monitor.mjs,
//     que da de alta ese monitor con estos mismos parámetros. Es el único que
//     se puede afirmar que coincide con uno real.
//   - El resto son rutas públicas que existen en src/pages/. Que estén
//     monitoreadas de verdad no consta en ningún sitio del repositorio: se
//     eligieron por ser las superficies que un fallo dejaría visiblemente rotas.
//
// Para que coincida con los monitores de verdad, editar este arreglo (o
// recuperarlo de la base con /admin/monitors cuando vuelva a responder).
//
// Por qué está declarada en código y no en la instantánea: la instantánea
// guarda MEDICIONES, que caducan. Esto son DESTINOS, que no. Un destino
// declarado aquí se puede sondear hoy y dar un dato de hoy; una medición
// guardada en un JSON solo puede repetir la de ayer.

export type DestinoRespaldo = {
  id: number
  nombre: string
  /** Ruta relativa al despliegue actual. Excluyente con `urlAbsoluta`. */
  ruta?: string
  /**
   * Host externo completo, para servicios que no son este despliegue (otros
   * proyectos propios con su propio dominio). Excluyente con `ruta`.
   *
   * La distinción importa: `ruta` se resuelve contra el origen del despliegue,
   * así que en un preview mide el preview. Un servicio externo no tiene versión
   * de preview, se mide siempre el mismo.
   */
  urlAbsoluta?: string
  /** Un endpoint de salud debe responder rápido; una página completa, no tanto. */
  umbralMs: number
  /** Texto que debe aparecer en el cuerpo. Detecta el "200 que en realidad falló". */
  textoEsperado?: string
}

/** URL final a sondear para un destino, resuelta contra el origen del despliegue. */
export function urlDe(destino: DestinoRespaldo, origen: string): string {
  return destino.urlAbsoluta ?? `${origen}${destino.ruta ?? '/'}`
}

/**
 * El origen sale de la env var pública del sitio, con el dominio real como
 * respaldo. En un preview de Vercel esto apunta al preview, que es justo lo que
 * se quiere: la página de estado de un despliegue habla de ESE despliegue.
 */
export function origenPublico(): string {
  const url =
    (typeof process !== 'undefined' && (process.env.PUBLIC_SITE_URL || process.env.VERCEL_URL)) ||
    'codebymike.tech'
  return url.startsWith('http') ? url.replace(/\/$/, '') : `https://${url.replace(/\/$/, '')}`
}

export const DESTINOS_RESPALDO: DestinoRespaldo[] = [
  { id: 9001, nombre: 'Portada', ruta: '/', umbralMs: 1500 },
  { id: 9003, nombre: 'Ingeniería', ruta: '/engineering', umbralMs: 1800 },
  { id: 9004, nombre: 'Notas técnicas', ruta: '/notes', umbralMs: 1800 },
  { id: 9005, nombre: 'Documentación', ruta: '/docs', umbralMs: 1800 },
  { id: 9006, nombre: 'Herramientas', ruta: '/tools', umbralMs: 1800 },
  { id: 9008, nombre: 'Log de ingeniería', ruta: '/log', umbralMs: 1800 },
  // Copiado de scripts/register-portal-monitor.mjs, incluido el texto esperado:
  // un 200 con el cuerpo equivocado (una página de error del borde, un rewrite
  // mal puesto) contaría como "arriba" sin esa comprobación.
  {
    id: 9007,
    nombre: 'Portal de clientes',
    ruta: '/api/portal/health',
    umbralMs: 2000,
    textoEsperado: '"ok":true',
  },

  // ── Otros servicios propios, con dominio aparte ──────────────────────────
  // Reconstruidos del historial del navegador (ago 2026) tras perder el acceso
  // a la tabla `monitors`. Son despliegues propios en producción, no destinos
  // inventados, pero tampoco consta que fueran exactamente los monitoreados:
  // revisar contra /admin/monitors cuando la base vuelva a responder.
  //
  // Solo el NOMBRE se publica en /status; la URL nunca sale al HTML (regla
  // OPSEC de las páginas públicas), así que listarlas aquí no las expone.
  //
  // DELIBERADAMENTE FUERA: dobleyo.cafe, ekosolv y residential-access, pausados
  // a mano en Vercel (DEPLOYMENT_PAUSED) mientras dura el ahorro de cuota.
  // Sondearlos los pintaría "Caído" en la página pública durante semanas por
  // una decisión operativa, no por una avería. Un panel de estado que reporta
  // como incidente algo que su dueño apagó a propósito enseña a ignorarlo.
  // Cuando se reanuden, volver a añadirlos aquí.
  {
    id: 9010,
    nombre: 'Academia IA',
    urlAbsoluta: 'https://capacitaciones.codebymike.tech/',
    umbralMs: 2500,
  },
]

/**
 * Destinos cuya salud depende de la base de datos: ambos endpoints de salud
 * responden 503 cuando Turso no contesta (ver src/pages/api/health.ts).
 *
 * En modo respaldo se sondean igual, pero la página no debería presentarlos
 * como una caída independiente: SABEMOS que la base está caída, es la razón por
 * la que estamos en modo respaldo. Reportarlo seis veces sería ruido, y
 * ocultarlo sería mentir; se marca para que la tarjeta pueda decir por qué.
 */
export const DEPENDEN_DE_LA_BASE = new Set([9007])
