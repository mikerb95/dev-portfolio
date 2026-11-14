// Reparto de frentes entre las personas del equipo (RF-046).
//
// Puro y determinista: misma entrada, misma salida, sin azar ni reloj. Lo usan
// el reductor del tablero (en el servidor y en el navegador) y los tests.
//
// Dos regímenes, según alcance la gente para un frente por cabeza:
//  · Personas >= frentes: un frente por persona, emparejando las horas de
//    mayor a menor con el orden en que se sumaron. Quien sobra entra como apoyo
//    al frente más pesado, luego al siguiente, y así en rueda.
//  · Personas < frentes: voraz por horas. El frente más pesado va a quien
//    lleva menos carga. Es la heurística LPT (longest processing time): no
//    garantiza el óptimo, pero con 5 frentes queda a menos de un tercio del
//    mejor reparto posible y, sobre todo, es predecible para quien la mira.
//
// Los ajustes manuales vigentes (dueño que sigue en el equipo) se respetan:
// entran primero como carga fija y el resto se reparte alrededor.

export interface FrenteReparto {
  id: string
  horas: number
}

export interface EntradaReparto {
  /** Ids de las personas, en el orden en que se sumaron (desempata). */
  personas: string[]
  frentes: FrenteReparto[]
  /** frenteId -> personaId fijado a mano. Las entradas con dueño ausente se ignoran. */
  manuales?: Record<string, string>
}

export interface SalidaReparto {
  dueno: Record<string, string | null>
  apoyo: Record<string, string[]>
  /** Horas por persona. Un frente con apoyo reparte sus horas por partes iguales. */
  carga: Record<string, number>
}

/** Frentes de más a menos horas; a igual peso, el orden original. */
function porHorasDesc(frentes: FrenteReparto[]): FrenteReparto[] {
  return frentes
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.horas - a.f.horas || a.i - b.i)
    .map(({ f }) => f)
}

const redondear = (n: number) => Math.round(n * 100) / 100

export function repartir({ personas, frentes, manuales = {} }: EntradaReparto): SalidaReparto {
  const dueno: Record<string, string | null> = {}
  const apoyo: Record<string, string[]> = {}
  for (const f of frentes) {
    dueno[f.id] = null
    apoyo[f.id] = []
  }

  const presentes = new Set(personas)
  const fijos = frentes.filter((f) => manuales[f.id] && presentes.has(manuales[f.id]))
  for (const f of fijos) dueno[f.id] = manuales[f.id]
  const libres = porHorasDesc(frentes.filter((f) => !dueno[f.id]))

  if (personas.length > 0) {
    if (personas.length >= frentes.length) {
      // Un frente por persona: los libres van a quienes aún no tienen frente.
      const conFrente = new Set(Object.values(dueno).filter(Boolean))
      const sinFrente = personas.filter((p) => !conFrente.has(p))
      libres.forEach((f, i) => {
        // Si un ajuste manual le dio dos frentes a alguien, puede faltar gente
        // sin frente: el sobrante cae al voraz de abajo.
        if (i < sinFrente.length) dueno[f.id] = sinFrente[i]
      })
      const restantes = libres.filter((f) => !dueno[f.id])
      asignarVoraz(restantes, personas, frentes, dueno)

      // Personas extra como apoyo, en rueda por frentes de mayor a menor.
      const ocupadas = new Set(Object.values(dueno).filter(Boolean))
      const extra = personas.filter((p) => !ocupadas.has(p))
      const orden = porHorasDesc(frentes)
      extra.forEach((p, i) => {
        if (orden.length) apoyo[orden[i % orden.length].id].push(p)
      })
    } else {
      asignarVoraz(libres, personas, frentes, dueno)
    }
  }

  return { dueno, apoyo, carga: calcularCarga(personas, frentes, dueno, apoyo) }
}

function asignarVoraz(
  libres: FrenteReparto[],
  personas: string[],
  frentes: FrenteReparto[],
  dueno: Record<string, string | null>
): void {
  const carga = new Map(personas.map((p) => [p, 0]))
  for (const f of frentes) {
    const d = dueno[f.id]
    if (d && carga.has(d)) carga.set(d, carga.get(d)! + f.horas)
  }
  for (const f of porHorasDesc(libres)) {
    // Menor carga; a igual carga, quien se sumó primero.
    let elegido = personas[0]
    for (const p of personas) if (carga.get(p)! < carga.get(elegido)!) elegido = p
    dueno[f.id] = elegido
    carga.set(elegido, carga.get(elegido)! + f.horas)
  }
}

function calcularCarga(
  personas: string[],
  frentes: FrenteReparto[],
  dueno: Record<string, string | null>,
  apoyo: Record<string, string[]>
): Record<string, number> {
  const carga: Record<string, number> = Object.fromEntries(personas.map((p) => [p, 0]))
  for (const f of frentes) {
    const d = dueno[f.id]
    if (!d) continue
    const manos = [d, ...apoyo[f.id]]
    for (const p of manos) carga[p] = (carga[p] ?? 0) + f.horas / manos.length
  }
  for (const p of Object.keys(carga)) carga[p] = redondear(carga[p])
  return carga
}
