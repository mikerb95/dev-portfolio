// Tope de gasto diario del asesor público. Es un endpoint abierto a cualquiera
// que gasta créditos de la API: sin tope, un bot con paciencia vacía la cuenta
// aunque el rate limit por IP lo frene (basta con muchas IPs).
//
// Falla CERRADO, al revés que la observabilidad del sitio: si no se puede
// leer cuánto se ha gastado hoy, el asesor no responde y la burbuja ofrece
// solo WhatsApp. Perder una conversación con la IA cuesta poco; una factura
// sin techo, no.
//
// El contador (una fila en app_settings, suma atómica) vive en
// lib/gasto-diario.ts y lo comparte con el asistente del panel.

import { crearTopeDiario } from '../gasto-diario'

export { gastoDelValor, hoyBogota } from '../gasto-diario'

const tope = crearTopeDiario({ clave: 'asesor_gasto', variable: 'ASESOR_TOPE_DIARIO_USD', porDefectoUsd: 1 })

export const CLAVE_GASTO = tope.clave
export const topeDiarioUsd = tope.topeDiarioUsd
export const presupuestoRestante = tope.presupuestoRestante
export const sumarGasto = tope.sumarGasto
