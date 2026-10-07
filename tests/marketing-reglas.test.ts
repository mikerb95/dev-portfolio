import { describe, it, expect } from 'vitest'
import {
  cupoRestante,
  inicioDiaCO,
  normalizarEmail,
  proximaApertura,
  puedeRecibir,
  ventanaLegal,
} from '../src/lib/marketing/reglas'
import { cuerpoAHtml, cuerpoATexto, urlSegura, validarCampana } from '../src/lib/marketing/contenido'
import { hashToken, tokenBaja, verificarTokenBaja } from '../src/lib/marketing/tokens'

// Hora de Colombia (UTC-5, sin horario de verano) → instante UTC.
const co = (iso: string) => new Date(`${iso}-05:00`)

describe('ventanaLegal (Ley 2300)', () => {
  it('abre de lunes a viernes de 7:00 a 19:00', () => {
    // Martes 6 oct 2026
    expect(ventanaLegal(co('2026-10-06T06:59')).abierta).toBe(false)
    expect(ventanaLegal(co('2026-10-06T07:00')).abierta).toBe(true)
    expect(ventanaLegal(co('2026-10-06T18:59')).abierta).toBe(true)
    expect(ventanaLegal(co('2026-10-06T19:00')).abierta).toBe(false)
  })

  it('el sábado solo de 8:00 a 15:00', () => {
    expect(ventanaLegal(co('2026-10-10T07:30')).abierta).toBe(false)
    expect(ventanaLegal(co('2026-10-10T08:00')).abierta).toBe(true)
    expect(ventanaLegal(co('2026-10-10T14:59')).abierta).toBe(true)
    expect(ventanaLegal(co('2026-10-10T15:00')).abierta).toBe(false)
  })

  it('cierra domingos y festivos aunque sea mediodía', () => {
    expect(ventanaLegal(co('2026-10-11T12:00'))).toMatchObject({ abierta: false, motivo: 'Domingo' })
    // Lunes 12 oct 2026: Día de la Raza (festivo trasladado a lunes).
    const festivo = ventanaLegal(co('2026-10-12T12:00'))
    expect(festivo.abierta).toBe(false)
    expect(festivo.abierta === false && festivo.motivo).toMatch(/Festivo/)
  })

  it('usa la hora de Colombia aunque el servidor esté en UTC', () => {
    // 23:30 UTC del martes = 18:30 en Colombia: todavía abierto.
    expect(ventanaLegal(new Date('2026-10-06T23:30:00Z')).abierta).toBe(true)
    // 00:30 UTC del miércoles = 19:30 del martes en Colombia: cerrado, y no
    // por ser "miércoles temprano".
    const v = ventanaLegal(new Date('2026-10-07T00:30:00Z'))
    expect(v).toMatchObject({ abierta: false, motivo: 'Después del horario permitido' })
  })
})

describe('proximaApertura', () => {
  it('devuelve el mismo instante si ya está abierto', () => {
    const t = co('2026-10-06T10:00')
    expect(proximaApertura(t)).toBe(t)
  })

  it('salta el domingo y el lunes festivo hasta el martes a las 7:00', () => {
    // Sábado 10 oct a las 16:00 → domingo cerrado → lunes 12 festivo → martes 13.
    expect(proximaApertura(co('2026-10-10T16:00')).toISOString()).toBe(co('2026-10-13T07:00').toISOString())
  })
})

describe('puedeRecibir y cupo', () => {
  const ahora = co('2026-10-13T10:00')
  it('una promoción por semana como mucho', () => {
    expect(puedeRecibir(null, ahora)).toBe(true)
    expect(puedeRecibir(new Date(ahora.getTime() - 6 * 86_400_000), ahora)).toBe(false)
    expect(puedeRecibir(new Date(ahora.getTime() - 7 * 86_400_000), ahora)).toBe(true)
  })

  it('el cupo nunca es negativo', () => {
    expect(cupoRestante(10, 50)).toBe(40)
    expect(cupoRestante(60, 50)).toBe(0)
  })

  it('el día empieza a medianoche de Colombia', () => {
    expect(inicioDiaCO(new Date('2026-10-07T03:00:00Z')).toISOString()).toBe('2026-10-06T05:00:00.000Z')
  })
})

describe('normalizarEmail', () => {
  it('minúsculas y sin espacios; rechaza basura', () => {
    expect(normalizarEmail('  Ana@Ejemplo.CO ')).toBe('ana@ejemplo.co')
    expect(normalizarEmail('no-es-correo')).toBeNull()
    expect(normalizarEmail(42)).toBeNull()
    expect(normalizarEmail(`${'a'.repeat(200)}@x.co`)).toBeNull()
  })
})

describe('contenido de la campaña', () => {
  const base = { asunto: 'Hola', titulo: 'Título', cuerpo: 'Texto' }

  it('exige asunto, título y texto', () => {
    expect(validarCampana({ asunto: '', titulo: '', cuerpo: '' })).toHaveLength(3)
    expect(validarCampana(base)).toEqual([])
  })

  it('el botón va completo o no va, y solo con https', () => {
    expect(validarCampana({ ...base, botonTexto: 'Ver' })).toHaveLength(1)
    expect(validarCampana({ ...base, botonTexto: 'Ver', botonUrl: 'http://x.co' })[0]).toMatch(/https/)
    expect(validarCampana({ ...base, botonTexto: 'Ver', botonUrl: 'https://x.co' })).toEqual([])
  })

  it('rechaza enlaces del cuerpo que no sean https', () => {
    expect(validarCampana({ ...base, cuerpo: 'Mira [esto](javascript:alert(1))' }).join()).toMatch(/https/)
  })

  it('escapa el HTML y solo genera negrita, enlaces y saltos', () => {
    const html = cuerpoAHtml('<script>x</script> **fuerte**\nlínea dos\n\n[sitio](https://codebymike.net/?a=1&b=2)', '#000')
    expect(html).toHaveLength(2)
    expect(html[0]).toBe('&lt;script&gt;x&lt;/script&gt; <strong>fuerte</strong><br>línea dos')
    expect(html[1]).toBe('<a href="https://codebymike.net/?a=1&amp;b=2" style="color:#000;">sitio</a>')
  })

  it('un enlace inseguro queda como texto plano, sin <a>', () => {
    expect(cuerpoAHtml('[clic](http://malo.co)', '#000')[0]).toBe('clic')
  })

  it('el texto plano conserva la URL', () => {
    expect(cuerpoATexto('**Hola** [sitio](https://x.co)')).toEqual(['Hola sitio (https://x.co)'])
  })

  it('urlSegura solo deja pasar https', () => {
    expect(urlSegura('https://x.co/a')).toBe('https://x.co/a')
    expect(urlSegura('javascript:alert(1)')).toBeNull()
    expect(urlSegura('nada')).toBeNull()
  })
})

describe('tokens', () => {
  it('el token de baja es por suscriptor y no se puede reutilizar con otro id', () => {
    const t = tokenBaja(7, 'secreto')
    expect(verificarTokenBaja(7, t, 'secreto')).toBe(true)
    expect(verificarTokenBaja(8, t, 'secreto')).toBe(false)
    expect(verificarTokenBaja(7, t, 'otro-secreto')).toBe(false)
    expect(verificarTokenBaja(7, null, 'secreto')).toBe(false)
    expect(verificarTokenBaja(0, t, 'secreto')).toBe(false)
  })

  it('el hash de confirmación es estable y no es el token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).not.toContain('abc')
  })
})
