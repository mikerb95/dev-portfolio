import { describe, expect, it } from 'vitest'
import { COMPONENTES } from '../src/data/componentes'
import { findLayoutIssues, layout } from '../src/lib/uml-component'

describe.each(COMPONENTES)('componentes "$id"', (modelo) => {
  it('no tiene defectos de dibujo ni de notación', () => {
    expect(findLayoutIssues(modelo).map((i) => `${i.kind}: ${i.detail}`)).toEqual([])
  })

  it('dibuja una sola bola por interfaz provista, no una por consumidor', () => {
    const l = layout(modelo)
    const parejas = new Set(modelo.ensamblajes.map((e) => `${e.proveedor} ${e.interfaz}`))
    expect(l.interfaces).toHaveLength(parejas.size)

    const iface = l.interfaces.find((i) => i.interfaz === 'IEndpointsHTTP')
    expect(iface?.enchufes.length).toBeGreaterThan(1)
  })

  it('conecta cada enchufe con la bola de su interfaz', () => {
    for (const iface of layout(modelo).interfaces) {
      for (const e of iface.enchufes) {
        expect(e.hasta).toEqual(iface.bola)
      }
    }
  })

  it('nombra toda interfaz con la convención IAlgo', () => {
    for (const e of modelo.ensamblajes) expect(e.interfaz).toMatch(/^I[A-Z]/)
  })

  it('no describe despliegue: ningún componente nombra a su proveedor de infraestructura', () => {
    // El diagrama de componentes responde "qué ofrece y qué requiere cada
    // pieza"; dónde corre es la pregunta del diagrama de despliegue. Si aquí
    // vuelve a aparecer "Vercel" o "Turso", las dos páginas han vuelto a
    // solaparse, que es el defecto que este diagrama vino a corregir.
    const infraestructura = /vercel|turso|libsql|blob|github|ntfy|wompi|cron-job/i
    for (const c of modelo.componentes) {
      expect(`${c.nombre} ${c.detalle ?? ''}`).not.toMatch(infraestructura)
    }
  })
})
