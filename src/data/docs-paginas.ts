// Fuente de verdad de las páginas de /docs.
//
// Existía por triplicado y sin cruzarse: las pestañas de DocsNav, las tarjetas
// del índice y (ahora) el sitemap. Eso ya se cobró una víctima - el diagrama de
// paquetes vivía en el menú pero no en el índice, así que desde la portada de
// la documentación no había forma de llegar a él. Con la lista aquí, un test
// cruza las tres contra el disco y falla si alguien añade una página y se
// olvida de registrarla en cualquiera de ellas.

export interface DocsPagina {
  /** Nombre del archivo en src/pages/docs, sin extensión. */
  slug: string
  /** Etiqueta corta de la pestaña de navegación. */
  label: string
  /**
   * Se anuncia en el sitemap. Falso para lo que no debe indexarse: contenido
   * privado o una segunda versión del mismo texto.
   */
  indexable?: boolean
}

export const DOCS_PAGINAS: DocsPagina[] = [
  { slug: 'requerimientos-funcionales', label: 'Req. funcionales', indexable: true },
  { slug: 'requerimientos-no-funcionales', label: 'Req. no funcionales', indexable: true },
  { slug: 'roles', label: 'Roles', indexable: true },
  { slug: 'raci', label: 'RACI', indexable: true },
  { slug: 'casos-de-uso', label: 'Casos de uso', indexable: true },
  { slug: 'casos-de-uso-extendidos', label: 'CU extendidos', indexable: true },
  { slug: 'historias-de-usuario', label: 'Historias US', indexable: true },
  { slug: 'diagrama-bpmn', label: 'BPMN', indexable: true },
  { slug: 'diagrama-secuencia', label: 'Secuencia', indexable: true },
  { slug: 'diagrama-comunicacion', label: 'Comunicación', indexable: true },
  { slug: 'diagrama-actividades', label: 'Actividades', indexable: true },
  { slug: 'diagrama-componentes', label: 'Componentes', indexable: true },
  { slug: 'diagrama-despliegue', label: 'Despliegue', indexable: true },
  { slug: 'diagrama-red', label: 'Red', indexable: true },
  { slug: 'diagrama-paquetes', label: 'Paquetes', indexable: true },
  { slug: 'diagrama-clases', label: 'Clases', indexable: true },
  { slug: 'diagrama-objetos', label: 'Objetos', indexable: true },
  { slug: 'kanban', label: 'Kanban', indexable: true },
  { slug: 'testing', label: 'Testing', indexable: true },
  { slug: 'ejecucion-pruebas', label: 'Ejecución de pruebas', indexable: true },
  { slug: 'reportes-pruebas', label: 'Reportes de pruebas', indexable: true },
  { slug: 'docker', label: 'Docker', indexable: true },
  { slug: 'pipeline-en-vivo', label: 'Pipeline en vivo', indexable: true },
  { slug: 'verificacion-validacion', label: 'V&V', indexable: true },
  { slug: 'usability-testing', label: 'Usability testing', indexable: true },
]

/**
 * Páginas de /docs que existen pero no entran ni en el menú ni en el sitemap,
 * con el motivo. Están aquí y no fuera de la lista para que el test que cruza
 * contra el disco pueda distinguir una exclusión deliberada de un olvido.
 */
export const DOCS_PAGINAS_EXCLUIDAS: Record<string, string> = {
  index: 'Es la portada de la sección: se anuncia como /docs, no como subpágina.',
  presentacion: 'Deck privado: el middleware lo trata como ruta privada y da 404 sin sesión.',
  'bpmn-imprimible':
    'Mismo contenido que /docs/diagrama-bpmn en formato de impresión. Anunciarlo sería publicar el texto dos veces.',
}

/** Rutas de /docs que el sitemap debe anunciar, incluida la portada. */
export const docsSitemapPaths = (): string[] => [
  '/docs',
  ...DOCS_PAGINAS.filter((p) => p.indexable).map((p) => `/docs/${p.slug}`),
]
