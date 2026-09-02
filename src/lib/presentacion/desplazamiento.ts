// Desplazar la página que vive DENTRO de un beat.
//
// Tres beats del mazo no proyectan una lámina sino una página viva metida en
// un iframe (la demo del portal, `/status`, `/engineering`). El mando sabe
// pasar diapositivas, pero sin esto no puede recorrer esas páginas y hay que
// volver al portátil justo en mitad de la demo.
//
// EL SCROLL ES OTRA POSICIÓN ABSOLUTA, no un comando relativo. Es la misma
// decisión que sostiene el resto del sistema: un sondeo perdido no pierde
// nada, tres toques seguidos valen tres porque se acumulan sobre lo PEDIDO y
// no sobre lo que se ve (que va por detrás mientras la animación corre), y el
// estado completo cabe en un número.
//
// Y el número viene con la diapositiva a la que pertenece. Eso es lo que hace
// que el iframe VUELVA ARRIBA SOLO al cambiar de beat: si el `pos` guardado no
// es el destino de ahora, lo pedido es 0. Sin escrituras extra, sin cron de
// limpieza y sin carrera - cualquier camino que cambie de diapositiva (incluida
// la adopción de un movimiento hecho desde el teclado del portátil) lo
// reinicia por construcción.
//
// Módulo puro a propósito: el paso lo calcula el SERVIDOR sobre la geometría
// que publicó la pantalla, igual que `mover()` acota el destino contra el
// techo real del mazo. El teléfono solo dice "subir" o "bajar" y no necesita
// saber nada de la página que hay dentro del iframe.

/**
 * Lo que la pantalla ve del iframe en juego: dónde está, cuánto se puede bajar
 * y qué altura tiene la ventanilla. Todo en píxeles CSS enteros.
 */
export type Geometria = { y: number; max: number; alto: number }

/** Lo que pide el mando: un desplazamiento, y PARA QUÉ diapositiva. */
export type Peticion = { pos: number; y: number }

/**
 * Un empujón es un tercio de la ventanilla: bastante para que el pulgar avance
 * de verdad, poco para no saltarse nada. La línea que se estaba leyendo sigue
 * en pantalla después del salto, que es lo que se pierde con una página
 * entera.
 */
export const FRACCION = 3

/**
 * Recorrido mínimo para que la diapositiva cuente como desplazable.
 *
 * No es un umbral de gusto: la demo del portal publica `max: 10` porque su
 * página de login cabe entera y esos diez píxeles son el redondeo de un iframe
 * escalado. Con el listón en un píxel, esa diapositiva sacaría dos botones que
 * mueven la proyección un pelo, que delante del público se lee como un mando
 * roto. Por debajo de esto no hay nada que recorrer y el mando enseña la
 * rejilla de saltos, que es lo que sí sirve ahí.
 */
export const MINIMO_PX = 32

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

const acotar = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), Math.max(min, max))

export const paso = (alto: number): number => Math.max(1, Math.round(alto / FRACCION))

/** Si esta diapositiva tiene algo que recorrer. Lo miran los dos lados: el
 *  servidor para no escribir un desplazamiento inútil y el mando para decidir
 *  entre los botones y la rejilla. */
export const hayQueDesplazar = (geo: Geometria | undefined): geo is Geometria =>
  Boolean(geo && geo.max >= MINIMO_PX)

/**
 * La geometría publicada, o nada.
 *
 * `y` se ACOTA en vez de descartar la geometría entera: el rebote elástico de
 * iOS deja un `scrollTop` fuera de rango durante unos fotogramas, y perder por
 * eso los controles en mitad de una demo sería peor que corregir el número.
 * Lo que sí se descarta entero es una forma incoherente (sin altura, con
 * medidas rotas): ahí el mando esconde los controles, que es la respuesta
 * honesta a "no sé qué hay dentro".
 */
export function parsearGeometria(v: unknown): Geometria | undefined {
  if (!v || typeof v !== 'object') return undefined
  const { y, max, alto } = v as Partial<Geometria>
  if (!entero(y) || !entero(max) || !entero(alto)) return undefined
  if (max < 0 || alto < 1) return undefined
  return { y: acotar(y, 0, max), max, alto }
}

/** Lo pedido, o `null` si no hay nada guardado o está corrupto. Nunca lanza. */
export function parsearPeticion(crudo: string | null): Peticion | null {
  if (!crudo) return null
  try {
    const v = JSON.parse(crudo) as Partial<Peticion>
    if (!entero(v.pos) || !entero(v.y)) return null
    if (v.pos < 1 || v.y < 0) return null
    return { pos: v.pos, y: v.y }
  } catch {
    return null
  }
}

/**
 * Qué desplazamiento le toca al destino de ahora. Cero para una diapositiva
 * distinta de aquella para la que se pidió: es la vuelta arriba automática, y
 * no cuesta ni una escritura.
 */
export function desplazamientoPedido(pedido: Peticion | null, destino: number): number {
  return pedido && pedido.pos === destino ? pedido.y : 0
}

/**
 * Un toque de ↑ o ↓. Se acumula sobre lo PEDIDO, no sobre lo que la pantalla
 * publicó: mientras el `scrollTo` anima, la posición real va por detrás, y
 * partir de ella convertiría tres toques seguidos en uno.
 *
 * Devuelve `null` cuando no hay nada que desplazar (sin geometría, o una
 * página que cabe entera). El mando ni siquiera enseña los botones en ese
 * caso, pero el servidor no da eso por hecho: la petición pudo salir con la
 * geometría de la diapositiva anterior todavía en pantalla.
 */
export function mover(
  pedido: Peticion | null,
  destino: number,
  delta: -1 | 1,
  geo: Geometria | undefined
): Peticion | null {
  if (!hayQueDesplazar(geo)) return null
  const y = acotar(desplazamientoPedido(pedido, destino) + delta * paso(geo.alto), 0, geo.max)
  return { pos: destino, y }
}

/**
 * "La rueda dejó la página en `y`". Es la vía de `/present-admin`, que a
 * diferencia del pulgar sí sabe dónde ha quedado la página: no acumula un paso,
 * dice la posición entera.
 *
 * Acota contra la MISMA geometría publicada que `mover`, y por el mismo motivo:
 * el número llega de un navegador y el techo lo pone el servidor. Lo que no
 * hace es acotar la FRECUENCIA - eso vive en el cliente (§11.5.3), porque un
 * servidor que descarta en silencio lo que le mandan deja la sala en una
 * posición que nadie puede explicar mirando el estado.
 *
 * Devuelve `null` cuando no hay nada que desplazar o cuando el número no es una
 * posición posible, igual que `mover`: la rueda pudo girar justo mientras la
 * pantalla cambiaba de diapositiva.
 */
export function situar(destino: number, y: unknown, geo: Geometria | undefined): Peticion | null {
  if (!hayQueDesplazar(geo)) return null
  if (!entero(y) || y < 0) return null
  return { pos: destino, y: acotar(y, 0, geo.max) }
}
