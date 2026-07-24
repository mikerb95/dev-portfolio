import { describe, it, expect } from 'vitest'
import { sinSecretos, sinSecretosLista, sinValorCifrado, sinValorCifradoLista } from '../src/lib/vault'

// La bóveda solo puede salir por su endpoint de revelado bajo sesión admin.
// Estas pruebas fijan esa garantía en el punto donde antes dependía de que cada
// endpoint se acordara de blanquear el campo a mano.

const servicio = {
  id: 7,
  projectId: 3,
  name: 'Turso',
  category: 'database',
  secrets: 'a1b2:c3d4:e5f6...', // ciphertext AES-256-GCM
  notes: 'plan hobby',
}

const envVar = {
  id: 12,
  projectId: 3,
  key: 'TURSO_AUTH_TOKEN',
  value: 'f0e1:d2c3:b4a5...', // ciphertext
  environment: 'production',
}

describe('vault · sinSecretos', () => {
  it('quita el blob cifrado de la fila', () => {
    expect(sinSecretos(servicio)).not.toHaveProperty('secrets')
  })

  it('conserva intacto todo lo demás', () => {
    const out = sinSecretos(servicio)
    expect(out).toEqual({ id: 7, projectId: 3, name: 'Turso', category: 'database', notes: 'plan hobby' })
  })

  it('no muta la fila original', () => {
    const copia = { ...servicio }
    sinSecretos(servicio)
    // Si mutara, el revelado legítimo que corre después en el mismo request
    // encontraría la fila ya vacía.
    expect(servicio).toEqual(copia)
  })

  it('el secreto no sobrevive a JSON.stringify', () => {
    const json = JSON.stringify(sinSecretos(servicio))
    expect(json).not.toContain('a1b2')
    expect(json).not.toContain('secrets')
  })

  it('tolera una fila que ya viene sin el campo', () => {
    // En variable, no literal: TypeScript aplica excess property checking a los
    // literales frescos contra la restricción del genérico. Los callers reales
    // pasan filas de drizzle, que tampoco son literales.
    const fila = { id: 1 }
    expect(() => sinSecretos(fila)).not.toThrow()
  })

  it('redacta la lista entera, no solo el primero', () => {
    const out = sinSecretosLista([servicio, { ...servicio, id: 8 }])
    expect(out.every((f) => !('secrets' in f))).toBe(true)
  })
})

describe('vault · sinValorCifrado', () => {
  it('quita el valor cifrado pero deja la clave visible', () => {
    const out = sinValorCifrado(envVar)
    expect(out).not.toHaveProperty('value')
    // El nombre de la variable sí se muestra en el listado del panel; lo que
    // nunca sale es su contenido.
    expect(out.key).toBe('TURSO_AUTH_TOKEN')
  })

  it('el valor no sobrevive a JSON.stringify', () => {
    expect(JSON.stringify(sinValorCifrado(envVar))).not.toContain('f0e1')
  })

  it('redacta la lista entera', () => {
    const out = sinValorCifradoLista([envVar, { ...envVar, id: 13 }])
    expect(out.every((f) => !('value' in f))).toBe(true)
  })

  it('no toca un campo `secrets` ajeno ni viceversa', () => {
    // Son entidades distintas a propósito: una redacción genérica por nombre de
    // campo borraría `value` en tablas donde es un dato inocuo.
    expect(sinValorCifrado({ value: 'x', secrets: 'y' })).toHaveProperty('secrets')
    expect(sinSecretos({ value: 'x', secrets: 'y' })).toHaveProperty('value')
  })
})
