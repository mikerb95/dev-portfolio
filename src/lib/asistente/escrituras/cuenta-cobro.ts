// Escritura del asistente: crear una cuenta de cobro en BORRADOR (RF-210,
// fase 4 del plan). Decisión de Mike del 6 oct 2026: el asistente la deja en
// borrador y emitirla sigue siendo un clic suyo en /admin/cuentas-cobro/<id>.
//
// Dos tiempos, como el bloqueo del analista:
//  1. `preparar` arma lo que Mike ve para decidir: cliente, líneas, subtotal,
//     retenciones, neto y lo que falta para poder emitirla. Todas las cifras
//     salen de computeCuentaCobro, nunca del modelo (principio 3 del plan).
//  2. `crear` corre solo después del "Aprobar" y reutiliza createCuentaCobro,
//     la misma función que el formulario del panel.
//
// El modelo elige cliente, proyecto, conceptos y valores; nunca ve el NIT ni la
// dirección del deudor. La validación los lee aquí, en el servidor, y al
// modelo solo le llega "falta el NIT del deudor", sin el valor.
//
// Importa `src/db`: solo servidor.

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { clients, projects } from '../../../db/schema'
import { createCuentaCobro, loadEmisorYConfig, type SaveCuentaCobroInput } from '../../cuentas-cobro-db'
import { computeCuentaCobro, parseDeudor, parseFechaCalendario, validateCuentaCobro, type ConceptoId } from '../../cuentas-cobro'
import { centavos } from '../herramientas/tipos'

export const NOMBRE_CREAR_CUENTA = 'crear_cuenta_cobro'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export const esquemaCuentaCobro = z.object({
  clienteId: z.number().int().positive().describe('Id del cliente (sale de la herramienta clientes)'),
  proyectoId: z.number().int().positive().optional().describe('Id del proyecto, si el cobro es de un proyecto de ese cliente'),
  conceptos: z
    .array(
      z.object({
        descripcion: z.string().trim().min(1).max(300).describe('Qué se cobra en esta línea'),
        cantidad: z.number().positive().max(100_000).describe('Cantidad (1 si es un valor único)'),
        valorUnitario: z.number().min(0).max(1_000_000_000).describe('Valor unitario en PESOS colombianos, tal como lo dijo Mike'),
      })
    )
    .min(1)
    .max(20)
    .describe('Líneas de la cuenta'),
  concepto: z.string().trim().min(1).max(500).describe('Concepto detallado del servicio, en una o dos frases'),
  retenciones: z
    .array(z.enum(['honorarios', 'servicios', 'reteica']))
    .optional()
    .describe('Retenciones que practica el cliente, solo si Mike las nombró. Por defecto ninguna'),
  vence: z.string().regex(FECHA).optional().describe('Fecha límite de pago AAAA-MM-DD, si Mike la dio'),
  ciudad: z.string().trim().max(120).optional().describe('Ciudad de expedición; por defecto la del emisor'),
  periodoDesde: z.string().regex(FECHA).optional().describe('Inicio del periodo cobrado AAAA-MM-DD'),
  periodoHasta: z.string().regex(FECHA).optional().describe('Fin del periodo cobrado AAAA-MM-DD'),
  notas: z.string().trim().max(1000).optional().describe('Notas para el documento'),
})

export type EntradaCuentaCobro = z.infer<typeof esquemaCuentaCobro>

export const DESCRIPCION_CREAR_CUENTA =
  'Crea una cuenta de cobro en BORRADOR para un cliente. No se ejecuta sola: Mike ve la cuenta calculada (totales, retenciones y lo que falta para emitirla) y decide si la aprueba. Los totales los calcula el servidor; tú solo das las líneas con su valor en pesos. Busca antes el id del cliente (y del proyecto, si aplica) con las herramientas de lectura.'

export type VistaCuentaCobro = {
  tipo: 'cuenta_cobro'
  cliente: { id: number; nombre: string }
  proyecto: { id: number; titulo: string } | null
  concepto: string
  ciudad: string | null
  vence: string | null
  periodo: { desde: string | null; hasta: string | null } | null
  lineas: { descripcion: string; cantidad: number; valorUnitario: string; total: string }[]
  subtotal: ReturnType<typeof centavos>
  retenciones: { nombre: string; valor: ReturnType<typeof centavos>; aplicada: boolean; motivo: string | null }[]
  neto: ReturnType<typeof centavos>
  /** Lo que validateCuentaCobro pide para poder EMITIR. El borrador se crea igual. */
  faltantesParaEmitir: string[]
}

type Preparada = { ok: true; input: SaveCuentaCobroInput; vista: VistaCuentaCobro } | { ok: false; error: string }

