// Guion del "banco de ensayo" del hero de /lab.
//
// La pieza reproduce los cinco experimentos que registra lab_experiments (los
// cuatro ataques de src/pages/api/admin/lab/payments/attack.ts y la caída de
// BD de src/pages/api/admin/lab/chaos/experiment.ts) sobre un modelo en memoria
// de la pasarela. El guion NO está escrito a mano: sale de correr ese modelo,
// y el modelo decide con las mismas reglas que el código real:
//   · idempotencia: la llave es UNIQUE (createPaymentIdempotent)
//   · duplicado: mismo tx + mismo estado ya registrado (applyGatewayEvent)
//   · transición legal: canTransition de payments-state.ts, importado tal cual
//   · concurrencia optimista: UPDATE ... WHERE version = leída; si no escribe,
//     relee y vuelve a evaluar
//   · atomicidad: lo que se escribe dentro de la transacción se deshace entero
// Si alguien cambia la máquina de estados, el guion cambia con ella (y los
// tests de tests/motion-lab.test.ts dicen si el veredicto sigue en pie).
//
// Módulo puro: sin DOM ni BD.

import { canTransition, type PaymentStatus } from '../payments-state'

export const EXPERIMENTOS = [
  'payments:double_click',
  'payments:duplicate_webhook',
  'payments:out_of_order',
  'payments:race_condition',
  'chaos:db_fail_midtx',
] as const
export type Experimento = (typeof EXPERIMENTOS)[number]

export const EMISORES = ['navegador', 'pasarela', 'caos'] as const
export type Emisor = (typeof EMISORES)[number]

/** Las defensas, en el orden en que un evento las cruza. */
export const GUARDAS = ['llave', 'visto', 'legal', 'version', 'tx'] as const
export type Guarda = (typeof GUARDAS)[number]

/** Los estados que la pieza dibuja: los que tocan los cinco experimentos. */
export const ESTADOS = ['created', 'pending', 'approved', 'declined'] as const
export type Estado = (typeof ESTADOS)[number]

export type Registro = {
  /** Filas en `payments` para este experimento. */
  pagos: number
  estado: Estado | null
  version: number
  /** Eventos que cambiaron el estado / eventos recibidos. */
  aplicados: number
  recibidos: number
  /** Escrito dentro de una transacción que aún no hace COMMIT. */
  tentativo: boolean
}

/** Clave de texto (diccionario lab.motion.banco.lecturas) y sus variables. */
export type Lectura = { clave: string; vars?: Record<string, string | number> }

export type Paso = { t: number } & (
  | { tipo: 'sale'; token: string; emisor: Emisor; etiqueta: string }
  | { tipo: 'guarda'; token: string; guarda: Guarda; veredicto: 'pasa' | 'frena' | 'aviso'; lectura: Lectura }
  | { tipo: 'transicion'; token: string; de: Estado | null; a: Estado; aplicada: boolean; tentativa?: boolean }
  | { tipo: 'vuelve'; token: string; emisor: Emisor; etiqueta: string }
  | { tipo: 'absorbe'; token: string }
  | { tipo: 'descarta'; token: string }
  | { tipo: 'caida' }
  | { tipo: 'revierte'; de: Estado; a: Estado }
  | { tipo: 'registro'; registro: Registro }
  | { tipo: 'fin'; ok: boolean }
)

export type Guion = {
  id: Experimento
  /** Lectura de reposo de cada emisor en este experimento. */
  emisores: Partial<Record<Emisor, Lectura>>
  inicial: Registro
  pasos: Paso[]
  final: Registro
  /** La misma condición que usa el experimento real para darse por superado. */
  ok: boolean
  duracion: number
}

// Ritmo del guion, en segundos. Viajar es más lento que decidir: el ojo tiene
// que seguir al evento hasta la defensa, y la decisión se lee en la defensa.
const DUR = { viaje: 0.75, decide: 0.7, transicion: 0.75, simultaneo: 0.12, cierre: 1.6 }

// ── Modelo de la pasarela ─────────────────────────────────────────────────

type Pago = { ref: string; llave: string; estado: PaymentStatus; version: number }
type Evento = { tx: string; estado: PaymentStatus; duplicado: boolean; aplicado: boolean }

class Pasarela {
  pagos = new Map<string, Pago>()
  eventos: Evento[] = []
  private n = 0

  /** createPaymentIdempotent: la llave es UNIQUE; repetirla devuelve la fila existente. */
  checkout(llave: string): { pago: Pago; repetido: boolean } {
    const previo = this.pagos.get(llave)
    if (previo) return { pago: previo, repetido: true }
    this.n += 1
    const pago = { ref: `PAY-${String(this.n).padStart(4, '0')}`, llave, estado: 'created' as PaymentStatus, version: 0 }
    this.pagos.set(llave, pago)
    return { pago, repetido: false }
  }

