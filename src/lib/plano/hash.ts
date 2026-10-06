// Huellas de Plano: la de cada versión congelada y la constancia de aceptación.
//
// JSON canónico (claves ordenadas) y no `JSON.stringify` a secas: el snapshot
// pasa por la base y vuelve, y una huella que dependiera del orden en que un
// motor serializa las claves dejaría de cuadrar sin que nadie tocara nada.
//
// Solo servidor (node:crypto).

import { createHash, randomBytes } from 'node:crypto'

export function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  const o = v as Record<string, unknown>
  const claves = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

export const huellaSnapshot = (snapshot: unknown): string => sha256(canonico(snapshot))

export type DatosAceptacion = { huellaVersion: string; nombre: string; documento: string; instante: string }

/** Constancia de aceptación: cualquiera puede recalcularla con los datos guardados. */
export const huellaAceptacion = (d: DatosAceptacion): string =>
  sha256(canonico({ huella: d.huellaVersion, nombre: d.nombre, documento: d.documento, instante: d.instante }))

/** Token del enlace del cliente: 128 bits en base64url (22 caracteres). */
export const nuevoToken = (): string => randomBytes(16).toString('base64url')

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/
export const esTokenValido = (t: unknown): t is string => typeof t === 'string' && TOKEN_RE.test(t)
