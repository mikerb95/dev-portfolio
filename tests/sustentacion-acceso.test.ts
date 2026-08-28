// La puerta por contraseña del panel de sustentación.
//
// Lo que más importa aquí no es la firma, es el ALCANCE: esta llave es más
// débil que el OAuth a propósito, y lo único que la hace aceptable es que abra
// tres rutas y ninguna más. Si algún día alguien amplía esa lista sin pensarlo,
// el test de abajo se lo dice.

import { describe, expect, it } from 'vitest'
import {
  ACCESO_TTL_SEG,
  contrasenaCorrecta,
  debeOfrecerClave,
  esRutaDeSustentacion,
  firmarAcceso,
  verificarAcceso,
} from '../src/lib/sustentacion/acceso'

const SECRETO = 'un-secreto-de-prueba-suficientemente-largo'
const AHORA = 1_790_000_000_000

describe('alcance de la llave', () => {
  it('abre solo el escenario, el panel y el alta de sesión', () => {
    for (const p of ['/sustentacion', '/admin/sustentacion', '/api/admin/sustentacion/sesion']) {
      expect(esRutaDeSustentacion(p), p).toBe(true)
    }
  })

  it('NO abre nada más del panel', () => {
    // La lista negra que de verdad importa: si esta contraseña se filtra, lo
    // que NO puede tocar es la bóveda de secretos, los cobros, las finanzas,
    // los clientes ni los backups. Todo eso sigue detrás de GitHub.
    for (const p of [
      '/admin',
      '/admin/costs',
      '/admin/finances',
      '/admin/clients',
      '/admin/projects',
      '/admin/backup',
      '/admin/sessions',
      '/api/admin/projects',
      '/api/admin/services/42/secrets',
      '/api/admin/backup',
      '/cobrar',
      '/docs/presentacion',
    ]) {
      expect(esRutaDeSustentacion(p), p).toBe(false)
    }
  })

  it('no se amplía por prefijo', () => {
    // Con `startsWith` bastaría con que se añadiera una subruta cualquiera para
    // que esta contraseña la abriera sin que nadie lo hubiera decidido.
    expect(esRutaDeSustentacion('/admin/sustentacion/algo')).toBe(false)
    expect(esRutaDeSustentacion('/admin/sustentacion-secreto')).toBe(false)
    expect(esRutaDeSustentacion('/sustentacion/control')).toBe(false)
    expect(esRutaDeSustentacion('/api/admin/sustentacion/otra')).toBe(false)
  })

  it('la barra final no cambia el resultado', () => {
    expect(esRutaDeSustentacion('/admin/sustentacion/')).toBe(true)
  })
})

describe('contraseña', () => {
  it('acepta la configurada y rechaza el resto', () => {
    expect(contrasenaCorrecta('sustentacion2026', 'sustentacion2026')).toBe(true)
    expect(contrasenaCorrecta('sustentacion2025', 'sustentacion2026')).toBe(false)
    expect(contrasenaCorrecta('sustentacion2026 ', 'sustentacion2026')).toBe(false)
    expect(contrasenaCorrecta('SUSTENTACION2026', 'sustentacion2026')).toBe(false)
  })

  it('SIN variable configurada la puerta no existe', () => {
    // El fallo peligroso sería que la ausencia de configuración abriera en vez
    // de cerrar: un despliegue sin la variable aceptaría la cadena vacía.
    expect(contrasenaCorrecta('lo-que-sea', undefined)).toBe(false)
    expect(contrasenaCorrecta('lo-que-sea', null)).toBe(false)
    expect(contrasenaCorrecta('lo-que-sea', '')).toBe(false)
    expect(contrasenaCorrecta('', '')).toBe(false)
  })

  it('una contraseña vacía nunca vale', () => {
    expect(contrasenaCorrecta('', 'sustentacion2026')).toBe(false)
    expect(contrasenaCorrecta(null, 'sustentacion2026')).toBe(false)
    expect(contrasenaCorrecta(undefined, 'sustentacion2026')).toBe(false)
  })
})