  unico(): Pago {
    const [p] = [...this.pagos.values()]
    if (!p) throw new Error('sin pago')
    return p
  }

  registro(tentativo = false): Registro {
    const p = [...this.pagos.values()][0]
    return {
      pagos: this.pagos.size,
      estado: (p?.estado as Estado | undefined) ?? null,
      version: p?.version ?? 0,
      aplicados: this.eventos.filter((e) => e.aplicado).length,
      recibidos: this.eventos.length,
      tentativo,
    }
  }
}

/**
 * applyGatewayEvent partido en sus momentos observables, para poder intercalar
 * dos webhooks como en una carrera real. Cada `yield` es algo que la pieza
 * dibuja; el orden y las condiciones son los de src/lib/payments.ts.
 */
type Micro =
  | { tipo: 'visto'; duplicado: boolean }
  | { tipo: 'legal'; de: PaymentStatus; permitida: boolean }
  | { tipo: 'escribe'; leida: number; actual: number; escrita: boolean }
  | { tipo: 'final'; aplicado: boolean; duplicado: boolean; fueraDeOrden: boolean }

function* aplicarEvento(gw: Pasarela, tx: string, estado: PaymentStatus): Generator<Micro, void, void> {
  const pago = gw.unico()
  const duplicado = gw.eventos.some((e) => e.tx === tx && e.estado === estado && !e.duplicado)
  yield { tipo: 'visto', duplicado }
  if (duplicado) {
    gw.eventos.push({ tx, estado, duplicado: true, aplicado: false })
    yield { tipo: 'final', aplicado: false, duplicado: true, fueraDeOrden: false }
    return
  }
  // Reintentos por concurrencia optimista (MAX_RETRIES en payments.ts). Tres
  // vueltas sobran: en los experimentos compiten como mucho dos eventos.
  for (let intento = 0; intento < 3; intento++) {
    const leida = pago.version
    const de = pago.estado
    if (de === estado) {
      gw.eventos.push({ tx, estado, duplicado: false, aplicado: false })
      yield { tipo: 'final', aplicado: false, duplicado: true, fueraDeOrden: false }
      return
    }
    const permitida = canTransition(de, estado)
    yield { tipo: 'legal', de, permitida }
    if (!permitida) {
      gw.eventos.push({ tx, estado, duplicado: false, aplicado: false })
      yield { tipo: 'final', aplicado: false, duplicado: false, fueraDeOrden: true }
      return
    }
    // Entre la lectura y la escritura puede colarse otro evento: el generador
    // se detiene aquí y quien lo conduce decide si el otro escribe antes.
    yield { tipo: 'escribe', leida, actual: pago.version, escrita: pago.version === leida }
    if (pago.version === leida) {
      pago.estado = estado
      pago.version += 1
      gw.eventos.push({ tx, estado, duplicado: false, aplicado: true })
      yield { tipo: 'final', aplicado: true, duplicado: false, fueraDeOrden: false }
      return
    }
  }
}

// ── Construcción del guion ────────────────────────────────────────────────

class Autor {
  pasos: Paso[] = []
  t = 0
  readonly gw: Pasarela
  constructor(gw: Pasarela) {
    this.gw = gw
  }
  en<T extends Paso['tipo']>(tipo: T, datos: Omit<Extract<Paso, { tipo: T }>, 't' | 'tipo'>, dur = 0) {
    this.pasos.push({ t: +this.t.toFixed(3), tipo, ...datos } as Paso)
    this.t += dur
  }
  registro(tentativo = false) {
    this.en('registro', { registro: this.gw.registro(tentativo) })
  }
}

/** Traduce un momento del generador a su paso del guion. */
function emitir(a: Autor, token: string, m: Micro, estado: Estado, tx: string, dur: number) {
  if (m.tipo === 'visto') {
    a.en('guarda', {
      token,
      guarda: 'visto',
      veredicto: m.duplicado ? 'frena' : 'pasa',
      lectura: { clave: m.duplicado ? 'vistoSi' : 'vistoNo', vars: { tx, estado } },
    }, dur)
  } else if (m.tipo === 'legal') {
    a.en('guarda', {
      token,
      guarda: 'legal',
      veredicto: m.permitida ? 'pasa' : 'frena',
      lectura: { clave: m.permitida ? 'legalSi' : 'legalNo', vars: { de: m.de, a: estado } },
    }, dur)
    if (!m.permitida) a.en('transicion', { token, de: m.de as Estado, a: estado, aplicada: false }, DUR.transicion)
  } else if (m.tipo === 'escribe') {
    a.en('guarda', {
      token,
      guarda: 'version',
      veredicto: m.escrita ? 'pasa' : 'aviso',
      lectura: m.escrita
        ? { clave: 'versionOk', vars: { v: m.leida } }
        : { clave: 'versionConflicto', vars: { leida: m.leida, actual: m.actual } },
    }, dur)
  }
}