/** Revisa la entrada contra la base y calcula la cuenta. No escribe nada. */
export async function prepararCuentaCobro(entrada: unknown): Promise<Preparada> {
  const parsed = esquemaCuentaCobro.safeParse(entrada ?? {})
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const e = parsed.data

  const [cliente] = await db
    .select({ id: clients.id, nombre: clients.name, empresa: clients.company, billingInfo: clients.billingInfo })
    .from(clients)
    .where(eq(clients.id, e.clienteId))
    .limit(1)
  if (!cliente) return { ok: false, error: `No existe ningún cliente con id ${e.clienteId}. Búscalo con la herramienta clientes.` }

  let proyecto: VistaCuentaCobro['proyecto'] = null
  if (e.proyectoId) {
    // El proyecto tiene que ser de ESE cliente: una cuenta a nombre de uno con
    // el proyecto de otro sería un documento que nadie puede pagar.
    const [p] = await db
      .select({ id: projects.id, titulo: projects.title })
      .from(projects)
      .where(and(eq(projects.id, e.proyectoId), eq(projects.clientId, cliente.id)))
      .limit(1)
    if (!p) return { ok: false, error: `El proyecto ${e.proyectoId} no existe o no es de ${cliente.nombre}.` }
    proyecto = p
  }

  for (const [campo, valor] of [['vence', e.vence], ['periodoDesde', e.periodoDesde], ['periodoHasta', e.periodoHasta]] as const) {
    if (valor && !parseFechaCalendario(valor)) return { ok: false, error: `${campo}: "${valor}" no es una fecha válida.` }
  }

  const { emisor, config } = await loadEmisorYConfig()
  const items = e.conceptos.map((c) => ({ description: c.descripcion, quantity: c.cantidad, unitCents: Math.round(c.valorUnitario * 100) }))
  const retenciones = [...new Set(e.retenciones ?? [])] as ConceptoId[]
  const ciudad = e.ciudad || emisor.ciudad || null
  const t = computeCuentaCobro(items, retenciones, config)
  if (t.totalCents <= 0) return { ok: false, error: 'El total de la cuenta tiene que ser mayor que cero.' }

  const faltantes = validateCuentaCobro({
    docType: 'cuenta_cobro',
    concept: e.concepto,
    city: ciudad,
    items,
    emisor,
    deudor: parseDeudor(cliente.nombre, cliente.empresa, cliente.billingInfo),
  })

  const input: SaveCuentaCobroInput = {
    clientId: cliente.id,
    projectId: proyecto?.id ?? null,
    items,
    retenciones,
    concept: e.concepto,
    city: ciudad,
    periodStart: parseFechaCalendario(e.periodoDesde),
    periodEnd: parseFechaCalendario(e.periodoHasta),
    notes: e.notas || null,
    dueAt: parseFechaCalendario(e.vence),
  }

  return {
    ok: true,
    input,
    vista: {
      tipo: 'cuenta_cobro',
      cliente: { id: cliente.id, nombre: cliente.empresa || cliente.nombre },
      proyecto,
      concepto: e.concepto,
      ciudad,
      vence: e.vence ?? null,
      periodo: e.periodoDesde || e.periodoHasta ? { desde: e.periodoDesde ?? null, hasta: e.periodoHasta ?? null } : null,
      lineas: items.map((i) => ({
        descripcion: i.description,
        cantidad: i.quantity,
        valorUnitario: centavos(i.unitCents, 'COP').texto,
        total: centavos(Math.round(i.quantity * i.unitCents), 'COP').texto,
      })),
      subtotal: centavos(t.subtotalCents, 'COP'),
      retenciones: t.retentions.map((r) => ({
        nombre: r.labelCorto,
        valor: centavos(r.valueCents, 'COP'),
        aplicada: r.applied,
        motivo: r.motivo ?? null,
      })),
      neto: centavos(t.netCents, 'COP'),
      faltantesParaEmitir: faltantes,
    },
  }
}

/** Crea el borrador. Solo se llama tras la aprobación de Mike. */
export async function crearCuentaCobroAprobada(entrada: unknown) {
  // Se prepara otra vez y no se reutiliza la vista guardada: entre la
  // propuesta y el clic pudo borrarse el cliente o cambiar una tarifa.
  const p = await prepararCuentaCobro(entrada)
  if (!p.ok) return p
  const cuenta = await createCuentaCobro(p.input)
  return {
    ok: true as const,
    datos: {
      creada: true,
      id: cuenta.id,
      numero: cuenta.number,
      estado: 'borrador',
      cliente: p.vista.cliente.nombre,
      total: p.vista.subtotal,
      neto: p.vista.neto,
      enlace: `/admin/cuentas-cobro/${cuenta.id}`,
      faltantesParaEmitir: p.vista.faltantesParaEmitir,
      siguientePaso:
        p.vista.faltantesParaEmitir.length > 0
          ? 'Antes de emitirla hay que completar lo que falta (en Ajustes o en la ficha del cliente). Emitirla y enviarla lo hace Mike desde el enlace.'
          : 'Está lista para emitir. Emitirla y enviarla lo hace Mike desde el enlace.',
    },
  }
}
