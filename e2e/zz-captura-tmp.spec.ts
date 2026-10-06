import { encode } from '@auth/core/jwt'
import { createClient } from '@libsql/client'
import { randomUUID } from 'node:crypto'
import { E2E } from '../playwright.config'
import { expect, test } from './fixtures'

// TEMPORAL: capturas de la tarjeta de cambio. Se borra al terminar.
const db = createClient({ url: E2E.mainDbUrl })
const OUT = process.env.CAPTURAS!
test.use({ launchOptions: { args: ['--use-angle=gl-egl'] } })

const vistaHito = {
  tipo: 'cambio',
  rotulo: 'Hito · visible para el cliente',
  titulo: 'Diseño aprobado',
  contexto: 'Reservas · Norte SAS',
  cambios: [
    { campo: 'Estado', antes: 'En curso', despues: 'Completado' },
    { campo: 'Fecha límite', antes: '10 oct 2026', despues: '15 oct 2026' },
  ],
  avisos: [
    'Norte SAS ve este hito en su portal: el cambio le aparece apenas lo apruebes.',
    'Al completarlo, le llega a Norte SAS un aviso por correo y en el portal.',
  ],
  boton: 'Aprobar y guardar',
  nota: 'Lo que ves arriba es lo que verá el cliente.',
}
const vistaSeg = {
  tipo: 'cambio',
  rotulo: 'Seguimiento nuevo',
  titulo: 'Llamé a Laura por el diseño',
  contexto: 'Norte SAS · Reservas',
  cambios: [
    { campo: 'Tipo', antes: null, despues: 'Llamada' },
    { campo: 'Qué', antes: null, despues: 'Llamé a Laura por el diseño' },
    { campo: 'Pendiente', antes: null, despues: 'Mandar la segunda versión con el logo nuevo' },
    { campo: 'Para el', antes: null, despues: '20 oct 2026' },
    { campo: 'Cierra el pendiente', antes: 'Llamar a Laura', despues: 'Hecho' },
  ],
  avisos: [],
  boton: 'Aprobar y anotar',
  nota: 'Queda en tu seguimiento. El cliente no lo ve.',
}

const vistaProp = {
  tipo: 'cambio',
  rotulo: 'Propuesta nueva en Plano · borrador',
  titulo: 'Tienda de La Espiga',
  contexto: 'Cliente nuevo (no está en el panel)',
  cambios: [
    { campo: 'Lo que lee la IA de Plano', antes: null, despues: '[10:02] Laura: Hola Mike, tengo una panadería y quiero vender mis tortas por internet.\n[10:03] Laura: Que la gente pague con PSE y me llegue el pedido. Mi número es [teléfono oculto].\n[10:06] Laura: Unos 30 productos, sin inventario por ahora.' },
    { campo: 'Largo del texto', antes: null, despues: '231 caracteres' },
  ],
  avisos: ['Al aprobar, la IA de Plano lee la conversación para elegir los componentes. Cuesta unos centavos y se suma al tope diario del asistente.'],
  boton: 'Aprobar y crear',
  nota: 'Queda en borrador en Plano. Revisarla y enviarla sigue siendo tuyo.',
}

for (const [nombre, vista, pregunta] of [
  ['propuesta', vistaProp, 'Cotízame esto que me escribió Laura'],
  ['hito', vistaHito, 'Marca como completado el hito de diseño de Reservas y muévelo al 15'],
  ['seguimiento', vistaSeg, 'Anota que llamé a Laura y que le mando la segunda versión el 20'],
] as const) {
  for (const [disp, viewport] of [['escritorio', { width: 1440, height: 1000 }], ['movil', { width: 390, height: 844 }]] as const) {
    test(`${nombre} ${disp}`, async ({ page, context }) => {
      await page.setViewportSize(viewport)
      const token = await encode({
        token: { name: 'nadie-e2e', sub: 'e2e-cap', login: 'nadie-e2e', sid: `e2e-cap-${randomUUID()}`, authTime: Date.now() },
        secret: E2E.authSecret,
        salt: 'authjs.session-token',
      })
      await context.addCookies([{ name: 'authjs.session-token', value: token, url: E2E.baseURL, httpOnly: true }])
      const id = randomUUID()
      const ahora = Math.floor(Date.now() / 1000)
      await db.execute({
        sql: `INSERT INTO asistente_conversaciones (id, creada, actualizada, estado, pregunta, mensajes, propuesta) VALUES (?, ?, ?, 'esperando_aprobacion', ?, ?, ?)`,
        args: [
          id, ahora, ahora, pregunta,
          JSON.stringify([{ role: 'user', content: pregunta }, { role: 'assistant', content: [{ type: 'text', text: 'Te dejé el cambio listo para revisar.' }] }]),
          JSON.stringify({ origen: `${vista.rotulo}: ${vista.titulo}`, motivo: '', herramienta: 'x', vista, entrada: {}, toolUseId: 't', resultadosPrevios: [] }),
        ],
      })
      await page.goto(`/admin?c=${id}`)
      const tarjeta = page.locator('.turno-tarjeta')
      await expect(tarjeta).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(800)
      await tarjeta.screenshot({ path: `${OUT}/${nombre}-${disp}.png` })
      await db.execute({ sql: 'DELETE FROM asistente_conversaciones WHERE id = ?', args: [id] })
    })
  }
}
