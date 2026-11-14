// Validación de las operaciones que llegan a POST /api/hackaton/tablero.
//
// Va aparte del reductor para que el <script> de la página no cargue zod: el
// navegador solo construye operaciones que ya sabe válidas, y quien llame a la
// API a mano pasa por aquí antes de tocar el estado.

import { z } from 'zod'
import { PRIORIDADES } from '../../data/hackaton'
import { ESTADOS_TAREA, type Operacion } from './tablero'

const id = z.string().regex(/^[a-z0-9-]{1,40}$/)
// Sin caracteres de control: el texto se pinta con textContent, pero también
// viaja en el JSON exportado y en el título de la página.
const texto = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'caracteres no permitidos')
const prioridad = z.enum(PRIORIDADES as [string, ...string[]])
const horas = z.number().finite().min(0).max(24)

const esquema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('persona.agregar'), nombre: texto(40) }),
  z.object({ tipo: z.literal('persona.quitar'), id }),
  z.object({ tipo: z.literal('repartir'), modo: z.enum(['conservar', 'cero']) }),
  z.object({ tipo: z.literal('grupo.asignar'), grupo: id, persona: id.nullable() }),
  z.object({ tipo: z.literal('tarea.asignar'), tarea: id, persona: z.union([id, z.null(), z.literal('grupo')]) }),
  z.object({ tipo: z.literal('tarea.estado'), tarea: id, estado: z.enum(ESTADOS_TAREA as [string, ...string[]]) }),
  z.object({
    tipo: z.literal('tarea.editar'),
    tarea: id,
    titulo: texto(140).optional(),
    prioridad: prioridad.optional(),
    horas: horas.optional(),
  }),
  z.object({ tipo: z.literal('tarea.agregar'), grupo: id, titulo: texto(140), prioridad, horas }),
  z.object({ tipo: z.literal('tarea.borrar'), tarea: id }),
  z.object({ tipo: z.literal('reiniciar') }),
])

export function validarOperacion(bruto: unknown): Operacion | null {
  const r = esquema.safeParse(bruto)
  return r.success ? (r.data as Operacion) : null
}
