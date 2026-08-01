/**
 * Registro de los decks de presentación escritos en código (reveal.js sobre
 * `SlidesLayout`). Es la fuente de verdad del hub `/admin/presentations`: la
 * página solo renderiza, igual que las de `/docs`.
 *
 * Un deck nuevo son dos pasos: la página `.astro` y su entrada aquí. Si no
 * está aquí, no aparece en el hub y en la práctica no existe.
 *
 * Las presentaciones de cliente (tabla `presentations`, imágenes subidas y
 * control remoto por proyecto) NO viven aquí: son datos, las lee el hub
 * directamente de la base.
 */

export type AccesoDeck = 'admin' | 'publico'
export type EstadoDeck = 'listo' | 'borrador' | 'archivado'

export interface Deck {
  id: string
  titulo: string
  descripcion: string
  /** Ruta donde se sirve el deck. */
  href: string
  acceso: AccesoDeck
  estado: EstadoDeck
  /** Contexto en el que se usa (sustentación, charla, cliente…). */
  contexto: string
  /** ISO corto (YYYY-MM-DD) de la última revisión del contenido. */
  actualizado: string
  tags: string[]
  /**
   * Si el deck saca sus cifras de `src/data/*` en vez de tenerlas escritas a
   * mano. Se muestra en el hub porque cambia cómo se mantiene: un deck
   * derivado no se desactualiza solo.
   */
  datosDerivados?: boolean
}

export const DECKS: Deck[] = [
  {
    id: 'sustentacion-docs',
    titulo: 'Sustentación del portafolio',
    descripcion:
      'Resumen de /docs en formato presentación: requisitos, casos de uso, arquitectura, decisiones técnicas y métricas de testing.',
    href: '/docs/presentacion',
    acceso: 'admin',
    estado: 'listo',
    contexto: 'Sustentación académica y entrevistas técnicas',
    actualizado: '2026-07-31',
    tags: ['docs', 'arquitectura', 'testing'],
    datosDerivados: true,
  },
  {
    id: 'demo-reveal',
    titulo: 'Deck de referencia (reveal.js)',
    descripcion:
      'Plantilla viva del layout: verticales, fragmentos y auto-animate. Sirve de punto de partida para un deck nuevo.',
    href: '/admin/presentations/demo',
    acceso: 'admin',
    estado: 'borrador',
    contexto: 'Referencia interna',
    actualizado: '2026-06-28',
    tags: ['plantilla', 'reveal.js'],
  },
]

export const DECKS_POR_ESTADO = (estado: EstadoDeck) =>
  DECKS.filter((d) => d.estado === estado)
