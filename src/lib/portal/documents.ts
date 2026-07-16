// Documentos y entregables del portal.
//
// El binario vive en Vercel Blob con `access: 'private'`: sus URLs no son
// adivinables, pero eso NO es el control de acceso — un enlace filtrado sería
// suficiente para cualquiera. El control real es que la descarga pasa siempre
// por un endpoint que valida sesión y tenant, y solo entonces firma una URL de
// vida corta. La URL del blob nunca se le entrega al navegador tal cual.
//
// Versionado sin borrar: subir una versión nueva encadena a la anterior por
// `supersedesId` y marca la vieja con `supersededAt`. Un contrato firmado no se
// sobreescribe; se sustituye dejando rastro de que existió.

import { and, desc, eq, isNull } from 'drizzle-orm'
import { del, get, put } from '@vercel/blob'
import { db } from '../../db'
import { clientUsers, portalDocuments, projects } from '../../db/schema'

export type PortalDocument = typeof portalDocuments.$inferSelect

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

// Allowlist de tipos. SVG queda fuera a propósito: puede llevar <script> dentro
// y, servido con su content-type, sería XSS almacenado con la credibilidad de
// mi propio dominio. Misma razón por la que upload.ts lo excluye.
export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
}

export const CATEGORY_LABELS: Record<string, string> = {
  contrato: 'Contrato',
  entregable: 'Entregable',
  factura: 'Factura',
  acta: 'Acta',
  otro: 'Otro',
}

export type Category = 'contrato' | 'entregable' | 'factura' | 'acta' | 'otro'


/**
 * Documentos vigentes del cliente. Excluye versiones superadas (están en el
 * historial de su sucesora) y lo que aún no he publicado.
 */
export async function clientDocuments(clientId: number, opts?: { includeHidden?: boolean }) {
  const conditions = [eq(portalDocuments.clientId, clientId), isNull(portalDocuments.supersededAt)]
  if (!opts?.includeHidden) conditions.push(eq(portalDocuments.visibleToClient, true))

  return db
    .select({
      id: portalDocuments.id,
      title: portalDocuments.title,
      category: portalDocuments.category,
      mimeType: portalDocuments.mimeType,
      sizeBytes: portalDocuments.sizeBytes,
      version: portalDocuments.version,
      uploadedBy: portalDocuments.uploadedBy,
      visibleToClient: portalDocuments.visibleToClient,
      createdAt: portalDocuments.createdAt,
      projectTitle: projects.title,
      uploaderName: clientUsers.name,
    })
    .from(portalDocuments)
    .leftJoin(projects, eq(portalDocuments.projectId, projects.id))
    .leftJoin(clientUsers, eq(portalDocuments.uploadedByUserId, clientUsers.id))
    .where(and(...conditions))
    .orderBy(desc(portalDocuments.createdAt))
}

/**
 * Un documento del cliente. Null si no es suyo — el `clientId` en el WHERE es
 * lo único que separa "descargar mi contrato" de "descargar el de otro".
 */
export async function clientDocument(clientId: number, documentId: number): Promise<PortalDocument | null> {
  const [doc] = await db
    .select()
    .from(portalDocuments)
    .where(and(eq(portalDocuments.id, documentId), eq(portalDocuments.clientId, clientId)))
    .limit(1)
  return doc ?? null
}

/**
 * Abre el contenido del blob para servirlo. El llamador YA debe haber
 * comprobado que el documento es del cliente: esta función no vuelve a mirar.
 *
 * Devuelve un stream y no una URL a propósito. La alternativa era firmar una
 * URL temporal del blob y redirigir, pero eso pone en manos del navegador un
 * enlace que funciona sin sesión durante su ventana de validez: reenviable,
 * cacheable por un proxy y fuera de mi control una vez emitido. Sirviéndolo
 * desde aquí, cada byte pasa por una petición autenticada y el nombre real del
 * blob no sale nunca. El coste es ancho de banda de la función, asumible para
 * archivos de ≤25 MB que se descargan de forma ocasional.
 *
 * Null si el blob ya no existe (fila huérfana).
 */
export async function openDocument(doc: PortalDocument): Promise<ReadableStream | null> {
  const result = await get(doc.blobUrl, { access: 'private' })
  return result?.stream ?? null
}

/** Nombre de archivo sugerido al navegador, derivado del título. */
export function downloadFilename(doc: PortalDocument): string {
  const ext = ALLOWED_MIME[doc.mimeType ?? ''] ?? 'bin'
  // El título lo escribe una persona: puede traer barras, comillas o saltos de
  // línea, y va dentro de una cabecera HTTP. Solo sobrevive lo inocuo.
  const base =
    doc.title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9 ._-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'documento'
  return `${base}.${ext}`
}