type Final = Extract<Micro, { tipo: 'final' }>

/** Conduce un evento del webhook por todas las defensas hasta su resultado. */
function conducir(a: Autor, token: string, gen: Generator<Micro, void, void>, estado: Estado, tx: string): Final | null {
  for (;;) {
    const { value: m, done } = gen.next()
    if (done || !m) return null
    if (m.tipo === 'final') return m
    emitir(a, token, m, estado, tx, DUR.decide)
  }
}

function dobleClic(): Guion {
  const gw = new Pasarela()
  const a = new Autor(gw)
  const inicial = gw.registro()
  const llave = 'k-7f3a'
  a.en('sale', { token: 'c1', emisor: 'navegador', etiqueta: 'clic 1' }, DUR.simultaneo)
  a.en('sale', { token: 'c2', emisor: 'navegador', etiqueta: 'clic 2' }, DUR.viaje)
  const r1 = gw.checkout(llave)
  a.en('guarda', { token: 'c1', guarda: 'llave', veredicto: 'pasa', lectura: { clave: 'llaveNueva', vars: { k: llave } } }, DUR.decide)
  a.en('transicion', { token: 'c1', de: null, a: 'created', aplicada: true }, DUR.transicion)
  a.registro()
  const r2 = gw.checkout(llave)
  a.en('guarda', {
    token: 'c2',
    guarda: 'llave',
    veredicto: r2.repetido ? 'frena' : 'pasa',
    lectura: { clave: r2.repetido ? 'llaveRepetida' : 'llaveNueva', vars: { k: llave, ref: r2.pago.ref } },
  }, DUR.decide)
  a.en('vuelve', { token: 'c1', emisor: 'navegador', etiqueta: r1.pago.ref }, DUR.simultaneo)
  a.en('vuelve', { token: 'c2', emisor: 'navegador', etiqueta: r2.pago.ref }, DUR.viaje)
  // attackDoubleClick: 1 fila en BD y la misma referencia para los dos.
  const ok = gw.pagos.size === 1 && r1.pago.ref === r2.pago.ref
  return cerrar(a, 'payments:double_click', inicial, ok, { navegador: { clave: 'emisorDobleClic' } })
}

function conPago(): Pasarela {
  const gw = new Pasarela()
  gw.checkout('k-lab')
  return gw
}

function webhookDuplicado(): Guion {
  const gw = conPago()
  const a = new Autor(gw)
  const inicial = gw.registro()
  const tx = 'tx-91'
  a.en('sale', { token: 'w1', emisor: 'pasarela', etiqueta: 'approved' }, DUR.viaje)
  const f1 = conducir(a, 'w1', aplicarEvento(gw, tx, 'approved'), 'approved', tx)
  if (f1?.aplicado) a.en('transicion', { token: 'w1', de: 'created', a: 'approved', aplicada: true }, DUR.transicion)
  a.en('absorbe', { token: 'w1' })
  a.registro()
  a.t += 0.35
  a.en('sale', { token: 'w2', emisor: 'pasarela', etiqueta: 'approved' }, DUR.viaje)
  const f2 = conducir(a, 'w2', aplicarEvento(gw, tx, 'approved'), 'approved', tx)
  a.en('descarta', { token: 'w2' })
  a.registro()
  // attackDuplicateWebhook: la 1.ª aplica, la 2.ª es duplicado y el estado queda aprobado.
  const ok = !!f1?.aplicado && !!f2?.duplicado && !f2.aplicado && gw.unico().estado === 'approved'
  return cerrar(a, 'payments:duplicate_webhook', inicial, ok, { pasarela: { clave: 'emisorDuplicado' } })
}

