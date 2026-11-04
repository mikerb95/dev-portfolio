import { describe, expect, it } from 'vitest'
import { serviciosHero } from '../src/lib/hero-servicios'
import { MARCAS_POR_SERVICIO, serviciosPortada } from '../src/lib/servicios-portada'
import { CAPACITACION, ENTREGA, PAQUETES_WEB, REGLAS, formatearMonto } from '../src/data/tarifario'

// Sección "Qué te resuelvo" de la portada (RF-042): reemplazó al bento técnico.
// Lo que importa es que hable el idioma del cliente y que no diga ninguna cifra
// distinta de la del hero ni de la del tarifario.

describe('sección Qué te resuelvo', () => {
  const es = serviciosPortada('es')
  const en = serviciosPortada('en')

  it('cubre los mismos cinco servicios que el hero, igual en los dos idiomas', () => {
    const ids = es.tarjetas.map((s) => s.id)
    expect([...ids].sort()).toEqual(serviciosHero('es').map((s) => s.id).sort())
    expect(en.tarjetas.map((s) => s.id)).toEqual(ids)
  })

  it('no queda ningún {marcador} sin rellenar', () => {
    for (const { tarjetas, cierre } of [es, en]) {
      for (const s of tarjetas) expect(s.dato, s.id).not.toMatch(/[{}]/)
      for (const g of cierre.garantias) expect(g).not.toMatch(/[{}]/)
    }
  })

  it('los precios son los del tarifario, en la moneda de cada idioma', () => {
    const dato = (lista: typeof es, id: string) => lista.tarjetas.find((s) => s.id === id)!.dato
    expect(dato(es, 'web')).toContain(formatearMonto(PAQUETES_WEB[0]!.desde.COP, 'COP'))
    expect(dato(en, 'web')).toContain(formatearMonto(PAQUETES_WEB[0]!.desde.USD, 'USD'))
    expect(dato(es, 'software')).toContain(formatearMonto(REGLAS.minimo.COP, 'COP'))
    expect(dato(en, 'software')).toContain(formatearMonto(REGLAS.minimo.USD, 'USD'))
    for (const lista of [es, en]) {
      expect(dato(lista, 'capacitacion')).toContain(formatearMonto(CAPACITACION.sesionCOP, 'COP'))
    }
  })

  it('el cierre dice el anticipo y la garantía del tarifario', () => {
    for (const { cierre } of [es, en]) {
      const texto = cierre.garantias.join(' ')
      expect(texto).toContain(String(Math.round(REGLAS.anticipo * 100)))
      expect(texto).toContain(String(ENTREGA.garantiaDias))
    }
  })

  it('cada tarjeta trae prueba: marcas reales o una frase, nunca nada', () => {
    for (const { tarjetas } of [es, en]) {
      for (const s of tarjetas) {
        expect(s.marcas.length > 0 || s.prueba.length > 0, s.id).toBe(true)
        expect(s.marcas.length, s.id).toBe(MARCAS_POR_SERVICIO[s.id].length)
        for (const m of s.marcas) expect(m.ficha, `${s.id}/${m.nombre}`).toBeTruthy()
      }
    }
  })

  it('no vuelve la jerga técnica que espantaba clientes', () => {
    const jerga = /\b(tRPC|GraphQL|REST|uptime|SLO|presupuesto de error|error budget|inbound|brief|fit|timing|full-stack|Core Web Vitals)\b/i
    for (const { tarjetas, cierre } of [es, en]) {
      const textos = [
        ...tarjetas.flatMap((s) => [s.etiqueta, s.problema, s.solucion, s.dato, s.prueba, s.enlace]),
        cierre.titulo,
        ...cierre.garantias,
        cierre.cta,
      ]
      for (const texto of textos) expect(texto).not.toMatch(jerga)
    }
  })
})
