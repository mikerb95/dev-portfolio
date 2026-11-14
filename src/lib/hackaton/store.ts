// Persistencia del tablero de la hackatón (RF-047). Solo servidor.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { hackatonTableros, hackatonTokens } from '../../db/schema'
import { aplicar, estadoInicial, ErrorTablero, type Estado, type Operacion } from './tablero'

export const TABLERO_ID = 'defacc-2026'

export interface Leido {
  estado: Estado
  version: number
}

/** Estado guardado, o el inicial (versión 0) si nadie ha escrito todavía. */
export async function leerTablero(id = TABLERO_ID): Promise<Leido> {
  const [fila] = await db.select().from(hackatonTableros).where(eq(hackatonTableros.id, id)).limit(1)
  if (!fila) return { estado: estadoInicial(), version: 0 }
  return { estado: JSON.parse(fila.estado) as Estado, version: fila.version }
}

const REINTENTOS = 5

/**
 * Aplica una operación con compare-and-swap: lee, aplica y guarda solo si
 * nadie escribió en medio. Si alguien se adelantó, vuelve a leer y reaplica la
 * MISMA operación sobre el estado nuevo, así marcar una tarea no deshace la
 * persona que otro acaba de sumar. Lanza ErrorTablero si la regla no se cumple.
 */
export async function escribirTablero(op: Operacion, id = TABLERO_ID): Promise<Leido> {
  for (let intento = 0; intento < REINTENTOS; intento++) {
    const { estado, version } = await leerTablero(id)
    const nuevo = aplicar(estado, op)
    const json = JSON.stringify(nuevo)
    const ahora = new Date()

    if (version === 0) {
      // Primera escritura: el INSERT falla por la PK si otro llegó antes.
      const ok = await db
        .insert(hackatonTableros)
        .values({ id, estado: json, version: 1, actualizado: ahora })
        .onConflictDoNothing()
        .returning({ version: hackatonTableros.version })
      if (ok.length) return { estado: nuevo, version: 1 }
      continue
    }

    const ok = await db
      .update(hackatonTableros)
      .set({ estado: json, version: version + 1, actualizado: ahora })
      .where(and(eq(hackatonTableros.id, id), eq(hackatonTableros.version, version)))
      .returning({ version: hackatonTableros.version })
    if (ok.length) return { estado: nuevo, version: version + 1 }
  }
  throw new ErrorTablero('Hay muchos cambios a la vez. Intenta de nuevo en un segundo.')
}

// ── Enlaces del equipo ─────────────────────────────────────────────────────

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{32,64}$/

/**
 * Crea un enlace nuevo y revoca los anteriores: si un enlace se filtra, el
 * remedio es generar otro, y eso no sirve si el viejo sigue abriendo.
 * Devuelve el token en claro UNA vez; en la base solo queda su hash.
 */
export async function generarToken(tablero = TABLERO_ID): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  const ahora = new Date()
  await db
    .update(hackatonTokens)
    .set({ revocado: ahora })
    .where(and(eq(hackatonTokens.tablero, tablero), isNull(hackatonTokens.revocado)))
  await db.insert(hackatonTokens).values({ tablero, hash: hashToken(token), creado: ahora })
  return token
}

/** ¿El token abre la escritura de este tablero? Falla cerrado ante cualquier error. */
export async function tokenValido(token: string | null | undefined, tablero = TABLERO_ID): Promise<boolean> {
  if (!token || !FORMATO_TOKEN.test(token)) return false
  try {
    const hash = hashToken(token)
    const [fila] = await db
      .select({ hash: hackatonTokens.hash })
      .from(hackatonTokens)
      .where(and(eq(hackatonTokens.hash, hash), eq(hackatonTokens.tablero, tablero), isNull(hackatonTokens.revocado)))
      .limit(1)
    if (!fila) return false
    // La búsqueda ya es por igualdad; la comparación en tiempo constante es
    // defensa en profundidad por si el índice cambia algún día.
    return timingSafeEqual(Buffer.from(fila.hash), Buffer.from(hash))
  } catch {
    return false
  }
}