function fueraDeOrden(): Guion {
  const gw = conPago()
  const a = new Autor(gw)
  const inicial = gw.registro()
  const tx = 'tx-44'
  a.en('sale', { token: 'w1', emisor: 'pasarela', etiqueta: 'approved' }, DUR.viaje)
  const f1 = conducir(a, 'w1', aplicarEvento(gw, tx, 'approved'), 'approved', tx)
  if (f1?.aplicado) a.en('transicion', { token: 'w1', de: 'created', a: 'approved', aplicada: true }, DUR.transicion)
  a.en('absorbe', { token: 'w1' })
  a.registro()
  a.t += 0.35
  a.en('sale', { token: 'w2', emisor: 'pasarela', etiqueta: 'pending' }, DUR.viaje)
  const f2 = conducir(a, 'w2', aplicarEvento(gw, tx, 'pending'), 'pending', tx)
  a.en('descarta', { token: 'w2' })
  a.registro()
  // attackOutOfOrder: approved aplica, el pending tardío no, y el estado no retrocede.
  const ok = !!f1?.aplicado && !!f2?.fueraDeOrden && !f2.aplicado && gw.unico().estado === 'approved'
  return cerrar(a, 'payments:out_of_order', inicial, ok, { pasarela: { clave: 'emisorTardio' } })
}

/**
 * Dos webhooks contradictorios a la vez. Ambos leen la versión 0 y ambos ven
 * una transición legal; el que escribe primero gana y el otro choca con la
 * versión, relee y la máquina de estados lo frena. En la base real el ganador
 * lo decide quién llega primero al UPDATE; aquí se alterna para enseñar que el
 * resultado es el mismo gane quien gane.
 */
function carrera(gana: 'approved' | 'declined' = 'approved'): Guion {
  const gw = conPago()
  const a = new Autor(gw)
  const inicial = gw.registro()
  const pierde: 'approved' | 'declined' = gana === 'approved' ? 'declined' : 'approved'
  const tok = { approved: 'wa', declined: 'wd' } as const
  const tx = { approved: 'tx-a1', declined: 'tx-d1' } as const
  const gen = { approved: aplicarEvento(gw, tx.approved, 'approved'), declined: aplicarEvento(gw, tx.declined, 'declined') }

  a.en('sale', { token: tok[gana], emisor: 'pasarela', etiqueta: gana }, DUR.simultaneo)
  a.en('sale', { token: tok[pierde], emisor: 'pasarela', etiqueta: pierde }, DUR.viaje)
  // Los dos cruzan "visto" y "legal" leyendo la misma versión: hasta ahí nada
  // los distingue. Paso a paso, alternados.
  let fGana: Final | null = null
  for (let i = 0; i < 2; i++) {
    const mg = gen[gana].next().value
    const mp = gen[pierde].next().value
    if (mg && mg.tipo !== 'final') emitir(a, tok[gana], mg, gana, tx[gana], DUR.simultaneo)
    if (mp && mp.tipo !== 'final') emitir(a, tok[pierde], mp, pierde, tx[pierde], DUR.decide)
  }
  // El ganador llega primero al UPDATE y lo encuentra en la versión que leyó…
  const eg = gen[gana].next().value
  if (eg && eg.tipo !== 'final') emitir(a, tok[gana], eg, gana, tx[gana], DUR.decide)
  const rg = gen[gana].next().value
  if (rg && rg.tipo === 'final') fGana = rg
  a.en('transicion', { token: tok[gana], de: 'created', a: gana, aplicada: !!fGana?.aplicado }, DUR.transicion)
  a.en('absorbe', { token: tok[gana] })
  a.registro()
  // …y el perdedor, que también leyó la versión 0, choca, relee y ahora la
  // máquina de estados ve un terminal: no hay transición legal desde ahí.
  const fPierde = conducir(a, tok[pierde], gen[pierde], pierde, tx[pierde])
  a.en('descarta', { token: tok[pierde] })
  a.registro()
  const aplicados = [fGana, fPierde].filter((f) => f?.aplicado).length
  const estado = gw.unico().estado
  // attackRace: exactamente uno aplica y el estado final es terminal.
  const ok = aplicados === 1 && (estado === 'approved' || estado === 'declined')
  return cerrar(a, 'payments:race_condition', inicial, ok, { pasarela: { clave: 'emisorCarrera' } })
}