describe('cookie de acceso', () => {
  it('vale mientras no caduque', () => {
    const t = firmarAcceso(SECRETO, AHORA)
    expect(verificarAcceso(t, SECRETO, AHORA + 1000)).toBe(true)
    expect(verificarAcceso(t, SECRETO, AHORA + ACCESO_TTL_SEG * 1000 - 1000)).toBe(true)
    expect(verificarAcceso(t, SECRETO, AHORA + ACCESO_TTL_SEG * 1000 + 1000)).toBe(false)
  })

  it('cubre de sobra una jornada', () => {
    // La sesión de sustentación dura 6 h; esta llave tiene que aguantar el día
    // sin obligarme a teclear la contraseña otra vez a mitad.
    expect(ACCESO_TTL_SEG).toBeGreaterThanOrEqual(6 * 60 * 60)
  })

  it('no se puede estirar la caducidad a mano', () => {
    const t = firmarAcceso(SECRETO, AHORA)
    const [, sig] = t.split('.')
    expect(verificarAcceso(`${AHORA + 10 ** 12}.${sig}`, SECRETO, AHORA + 1000)).toBe(false)
  })

  it('no vale firmada con otra clave, ni sin clave', () => {
    const t = firmarAcceso('otra-clave-distinta-y-larga', AHORA)
    expect(verificarAcceso(t, SECRETO, AHORA + 1000)).toBe(false)

    const bueno = firmarAcceso(SECRETO, AHORA)
    expect(verificarAcceso(bueno, '', AHORA + 1000)).toBe(false)
    expect(verificarAcceso(bueno, null, AHORA + 1000)).toBe(false)
  })

  it('rechaza basura sin lanzar', () => {
    for (const t of ['', '.', 'sinpunto', 'abc.def', `${AHORA}.`, '.firma', null, undefined]) {
      expect(() => verificarAcceso(t, SECRETO, AHORA), String(t)).not.toThrow()
      expect(verificarAcceso(t, SECRETO, AHORA), String(t)).toBe(false)
    }
  })

  it('no comparte firma con el pase del escenario', () => {
    // Prefijos distintos: una cookie de acceso no puede colarse como pase de
    // una sesión concreta ni al revés, aunque las dos salgan de la misma clave.
    const acceso = firmarAcceso(SECRETO, AHORA)
    const [exp] = acceso.split('.')
    // El pase del escenario firma `sust:pase:v1:<sessionId>:<exp>`; si los
    // dominios se solaparan, esta cookie verificaría allí con el mismo exp.
    expect(acceso.split('.')[1]).not.toBe(exp)
  })
})

describe('cuándo ofrecer la clave en /login', () => {
  it('la ofrece si el destino era el panel de la sustentación', () => {
    expect(debeOfrecerClave('/admin/sustentacion', 'sustentacion2026')).toBe(true)
    expect(debeOfrecerClave('/sustentacion', 'sustentacion2026')).toBe(true)
  })

  it('NO la ofrece en el login normal del panel', () => {
    // Anunciar en la pantalla de entrada general una llave con menos garantías
    // que el OAuth sería invitar a usarla para todo.
    for (const d of ['/entrar', '/admin', '/admin/costs', '/admin/projects', '/']) {
      expect(debeOfrecerClave(d, 'sustentacion2026'), d).toBe(false)
    }
  })

  it('NO la ofrece si no hay contraseña configurada', () => {
    // Un campo sin nada detrás manda a teclear contraseñas buenas que fallan.
    expect(debeOfrecerClave('/admin/sustentacion', undefined)).toBe(false)
    expect(debeOfrecerClave('/admin/sustentacion', null)).toBe(false)
    expect(debeOfrecerClave('/admin/sustentacion', '')).toBe(false)
  })

  it('un callbackUrl absoluto no cuela', () => {
    // `esRutaDeSustentacion` compara rutas exactas, así que una URL completa
    // (aunque apunte a nuestro propio dominio) no abre este formulario.
    expect(debeOfrecerClave('https://codebymike.tech/admin/sustentacion', 'x')).toBe(false)
    expect(debeOfrecerClave('//evil.example/admin/sustentacion', 'x')).toBe(false)
  })

  it('sin destino no se ofrece', () => {
    expect(debeOfrecerClave(null, 'sustentacion2026')).toBe(false)
    expect(debeOfrecerClave('', 'sustentacion2026')).toBe(false)
  })
})
