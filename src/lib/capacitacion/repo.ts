import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  decks,
  trainingAccessCodes,
  trainingPrograms,
  trainingResources,
} from '../../db/schema'
import { codigoUtilizable, normalizeAccessCode } from './access'
import { parseLista, type Nivel, type TipoRecurso, type Visibilidad } from './tipos'

export type Recurso = typeof trainingResources.$inferSelect
export type Programa = typeof trainingPrograms.$inferSelect
export type Codigo = typeof trainingAccessCodes.$inferSelect

/** Recurso listo para pintar: listas ya parseadas y el deck resuelto. */
export type RecursoVista = Omit<Recurso, 'topics'> & {
  topics: string[]
  programaTitulo: string | null
  deckSlides: number | null
}

export type ProgramaVista = Omit<Programa, 'outcomes' | 'modules'> & {
  outcomes: string[]
  modules: string[]
}

export const aVistaPrograma = (p: Programa): ProgramaVista => ({
  ...p,
  outcomes: parseLista(p.outcomes),
  modules: parseLista(p.modules),
})

/** Programas del catálogo público, ordenados como se muestran en la landing. */
export async function listarProgramasPublicos(): Promise<ProgramaVista[]> {
  const rows = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.isPublic, true))
    .orderBy(asc(trainingPrograms.sortOrder), asc(trainingPrograms.id))
  return rows.map(aVistaPrograma)
}

export async function listarProgramas(): Promise<ProgramaVista[]> {
  const rows = await db
    .select()
    .from(trainingPrograms)
    .orderBy(asc(trainingPrograms.sortOrder), asc(trainingPrograms.id))
  return rows.map(aVistaPrograma)
}

export async function obtenerProgramaPorSlug(slug: string): Promise<ProgramaVista | null> {
  const [row] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.slug, slug))
    .limit(1)
  return row ? aVistaPrograma(row) : null
}

/**
 * Banco de recursos. `conPase` decide si entran los `con_codigo`; el filtro
 * viaja en el WHERE y no en el render para que un recurso restringido no
 * llegue nunca al HTML de quien no tiene pase.
 */
export async function listarRecursos(opts: {
  conPase?: boolean
  incluirBorradores?: boolean
  programaId?: number
  tipo?: TipoRecurso
  nivel?: Nivel
} = {}): Promise<RecursoVista[]> {
  const filtros = []
  if (!opts.incluirBorradores) {
    filtros.push(inArray(trainingResources.visibility, visibilidadesVisibles(!!opts.conPase)))
  }
  if (opts.programaId) filtros.push(eq(trainingResources.programId, opts.programaId))
  if (opts.tipo) filtros.push(eq(trainingResources.kind, opts.tipo))
  if (opts.nivel) filtros.push(eq(trainingResources.level, opts.nivel))

  const rows = await db
    .select({
      recurso: trainingResources,
      programaTitulo: trainingPrograms.title,
      deckSlides: decks.slideCount,
    })
    .from(trainingResources)
    .leftJoin(trainingPrograms, eq(trainingResources.programId, trainingPrograms.id))
    .leftJoin(decks, eq(trainingResources.deckId, decks.id))
    .where(filtros.length > 0 ? and(...filtros) : undefined)
    .orderBy(asc(trainingResources.sortOrder), desc(trainingResources.publishedAt), desc(trainingResources.id))

  return rows.map((r) => ({
    ...r.recurso,
    topics: parseLista(r.recurso.topics),
    programaTitulo: r.programaTitulo ?? null,
    deckSlides: r.deckSlides ?? null,
  }))
}

export async function obtenerRecursoPorSlug(
  slug: string,
  opts: { conPase?: boolean; incluirBorradores?: boolean } = {}
): Promise<RecursoVista | null> {
  const filtros = [eq(trainingResources.slug, slug)]
  if (!opts.incluirBorradores) {
    filtros.push(inArray(trainingResources.visibility, visibilidadesVisibles(!!opts.conPase)))
  }

  const [row] = await db
    .select({
      recurso: trainingResources,
      programaTitulo: trainingPrograms.title,
      deckSlides: decks.slideCount,
    })
    .from(trainingResources)
    .leftJoin(trainingPrograms, eq(trainingResources.programId, trainingPrograms.id))
    .leftJoin(decks, eq(trainingResources.deckId, decks.id))
    .where(and(...filtros))
    .limit(1)

  if (!row) return null
  return {
    ...row.recurso,
    topics: parseLista(row.recurso.topics),
    programaTitulo: row.programaTitulo ?? null,
    deckSlides: row.deckSlides ?? null,
  }
}

