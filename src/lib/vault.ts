// Redacción de la bóveda antes de serializar una fila hacia el cliente.
//
// El contenido cifrado (project_services.secrets, project_env_vars.value) solo
// puede salir por su endpoint de revelado bajo sesión admin, nunca dentro de un
// listado. Hasta ahora esa garantía se sostenía repitiendo `{ ...row, secrets:
// undefined }` en cada endpoint: un patrón que hay que *acordarse* de escribir,
// y que un GET nuevo con `db.select()` sin proyección se salta en silencio.
//
// Estas funciones convierten ese "acordarse" en un tipo: el `Omit` hace que
// TypeScript deje de ver el campo en la fila devuelta, así que un caller que
// intente leerlo no compila. Módulo puro (sin node:crypto ni ../db) para que
// pueda probarse sin base de datos y usarse desde cualquier capa.

/**
 * Quita el blob cifrado de la bóveda de una fila de `project_services`.
 * El campo desaparece del objeto, no queda como `undefined`: el JSON resultante
 * es idéntico, pero el tipo ya no promete un secreto que no está.
 */
export function sinSecretos<T extends { secrets?: unknown }>(fila: T): Omit<T, 'secrets'> {
  const { secrets: _oculto, ...resto } = fila
  return resto
}

/** Igual que `sinSecretos`, para una lista de servicios. */
export function sinSecretosLista<T extends { secrets?: unknown }>(filas: T[]): Omit<T, 'secrets'>[] {
  return filas.map(sinSecretos)
}

/**
 * Quita el valor cifrado de una fila de `project_env_vars`. Se separa de
 * `sinSecretos` a propósito en vez de blanquear cualquier campo llamado
 * `value`: hay tablas donde `value` es un dato inocuo (ajustes, métricas) y una
 * redacción genérica por nombre de campo acabaría borrando datos legítimos.
 */
export function sinValorCifrado<T extends { value?: unknown }>(fila: T): Omit<T, 'value'> {
  const { value: _oculto, ...resto } = fila
  return resto
}

/** Igual que `sinValorCifrado`, para una lista de variables de entorno. */
export function sinValorCifradoLista<T extends { value?: unknown }>(filas: T[]): Omit<T, 'value'>[] {
  return filas.map(sinValorCifrado)
}
