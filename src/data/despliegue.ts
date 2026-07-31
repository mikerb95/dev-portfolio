// Fuente de verdad del diagrama de despliegue de /docs/diagrama-despliegue.
//
// Es la vista de red del sistema, expresada con los elementos que UML sí tiene:
// nodos, artefactos desplegados y caminos de comunicación con su protocolo. Los
// nombres de los artefactos son los reales del repositorio y del proveedor: un
// diagrama de despliegue que nombra componentes inventados no sirve para operar
// nada, que es para lo que existe.

import type { UmlDeploymentModel } from '../lib/uml-deployment'

const produccion: UmlDeploymentModel = {
  id: 'produccion',
  titulo: 'Despliegue de producción (codebymike.tech)',
  desc:
    'Qué corre dónde y por dónde viaja cada cosa. El sistema no tiene servidor propio: todo el cómputo vive en la red de borde de Vercel, la persistencia es un servicio gestionado y los disparadores periódicos vienen de fuera, no de un proceso residente.',
  origen: 'astro.config.mjs · src/middleware.ts · src/db/index.ts · .github/workflows/*',
  nota:
    'Los dos entornos de ejecución dentro de Vercel comparten máquina pero no responsabilidad: el middleware corre ANTES de la caché y decide si el request llega siquiera al runtime de la aplicación. Por eso los guardas de seguridad viven ahí y no en las páginas.',
  nodos: [
    {
      id: 'cliente',
      label: 'Dispositivo del cliente',
      estereotipo: 'device',
      col: 0,
      fila: 0,
      contenido: [
        { tipo: 'nodo', label: 'Navegador', estereotipo: 'executionEnvironment' },
        { tipo: 'artefacto', label: 'bundle.js · styles.css' },
      ],
    },
    {
      id: 'cron',
      label: 'cron-job.org',
      estereotipo: 'device',
      col: 1,
      fila: 0,
      contenido: [{ tipo: 'artefacto', label: 'disparadores programados' }],
    },
    {
      id: 'gh',
      label: 'GitHub',
      estereotipo: 'device',
      col: 2,
      fila: 0,
      contenido: [
        { tipo: 'artefacto', label: 'repositorio + Actions' },
        { tipo: 'artefacto', label: 'proveedor OAuth' },
      ],
    },
    {
      id: 'vercel',
      label: 'Red de borde de Vercel',
      estereotipo: 'device',
      col: 0,
      fila: 1,
      span: 4,
      contenido: [
        { tipo: 'nodo', label: 'Routing Middleware', estereotipo: 'executionEnvironment', detalle: 'middleware.ts compilado' },
        { tipo: 'nodo', label: 'Fluid Compute · Node 22', estereotipo: 'executionEnvironment', detalle: 'páginas SSR y rutas /api' },
        { tipo: 'artefacto', label: 'dist/server · dist/client' },
      ],
    },
    {
      id: 'turso',
      label: 'Turso',
      estereotipo: 'device',
      col: 0,
      fila: 2,
      contenido: [
        { tipo: 'artefacto', label: 'base de producción' },
        { tipo: 'artefacto', label: 'base de la demo' },
      ],
    },
    {
      id: 'blob',
      label: 'Vercel Blob',
      estereotipo: 'device',
      col: 1,
      fila: 2,
      contenido: [{ tipo: 'artefacto', label: 'respaldos y capturas' }],
    },
    {
      id: 'wompi',
      label: 'Wompi',
      estereotipo: 'device',
      col: 2,
      fila: 2,
      contenido: [{ tipo: 'artefacto', label: 'pasarela de pagos' }],
    },
    {
      id: 'ntfy',
      label: 'ntfy.sh',
      estereotipo: 'device',
      col: 3,
      fila: 2,
      contenido: [{ tipo: 'artefacto', label: 'canal de alertas' }],
    },
  ],
  caminos: [
    { from: 'cliente', to: 'vercel', protocolo: 'HTTPS', detalle: 'TLS 1.3 · HSTS con preload' },
    { from: 'cron', to: 'vercel', protocolo: 'HTTPS', detalle: 'Bearer CRON_SECRET' },
    { from: 'gh', to: 'vercel', protocolo: 'HTTPS', detalle: 'OAuth 2.0 y despliegue' },
    { from: 'vercel', to: 'turso', protocolo: 'libSQL/TLS' },
    { from: 'vercel', to: 'blob', protocolo: 'HTTPS' },
    { from: 'vercel', to: 'wompi', protocolo: 'HTTPS', detalle: 'cobros y webhooks', bidireccional: true },
    { from: 'vercel', to: 'ntfy', protocolo: 'HTTPS', detalle: 'push de alertas' },
  ],
}

export const DESPLIEGUES: UmlDeploymentModel[] = [produccion]
