// Sitios de clientes que están en línea hoy. Son datos (nombre, dominio,
// captura), no texto a traducir: los comparten la vitrina de /paginas-web
// (TrabajosReales.astro) y la línea "Ya en línea" del hero de la portada, para
// que un cliente nuevo o un dominio cambiado se corrija en un solo sitio.

export type TrabajoReal = {
  nombre: string
  dominio: string
  url: string
  /** Captura de página completa en public/assets/trabajos/. */
  captura: string
  /** Color de marca del cliente, para el punto junto al nombre. */
  tono: string
}

export const TRABAJOS_REALES: readonly TrabajoReal[] = [
  { nombre: 'DobleYo Café', dominio: 'dobleyo.cafe', url: 'https://dobleyo.cafe/', captura: '/assets/trabajos/dobleyo.webp', tono: '#b45309' },
  { nombre: 'Gorillaz Motorbikes', dominio: 'gorillazmotorbikes.com', url: 'https://gorillazmotorbikes.com/', captura: '/assets/trabajos/gorillaz-motorbikes-2026-10.webp', tono: '#ea580c' },
  { nombre: 'Toledo Producciones', dominio: 'toledoproducciones.org', url: 'https://toledoproducciones.org/', captura: '/assets/trabajos/web-toledo-producciones.webp', tono: '#eab308' },
]
