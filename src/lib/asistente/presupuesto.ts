// Tope de gasto diario del asistente del panel (ASISTENTE_TOPE_DIARIO_USD, por
// defecto US$3). Falla CERRADO como el del asesor y el del analista: si no se
// puede leer cuánto se gastó hoy, no se arranca otra consulta.

import { crearTopeDiario } from '../gasto-diario'

export const TOPE_ASISTENTE = crearTopeDiario({ clave: 'asistente_gasto', variable: 'ASISTENTE_TOPE_DIARIO_USD', porDefectoUsd: 3 })
