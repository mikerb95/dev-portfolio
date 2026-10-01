// El flujo completo del resumen semanal: recolectar, redactar (o armar sin IA)
// y guardar. Lo comparten el cron de los lunes y el botón del panel. Solo servidor.
import { resumenSinIa, semanaAnterior, type Resumen } from './resumen-semanal'
import { guardarResumen, recolectar } from './resumen-semanal-db'
import { redactar } from './resumen-semanal-ia'

/** Lanza si no se puede guardar; la IA y cada consulta son fail-open por dentro. */
export async function generarResumen(ahora = new Date()): Promise<Resumen> {
  const ventana = semanaAnterior(ahora)
  const datos = await recolectar(ventana)
  const ia = await redactar(datos)
  const armado = ia ?? resumenSinIa(datos)
  const resumen: Resumen = {
    creado: ahora.toISOString(),
    desde: ventana.desde,
    hasta: ventana.hasta,
    titular: armado.titular,
    texto: armado.texto,
    conIa: ia !== null,
    costoUsd: ia?.costoUsd ?? 0,
    datos,
  }
  await guardarResumen(resumen)
  return resumen
}
