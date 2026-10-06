// La puerta del PIN de Cotiza (RF-220).
//
// Lo que más importa aquí es el ALCANCE: un PIN de cuatro dígitos es una llave
// débil a propósito, y lo único que la hace aceptable es que abra Cotiza y
// nada más. Si alguien ensancha los patrones sin pensarlo, estos tests se lo
// dicen.

import { describe, expect, it } from 'vitest'
import {
  CIERRE_MS,
  COTIZA_TTL_SEG,
  FALLOS_GLOBALES,
  FALLOS_POR_IP,
  cierraLaPuerta,
  decidirIntento,
  esRutaDeCotiza,
  firmarAccesoCotiza,
  pinBienFormado,
  problemaDePin,
  verificarAccesoCotiza,
  versionDePin,
} from '../src/lib/cotiza/acceso'
import { firmarAcceso } from '../src/lib/sustentacion/acceso'
import { isPrivateCanonicalPath } from '../src/i18n/routing'

const SECRETO = 'un-secreto-de-prueba-suficientemente-largo'
const AHORA = 1_790_000_000_000
const V1 = versionDePin('scrypt$32768$8$1$salA$hashA')
const V2 = versionDePin('scrypt$32768$8$1$salB$hashB')

describe('alcance del PIN', () => {
  it('abre la página de Cotiza, sus fichas y sus APIs', () => {
    for (const p of ['/admin/cotiza', '/admin/cotiza/42', '/admin/cotiza/nuevo', '/api/admin/cotiza/encargos', '/api/admin/cotiza/encargos/7']) {
      expect(esRutaDeCotiza(p), p).toBe(true)
    }
  })

  it('no abre nada más del panel', () => {
    for (const p of [
      '/admin',
      '/admin/settings',
      '/admin/plano',
      '/admin/clients',
      '/admin/finances',
      '/api/admin/settings',
      // Ajustes del PIN: nunca debe abrirlos el propio PIN.
      '/api/admin/settings/cotiza-pin',
      '/api/admin/services/1/secrets',
      '/cobrar',
    ]) {
      expect(esRutaDeCotiza(p), p).toBe(false)
    }
  })

  it('no se deja engañar por prefijos parecidos ni por saltos de directorio', () => {
    for (const p of [
      '/admin/cotizaciones',
      '/admin/cotiza-vieja',
      '/admin/cotiza/../settings',
      '/admin/cotiza/%2e%2e',
      '/admin/cotiza/a/b',
      '/admin/cotiza//settings',
      '/admin/cotiza/',
      '/api/admin/cotiza',
      '/api/admin/cotizar/x',
      '/api/admin/cotiza/../settings',
      '/x/admin/cotiza',
      '/ADMIN/cotiza',
    ]) {
      expect(esRutaDeCotiza(p), p).toBe(false)
    }
  })

  it('/cotiza no existe bajo /en: es ruta privada para i18n', () => {
    expect(isPrivateCanonicalPath('/cotiza')).toBe(true)
    expect(isPrivateCanonicalPath('/cotiza/entrar')).toBe(true)
  })
})