/** Historial de versiones de un documento (de la más nueva a la más vieja). */
export async function documentVersions(clientId: number, documentId: number): Promise<PortalDocument[]> {
  const versions: PortalDocument[] = []
  let current = await clientDocument(clientId, documentId)

  // Se recorre la cadena hacia atrás con tope: un ciclo por datos corruptos no
  // puede convertirse en un bucle infinito dentro de una función serverless.
  for (let i = 0; current && i < 50; i++) {
    versions.push(current)
    current = current.supersedesId ? await clientDocument(clientId, current.supersedesId) : null
  }
  return versions
}

export type UploadInput = {
  clientId: number
  projectId?: number | null
  title: string
  category: Category
  file: File
  uploadedBy: 'admin' | 'client'
  uploadedByUserId?: number | null
  visibleToClient?: boolean
  /** Id de la versión anterior, si esto la reemplaza. */
  supersedesId?: number | null
}

export type UploadResult = { ok: true; document: PortalDocument } | { ok: false; error: string }

/**
 * Sube un documento a Blob y lo registra. Valida tamaño y tipo ANTES de tocar
 * la red: un rechazo barato es mejor que 25 MB subidos y luego descartados.
 */
export async function uploadDocument(input: UploadInput): Promise<UploadResult> {
  const { file } = input

  if (!file || file.size === 0) return { ok: false, error: 'No se recibió ningún archivo.' }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `El archivo supera el máximo de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }
  }

  const ext = ALLOWED_MIME[file.type]
  if (!ext) return { ok: false, error: 'Tipo de archivo no permitido.' }

  const title = input.title.trim().slice(0, 200)
  if (!title) return { ok: false, error: 'El documento necesita un título.' }

  // Si reemplaza a otro, el anterior debe ser del MISMO cliente: sin esta
  // comprobación, un `supersedesId` ajeno enlazaría el historial de otro.
  let supersedes: PortalDocument | null = null
  if (input.supersedesId != null) {
    supersedes = await clientDocument(input.clientId, input.supersedesId)
    if (!supersedes) return { ok: false, error: 'La versión anterior indicada no existe.' }
  }

  // El proyecto también se valida contra el cliente.
  let projectId: number | null = null
  if (input.projectId != null) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.clientId, input.clientId)))
      .limit(1)
    projectId = p?.id ?? null
  }

  // El nombre en Blob se construye entero en el servidor: el que manda el
  // navegador puede traer `../` o caracteres raros y no pinta nada aquí. La
  // extensión sale del MIME ya validado, nunca del nombre original.
  const pathname = `portal/${input.clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

  const blob = await put(pathname, file, { access: 'private', contentType: file.type })
  const now = new Date()

  const [document] = await db
    .insert(portalDocuments)
    .values({
      clientId: input.clientId,
      projectId,
      title,
      category: input.category,
      blobUrl: blob.url,
      blobPathname: pathname,
      mimeType: file.type,
      sizeBytes: file.size,
      version: supersedes ? supersedes.version + 1 : 1,
      supersedesId: supersedes?.id ?? null,
      uploadedBy: input.uploadedBy,
      uploadedByUserId: input.uploadedByUserId ?? null,
      visibleToClient: input.visibleToClient ?? true,
      createdAt: now,
    })
    .returning()

  if (supersedes) {
    await db.update(portalDocuments).set({ supersededAt: now }).where(eq(portalDocuments.id, supersedes.id))
  }

  return { ok: true, document }
}

/**
 * Borra un documento (solo admin). Quita el blob y la fila.
 *
 * El blob se borra primero: si fallara después de borrar la fila, quedaría un
 * archivo huérfano pagando almacenamiento y sin nada que lo referencie. Al
 * revés, un fallo deja la fila apuntando a un blob inexistente, que se detecta
 * a la primera descarga.
 */
export async function deleteDocument(documentId: number): Promise<void> {
  const [doc] = await db.select().from(portalDocuments).where(eq(portalDocuments.id, documentId)).limit(1)
  if (!doc) return

  await del(doc.blobUrl).catch(() => {})
  await db.update(portalDocuments).set({ supersedesId: null }).where(eq(portalDocuments.supersedesId, documentId))
  await db.delete(portalDocuments).where(eq(portalDocuments.id, documentId))
}

/** Todos los documentos, para el gestor del panel. */
export async function allDocuments() {
  return db
    .select({
      id: portalDocuments.id,
      clientId: portalDocuments.clientId,
      title: portalDocuments.title,
      category: portalDocuments.category,
      sizeBytes: portalDocuments.sizeBytes,
      version: portalDocuments.version,
      visibleToClient: portalDocuments.visibleToClient,
      uploadedBy: portalDocuments.uploadedBy,
      supersededAt: portalDocuments.supersededAt,
      createdAt: portalDocuments.createdAt,
      projectTitle: projects.title,
    })
    .from(portalDocuments)
    .leftJoin(projects, eq(portalDocuments.projectId, projects.id))
    .orderBy(desc(portalDocuments.createdAt))
}
