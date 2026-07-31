// Fuente de verdad del diagrama de componentes de /docs/diagrama-componentes.
//
// Cada componente corresponde a un directorio o módulo real del repositorio, y
// cada interfaz al conjunto de funciones exportadas por las que pasa esa
// dependencia. La regla que hace útil el diagrama: si dos componentes están
// unidos aquí, en el código hay un import que lo demuestra; si no lo están, no
// debería haberlo.

import type { UmlComponentModel } from '../lib/uml-component'

const arquitectura: UmlComponentModel = {
  id: 'arquitectura',
  titulo: 'Componentes y sus interfaces',
  desc:
    'Las piezas de software del sistema y las interfaces por las que dependen unas de otras. Lo que el diagrama afirma es sustituibilidad: un componente que solo depende de interfaces provistas puede cambiarse por otro que ofrezca las mismas sin tocar a sus consumidores.',
  origen: 'src/pages/* · src/middleware.ts · src/lib/{security,payments,notify}.ts · src/db/*',
  nota:
    'El acceso a datos es el único componente del que dependen casi todos, y por eso es también el único punto donde se puede imponer una regla transversal como el aislamiento por cliente del portal. Un atajo que consultara la base sin pasar por ahí no aparecería en este diagrama — y esa es exactamente la clase de fallo que expone los datos de un cliente a otro.',
  componentes: [
    { id: 'web', nombre: 'SitioPublico', detalle: 'portafolio, /status, /notes, /docs', col: 0, fila: 0 },
    { id: 'admin', nombre: 'PanelAdmin', detalle: 'CRM, finanzas, bóveda, LAB', col: 1, fila: 0 },
    { id: 'portal', nombre: 'PortalClientes', detalle: 'proyectos, hitos y facturas del cliente', col: 2, fila: 0 },
    { id: 'mw', nombre: 'Middleware', detalle: 'guarda único de entrada', col: 0, fila: 1 },
    { id: 'api', nombre: 'ApiInterna', detalle: 'rutas /api y crons', col: 1, fila: 1 },
    { id: 'siem', nombre: 'MicroSIEM', detalle: 'sensor, blocklist y límite durable', col: 0, fila: 2 },
    { id: 'pagos', nombre: 'MotorDePagos', detalle: 'máquina de estados idempotente', col: 1, fila: 2 },
    { id: 'obs', nombre: 'Observabilidad', detalle: 'monitores, incidentes y SLO', col: 2, fila: 2 },
    { id: 'datos', nombre: 'AccesoADatos', detalle: 'esquema y consultas (Drizzle)', col: 1, fila: 3 },
    { id: 'notif', nombre: 'Notificaciones', detalle: 'push y correo, opcionales', col: 2, fila: 3 },
  ],
  ensamblajes: [
    { proveedor: 'api', consumidor: 'web', interfaz: 'IEndpointsHTTP' },
    { proveedor: 'api', consumidor: 'admin', interfaz: 'IEndpointsHTTP' },
    { proveedor: 'api', consumidor: 'portal', interfaz: 'IEndpointsHTTP' },
    { proveedor: 'siem', consumidor: 'mw', interfaz: 'IEnforcement' },
    { proveedor: 'pagos', consumidor: 'api', interfaz: 'ICobros' },
    { proveedor: 'obs', consumidor: 'api', interfaz: 'IMonitoreo' },
    { proveedor: 'datos', consumidor: 'siem', interfaz: 'IRepositorio' },
    { proveedor: 'datos', consumidor: 'pagos', interfaz: 'IRepositorio' },
    { proveedor: 'datos', consumidor: 'obs', interfaz: 'IRepositorio' },
    { proveedor: 'notif', consumidor: 'obs', interfaz: 'INotificacion' },
    { proveedor: 'notif', consumidor: 'pagos', interfaz: 'INotificacion' },
  ],
}

export const COMPONENTES: UmlComponentModel[] = [arquitectura]