export async function obtenerRecursoPorId(id: number): Promise<RecursoVista | null> {
  const [row] = await db.select().from(trainingResources).where(eq(trainingResources.id, id)).limit(1)
  if (!row) return null
  return { ...row, topics: parseLista(row.topics), programaTitulo: null, deckSlides: null }
}

/**
 * Contador de vistas. Fire-and-forget e incrementado en SQL (no leer-sumar-
 * escribir): dos lectores simultáneos deben contar dos, y una métrica no vale
 * una condición de carrera ni, mucho menos, tumbar la página que mide.
 */
export function registrarVista(id: number): void {
  db.update(trainingResources)
    .set({ views: sql`${trainingResources.views} + 1` })
    .where(eq(trainingResources.id, id))
    .catch((err) => console.error('[capacitacion] no se pudo contar la vista', err))
}

/** Canje de un código de grupo. Devuelve el id si sirve, o null. */
export async function canjearCodigo(input: string, now = new Date()): Promise<Codigo | null> {
  const code = normalizeAccessCode(input)
  const [row] = await db
    .select()
    .from(trainingAccessCodes)
    .where(eq(trainingAccessCodes.code, code))
    .limit(1)

  if (!row || !codigoUtilizable(row, now)) return null

  await db
    .update(trainingAccessCodes)
    .set({ uses: sql`${trainingAccessCodes.uses} + 1`, lastUsedAt: now })
    .where(eq(trainingAccessCodes.id, row.id))

  return row
}

/** ¿El código del pase sigue vivo? Se comprueba en cada request con pase. */
export async function codigoSigueVivo(codeId: number, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select()
    .from(trainingAccessCodes)
    .where(eq(trainingAccessCodes.id, codeId))
    .limit(1)
  // El tope de usos limita cuántas veces se canjea, no cuántas veces se lee
  // con un pase ya emitido: quien canjeó no debe quedarse fuera porque otro
  // agotó el cupo después.
  return codigoUtilizable(row ? { ...row, maxUses: null } : null, now)
}

export async function listarCodigos(): Promise<Codigo[]> {
  return db.select().from(trainingAccessCodes).orderBy(desc(trainingAccessCodes.id))
}

/** Cifras del módulo para la cabecera del panel. */
export async function metricas() {
  const [recursos] = await db
    .select({
      total: sql<number>`count(*)`,
      publicos: sql<number>`sum(case when ${trainingResources.visibility} = 'publico' then 1 else 0 end)`,
      conCodigo: sql<number>`sum(case when ${trainingResources.visibility} = 'con_codigo' then 1 else 0 end)`,
      borradores: sql<number>`sum(case when ${trainingResources.visibility} = 'borrador' then 1 else 0 end)`,
      vistas: sql<number>`coalesce(sum(${trainingResources.views}), 0)`,
    })
    .from(trainingResources)

  const [programas] = await db
    .select({
      total: sql<number>`count(*)`,
      publicos: sql<number>`sum(case when ${trainingPrograms.isPublic} = 1 then 1 else 0 end)`,
    })
    .from(trainingPrograms)

  const [codigos] = await db
    .select({
      total: sql<number>`count(*)`,
      canjes: sql<number>`coalesce(sum(${trainingAccessCodes.uses}), 0)`,
      revocados: sql<number>`sum(case when ${trainingAccessCodes.revokedAt} is not null then 1 else 0 end)`,
    })
    .from(trainingAccessCodes)

  const masVistos = await db
    .select({
      title: trainingResources.title,
      slug: trainingResources.slug,
      views: trainingResources.views,
    })
    .from(trainingResources)
    .where(isNotNull(trainingResources.publishedAt))
    .orderBy(desc(trainingResources.views))
    .limit(5)

  return { recursos, programas, codigos, masVistos }
}
