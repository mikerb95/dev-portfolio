// El cronómetro de la sustentación.
//
// Vive en `/present-admin`, que es la ventana que solo ve el ponente. En la
// pared no aparece: ver correr el reloj de quien está sustentando cambia cómo
// se le escucha.
//
// EL ARRANQUE ES DEL SERVIDOR, no del navegador, por lo mismo que todo lo demás
// de este sistema: una recarga a mitad de charla es un escenario contemplado
// (el origen `inicial` existe justo para eso), y un cronómetro que se pone a
// cero ahí sería peor que no tenerlo.
//
// Arranca SOLO, con el primer movimiento que saca la presentación de su
// primera diapositiva. No hay botón de empezar: es un gesto más que recordar
// con la sala esperando, y el que se olvida.
//
// Módulo puro. Lo que cuesta aquí no es contar segundos, es que los dos relojes
// que intervienen no son el mismo.

/** Lo que el servidor manda en cada sondeo para poder contar. */
export type Marca = {
  /** Cuándo arrancó, en el reloj DEL SERVIDOR. `null` si aún no ha arrancado. */
  inicio: number | null
  /** Qué hora era en el servidor al responder. */
  ahora: number
}

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Cuánto adelanta el reloj local respecto al del servidor.
 *
 * ESTO NO ES TEÓRICO. `inicio` lo pone el servidor y la cuenta la hace el
 * portátil: si el portátil va dos minutos adelantado, el cronómetro arranca en
 * 02:00. Es el tipo de fallo que no se nota ensayando y sí en vivo, y se
 * corrige con un número que ya viaja en una respuesta que ya se hacía.
 *
 * `recibidoEn` es el `Date.now()` local del momento de recibir la respuesta. No
 * se descuenta la mitad del viaje de ida y vuelta: para un reloj que se pinta
 * en segundos, unos cientos de milisegundos no cambian nada, y estimarlos
 * añadiría una fuente de error propia.
 */
export function desfase(ahoraServidor: number, recibidoEn: number): number {
  if (!entero(ahoraServidor) || !entero(recibidoEn)) return 0
  return recibidoEn - ahoraServidor
}

/**
 * Los milisegundos que lleva la sustentación, o `null` si aún no ha arrancado.
 *
 * Nunca devuelve un número negativo: un desfase mal medido o un reloj que se
 * ajusta solo (NTP, cambio de zona) darían un tiempo hacia atrás, y un
 * cronómetro en `-00:07` delante del tribunal es peor que uno en cero.
 */
export function transcurrido(
  inicio: number | null,
  ahoraLocal: number,
  desfaseMs: number
): number | null {
  if (!entero(inicio)) return null
  if (!entero(ahoraLocal) || !entero(desfaseMs)) return null
  return Math.max(0, ahoraLocal - desfaseMs - inicio)
}

/**
 * `mm:ss` hasta la hora, `h:mm:ss` a partir de ahí.
 *
 * No se pone la hora siempre: una sustentación dura veinte minutos y un `0:`
 * delante todo el rato es una columna que no dice nada. Y no se corta en 59:59
 * porque un ensayo largo o una sesión que se olvidó de reiniciar tienen que
 * poder decir la verdad, aunque la verdad sea `4:12:30`.
 */
export function formatear(ms: number | null): string {
  if (ms === null || !entero(ms) || ms < 0) return '--:--'
  const total = Math.floor(ms / 1000)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const dd = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`
}

/**
 * ¿Este movimiento arranca el reloj?
 *
 * Solo el primero que saca la presentación de su primera diapositiva, y solo si
 * no hay uno guardado ya. Es idempotente a propósito: lo llama el servidor en
 * CADA `POST` que mueve el destino, así que tiene que dar `false` en todos
 * menos en uno o el reloj se reiniciaría con cada toque.
 *
 * Que sea el movimiento y no la carga de la página es lo que lo hace fiable:
 * abrir la ventana para probar el proyector media hora antes no arranca nada.
 */
export function debeArrancar(
  inicioGuardado: number | null,
  destinoPrevio: number,
  destinoNuevo: number,
  posInicial: number
): boolean {
  if (inicioGuardado !== null) return false
  if (destinoNuevo === destinoPrevio) return false
  return destinoPrevio === posInicial && destinoNuevo > posInicial
}

/**
 * Valida el `inicio` que venga del almacén.
 *
 * Se descarta lo que no sea un instante posible en vez de confiar: un valor
 * corrupto daría un cronómetro en `13491:22:07`, que además de inútil delata
 * que algo está roto en el peor momento para averiguar qué.
 */
export function parsearInicio(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  if (!entero(n) || n <= 0) return null
  return n
}