describe('cookie firmada', () => {
  it('vale recién emitida con el mismo PIN', () => {
    const t = firmarAccesoCotiza(SECRETO, V1, AHORA)
    expect(verificarAccesoCotiza(t, SECRETO, V1, AHORA + 1000)).toBe(true)
  })

  it('cambiar el PIN invalida las cookies emitidas', () => {
    const t = firmarAccesoCotiza(SECRETO, V1, AHORA)
    expect(verificarAccesoCotiza(t, SECRETO, V2, AHORA + 1000)).toBe(false)
  })

  it('sin PIN guardado, sin secreto o con otro secreto, no vale', () => {
    const t = firmarAccesoCotiza(SECRETO, V1, AHORA)
    expect(verificarAccesoCotiza(t, SECRETO, null, AHORA)).toBe(false)
    expect(verificarAccesoCotiza(t, '', V1, AHORA)).toBe(false)
    expect(verificarAccesoCotiza(t, 'otro-secreto', V1, AHORA)).toBe(false)
  })

  it('vence a las doce horas', () => {
    const t = firmarAccesoCotiza(SECRETO, V1, AHORA)
    expect(verificarAccesoCotiza(t, SECRETO, V1, AHORA + COTIZA_TTL_SEG * 1000 - 1)).toBe(true)
    expect(verificarAccesoCotiza(t, SECRETO, V1, AHORA + COTIZA_TTL_SEG * 1000)).toBe(false)
  })

  it('reescribir el vencimiento rompe la firma', () => {
    const t = firmarAccesoCotiza(SECRETO, V1, AHORA)
    const [, f] = t.split('.')
    expect(verificarAccesoCotiza(`${AHORA + 2 * 3600_000}.${f}`, SECRETO, V1, AHORA)).toBe(false)
  })

  it('rechaza un vencimiento más lejano que el TTL aunque la firma cuadre', () => {
    const lejos = firmarAccesoCotiza(SECRETO, V1, AHORA + 30 * 24 * 3600_000)
    expect(verificarAccesoCotiza(lejos, SECRETO, V1, AHORA)).toBe(false)
  })

  it('el acceso de la sustentación no sirve como cookie de Cotiza', () => {
    const sust = firmarAcceso(SECRETO, AHORA)
    expect(verificarAccesoCotiza(sust, SECRETO, V1, AHORA)).toBe(false)
  })

  it('tokens malformados se rechazan sin lanzar', () => {
    for (const t of ['', '.', 'abc', '123', '.firma', '12e3.x', '-5.x', `${AHORA + 1000}.`, 'NaN.x']) {
      expect(verificarAccesoCotiza(t, SECRETO, V1, AHORA), t).toBe(false)
    }
  })
})

describe('frenos', () => {
  it('deja probar mientras la IP no llegue al límite', () => {
    expect(decidirIntento({ fallosIp: 0, cerradaHastaMs: null }, AHORA)).toEqual({ tipo: 'permitido' })
    expect(decidirIntento({ fallosIp: FALLOS_POR_IP - 1, cerradaHastaMs: null }, AHORA)).toEqual({ tipo: 'permitido' })
  })

  it('frena la IP al quinto fallo', () => {
    expect(decidirIntento({ fallosIp: FALLOS_POR_IP, cerradaHastaMs: null }, AHORA)).toEqual({ tipo: 'ip_frenada' })
  })

  it('con la puerta cerrada nadie prueba, ni una IP limpia', () => {
    const d = decidirIntento({ fallosIp: 0, cerradaHastaMs: AHORA + CIERRE_MS }, AHORA)
    expect(d).toEqual({ tipo: 'puerta_cerrada', reintentarEnSeg: CIERRE_MS / 1000 })
  })

  it('un cierre vencido ya no cuenta', () => {
    expect(decidirIntento({ fallosIp: 0, cerradaHastaMs: AHORA }, AHORA)).toEqual({ tipo: 'permitido' })
  })

  it('cierra la puerta exactamente una vez, en el décimo fallo', () => {
    expect(cierraLaPuerta(FALLOS_GLOBALES - 1)).toBe(false)
    expect(cierraLaPuerta(FALLOS_GLOBALES)).toBe(true)
    expect(cierraLaPuerta(FALLOS_GLOBALES + 1)).toBe(false)
  })
})

describe('forma del PIN', () => {
  it('solo cuatro dígitos ASCII', () => {
    expect(pinBienFormado('4827')).toBe(true)
    for (const p of ['482', '48270', ' 482', '48 7', 'abcd', '١٢٣٤', '４８２７', 4827, null, undefined]) {
      expect(pinBienFormado(p), String(p)).toBe(false)
    }
  })

  it('al fijarlo rechaza los primeros que probaría cualquiera', () => {
    for (const p of ['0000', '7777', '1234', '3456', '9876', '4321', '1212', '9090']) {
      expect(problemaDePin(p), p).not.toBeNull()
    }
    for (const p of ['4827', '1357', '2580', '1122', '7391']) {
      expect(problemaDePin(p), p).toBeNull()
    }
  })
})