function caidaBd(): Guion {
  const gw = conPago()
  const a = new Autor(gw)
  const inicial = gw.registro()
  const pago = gw.unico()
  const antes = { estado: pago.estado, version: pago.version, eventos: gw.eventos.length }
  a.en('sale', { token: 't1', emisor: 'caos', etiqueta: 'BEGIN' }, DUR.viaje)
  a.en('guarda', { token: 't1', guarda: 'tx', veredicto: 'pasa', lectura: { clave: 'txAbre' } }, DUR.decide)
  // Dentro de la transacción: el pago pasa a pendiente y se inserta su evento.
  // Nada de esto se ve fuera hasta el COMMIT, que nunca llega.
  const copia = { ...pago }
  pago.estado = 'pending'
  pago.version += 1
  gw.eventos.push({ tx: 'tx-chaos', estado: 'pending', duplicado: false, aplicado: true })
  a.en('transicion', { token: 't1', de: 'created', a: 'pending', aplicada: true, tentativa: true }, DUR.transicion)
  a.registro(true)
  a.t += 0.4
  a.en('caida', {}, 0.35)
  a.en('guarda', { token: 't1', guarda: 'tx', veredicto: 'aviso', lectura: { clave: 'txCae' } }, DUR.decide)
  // ROLLBACK: todo lo escrito dentro de la transacción desaparece.
  Object.assign(pago, copia)
  gw.eventos.pop()
  a.en('revierte', { de: 'pending', a: 'created' }, DUR.transicion)
  a.en('descarta', { token: 't1' })
  a.registro()
  a.en('guarda', { token: 't1', guarda: 'tx', veredicto: 'frena', lectura: { clave: 'txRevierte' } }, DUR.decide)
  // Experimento real: mismo estado, misma versión y ningún evento huérfano.
  const ok = pago.estado === antes.estado && pago.version === antes.version && gw.eventos.length === antes.eventos
  return cerrar(a, 'chaos:db_fail_midtx', inicial, ok, { caos: { clave: 'emisorCaos' } })
}

function cerrar(a: Autor, id: Experimento, inicial: Registro, ok: boolean, emisores: Guion['emisores']): Guion {
  a.en('fin', { ok }, DUR.cierre)
  return { id, emisores, inicial, pasos: a.pasos, final: a.gw.registro(), ok, duracion: +a.t.toFixed(3) }
}

/** El guion de un experimento. `vuelta` alterna el ganador de la carrera. */
export function guionDe(id: Experimento, vuelta = 0): Guion {
  switch (id) {
    case 'payments:double_click':
      return dobleClic()
    case 'payments:duplicate_webhook':
      return webhookDuplicado()
    case 'payments:out_of_order':
      return fueraDeOrden()
    case 'payments:race_condition':
      return carrera(vuelta % 2 === 0 ? 'approved' : 'declined')
    case 'chaos:db_fail_midtx':
      return caidaBd()
  }
}

/** Todas las claves de lectura que usan los guiones (para el test de paridad con el diccionario). */
export function lecturasUsadas(): Set<string> {
  const claves = new Set<string>()
  for (const id of EXPERIMENTOS) {
    for (const vuelta of [0, 1]) {
      const g = guionDe(id, vuelta)
      for (const l of Object.values(g.emisores)) if (l) claves.add(l.clave)
      for (const p of g.pasos) if (p.tipo === 'guarda') claves.add(p.lectura.clave)
    }
  }
  return claves
}

// ── Veredicto registrado ──────────────────────────────────────────────────

export type Corridas = { runs: number; ok: number; lastRunAt: number | null }

/**
 * El sello de la pieza lo pone la base, no la reproducción: la reproducción
 * enseña el mecanismo, pero si una corrida real falló, el sello lo dice.
 */
export function selloDe(c: Corridas | undefined): 'superado' | 'parcial' | 'sin-corridas' {
  if (!c || c.runs === 0) return 'sin-corridas'
  return c.ok === c.runs ? 'superado' : 'parcial'
}

// ── Estado final ──────────────────────────────────────────────────────────

export type Arco = { de: Estado; a: Estado; aplicada: boolean }
export type Cuadro = {
  guardas: Partial<Record<Guarda, { veredicto: 'pasa' | 'frena' | 'aviso'; lectura: Lectura }>>
  /** Intentos de transición que quedan a la vista (lo revertido no cuenta). */
  arcos: Arco[]
  actual: Estado | null
  registro: Registro
}

/**
 * Cómo queda la pieza al terminar un guion. Es lo que pinta el servidor (sin
 * JS se ve el experimento ya resuelto) y lo que se enseña de golpe con
 * movimiento reducido.
 */
export function cuadroFinal(g: Guion): Cuadro {
  const guardas: Cuadro['guardas'] = {}
  let arcos: Arco[] = []
  for (const p of g.pasos) {
    if (p.tipo === 'guarda') guardas[p.guarda] = { veredicto: p.veredicto, lectura: p.lectura }
    if (p.tipo === 'transicion' && p.de) arcos.push({ de: p.de, a: p.a, aplicada: p.aplicada })
    if (p.tipo === 'revierte') arcos = arcos.filter((x) => !(x.de === p.a && x.a === p.de))
  }
  return { guardas, arcos, actual: g.final.estado, registro: g.final }
}
