import { describe, it, expect } from 'vitest'
import { NIVELES } from '../src/data/testing'
import { CLASIFICACION, SUBSISTEMAS, INTEGRIDAD_LABEL } from '../src/data/vyv'

// vyv.ts referencia por id los niveles que viven en testing.ts. Ese enlace no
// lo protege TypeScript (ambos lados son `string`), y la página es SSR: un id
// mal escrito no rompería el build, devolvería un 500 en una ruta pública cada
// vez que alguien la visita. Estas pruebas lo convierten en un fallo de CI.

const idsDeNiveles = new Set(NIVELES.map((n) => n.id))

describe('vyv · integridad referencial con testing.ts', () => {
  it('toda CLASIFICACION apunta a un nivel que existe', () => {
    const huerfanos = CLASIFICACION.filter((c) => !idsDeNiveles.has(c.id)).map((c) => c.id)
    expect(huerfanos).toEqual([])
  })

  it('clasifica todos los niveles, sin dejar ninguno fuera', () => {
    const clasificados = new Set(CLASIFICACION.map((c) => c.id))
    const sinClasificar = NIVELES.filter((n) => !clasificados.has(n.id)).map((n) => n.id)
    // La página afirma "de esos N niveles, cuáles son verificación y cuáles
    // validación". Si aparece un nivel nuevo en testing.ts y nadie lo clasifica,
    // esa afirmación deja de ser cierta en silencio.
    expect(sinClasificar).toEqual([])
  })

  it('no clasifica el mismo nivel dos veces', () => {
    const ids = CLASIFICACION.map((c) => c.id)
    expect(ids).toHaveLength(new Set(ids).size)
  })
})

describe('vyv · subsistemas por nivel de integridad', () => {
  it('cada subsistema se cubre con niveles de prueba que existen', () => {
    const rotos = SUBSISTEMAS.flatMap((s) =>
      s.cubiertoPor.filter((id) => !idsDeNiveles.has(id)).map((id) => `${s.id} → ${id}`),
    )
    expect(rotos).toEqual([])
  })

  it('no repite ids de subsistema', () => {
    const ids = SUBSISTEMAS.map((s) => s.id)
    expect(ids).toHaveLength(new Set(ids).size)
  })

  it('todo subsistema declara al menos una tarea de V&V que lo cubre', () => {
    // Un subsistema sin ninguna cobertura declarada sería una fila que afirma un
    // nivel de integridad sin nada que lo respalde.
    const vacios = SUBSISTEMAS.filter((s) => s.cubiertoPor.length === 0).map((s) => s.id)
    expect(vacios).toEqual([])
  })

  it('usa solo niveles de integridad con etiqueta definida', () => {
    const sinEtiqueta = SUBSISTEMAS.filter((s) => !INTEGRIDAD_LABEL[s.nivel]).map((s) => s.id)
    expect(sinEtiqueta).toEqual([])
  })

  it('el contenido público no se atribuye la cobertura de código', () => {
    // vitest.config.ts mide cobertura solo sobre src/lib/**: ninguna página
    // .astro entra en ese porcentaje. Atribuírsela sería el tipo de dato falso
    // que esta misma página existe para evitar.
    const publico = SUBSISTEMAS.find((s) => s.id === 'contenido-publico')
    expect(publico?.cubiertoPor).not.toContain('cobertura')
  })
})
