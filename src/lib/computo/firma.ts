// Firma de los lotes de telemetría de cómputo. Módulo SOLO-SERVIDOR: usa
// node:crypto y no puede importarse desde nada que corra en el navegador.
//
// Por qué HMAC y no un token en una cabecera: el endpoint de ingesta es
// público y lo que escribe acaba en una factura. Un token estático se filtra
// en un log de proxy o en el bundle de un cliente descuidado, y quien lo tenga
// puede inflar el consumo de un proyecto ajeno. La firma cubre el cuerpo
// completo, así que un lote alterado por el camino no valida.
//
// El secreto es POR PROYECTO (compute_terms.ingest_secret, cifrado con
// AES-256-GCM igual que la bóveda): filtrar el de un cliente no debe permitir
// inyectar consumo en la factura de otro.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Ventana de validez de una firma. Cubre el desfase de relojes sin dar margen a un replay útil. */
export const VENTANA_MS = 5 * 60_000

/** Secreto nuevo para un proyecto. 32 bytes de CSPRNG, en hex. */
export function nuevoSecretoIngest(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Firma canónica de un lote: HMAC-SHA256 sobre `timestamp.cuerpoCrudo`.
 *
 * Se firma el cuerpo CRUDO y no el objeto ya parseado porque `JSON.stringify`
 * no garantiza el mismo orden de claves en dos runtimes distintos, y el
 * instrumentador corre en el proyecto del cliente, no aquí.
 */
export function firmarLote(timestamp: number, cuerpoCrudo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`${timestamp}.${cuerpoCrudo}`, 'utf8').digest('hex')
}

export type ResultadoFirma = 'ok' | 'firma_invalida' | 'timestamp_invalido' | 'timestamp_fuera_de_ventana'

/**
 * Verifica firma y frescura. Comparación en tiempo constante: un `===`
 * filtraría la firma esperada por timing.
 *
 * `ahora` se inyecta para que los tests de la ventana no dependan del reloj.
 */
export function verificarLote(
  timestampCrudo: string | null | undefined,
  firmaRecibida: string | null | undefined,
  cuerpoCrudo: string,
  secreto: string,
  ahora: number,
): ResultadoFirma {
  const ts = Number(timestampCrudo)
  if (!Number.isFinite(ts) || ts <= 0) return 'timestamp_invalido'
  if (Math.abs(ahora - ts) > VENTANA_MS) return 'timestamp_fuera_de_ventana'

  if (typeof firmaRecibida !== 'string' || firmaRecibida.length === 0) return 'firma_invalida'
  const esperada = Buffer.from(firmarLote(ts, cuerpoCrudo, secreto), 'utf8')
  const recibida = Buffer.from(firmaRecibida, 'utf8')
  if (recibida.length !== esperada.length) return 'firma_invalida'
  return timingSafeEqual(recibida, esperada) ? 'ok' : 'firma_invalida'
}
