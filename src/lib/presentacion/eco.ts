// El eco: que la sala vea lo que el ponente ESCRIBE, y lo que le contesta el
// servidor cuando la respuesta no pasa por una navegación.
//
// El espejo (`espejo.ts`) lleva la URL y con eso basta para casi todo: en la
// demo del portal y en `/status`, todo resultado es una página nueva. En el
// beat del diagnóstico público (`/lab/site-check`) no: el ponente teclea un
// dominio, pulsa Analizar, y el resultado entero llega por un POST que va
// pintando tarjetas en el mismo documento. La URL no cambia ni una letra, así
// que la sala se quedaba mirando el formulario vacío durante el minuto que
// dura el análisis. Este módulo es lo que faltaba para ese beat.
//
// TRES REGLAS, y las tres salieron de descartar lo que parecía más fácil:
//
//  · NO SE ESPEJA HTML. El canal es público y sin puerta (ver la cabecera de
//    `/present-admin`): quien conozca la URL puede escribir en él. Un `innerHTML`
//    con lo que venga de ahí sería XSS en el mismo origen, en todos los equipos
//    de la sala a la vez. Lo que viaja son DATOS, y quien los pinta es la
//    página con su propio renderizador y su propio escapado.
//  · NO SE REPITE EL TRABAJO. La alternativa era mandar solo el dominio y que
//    cada seguidor analizara por su cuenta; treinta navegadores lanzarían
//    treinta sondeos reales contra el sitio y treinta llamadas a la cuota de
//    PageSpeed Insights. El análisis lo corre el ponente, una vez, y lo demás
//    es reparto.
//  · LA PÁGINA SE DESCUBRE POR SU FORMA, como el resto del sistema. Ni este
//    módulo ni las páginas de la presentación saben qué es un diagnóstico: la
//    página viva publica `window.ESPEJO_VIVO` con `leer()` y `aplicar()`, y
//    quien no lo publique sencillamente no tiene eco. Añadir mañana otro beat
//    interactivo no toca nada de aquí.
//
// Lo que viaja es opaco a propósito (`estado: unknown`): validar su FORMA es
// cosa de quien lo va a pintar, que es la única que sabe cuál es. Aquí se
// valida lo que sí es responsabilidad del transporte: que sea JSON, que quepa,
// y que pertenezca a esta diapositiva.
//
// Módulo puro salvo las dos últimas funciones, que tocan el documento de la
// página viva. Probado en `tests/presentacion-eco.test.ts`.

/**
 * Lo que publica `/present-admin` y leen los seguidores.
 *
 * `pos` ata el eco a SU diapositiva, igual que el espejo y el puntero: al
 * cambiar de beat, el de la anterior deja de aplicarse solo y el formulario
 * vuelve a estar vacío en la sala sin tener que borrar nada.
 */
export type Eco = { pos: number; seq: number; estado: unknown }

/**
 * Cuánto se acepta que ocupe el estado, ya serializado.
 *
 * Un diagnóstico entero (una docena de tarjetas con sus detalles) ronda los
 * cuatro mil caracteres. El techo deja sitio de sobra y sigue siendo pequeño
 * para un cuerpo que se manda cada vez que hay novedad: sin él, una página
 * podría publicar su DOM entero dos veces por segundo contra el almacén.
 */
export const ECO_MAX = 12_000

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/**
 * Valida lo que venga del almacén o de la red. `null` ante cualquier duda: sin
 * eco la sala ve la página en su estado de arranque, que es lo que veía ayer;
 * con un eco a medio parsear, la página que lo aplique se lleva la excepción.
 */
export function parsearEco(v: unknown): Eco | null {
  const c = typeof v === 'string' ? seguroJson(v) : v
  if (!c || typeof c !== 'object') return null
  const { pos, seq, estado } = c as Record<string, unknown>
  if (!entero(pos) || pos < 1) return null
  if (!entero(seq) || seq < 0) return null
  if (estado === undefined) return null
  // Serializar es la única forma de saber a la vez que cabe y que es JSON de
  // verdad: un ciclo o un `BigInt` lanzan aquí y no en el navegador de la sala.
  const texto = serializar(estado)
  if (texto === null || texto.length > ECO_MAX) return null
  return { pos, seq, estado }
}

function seguroJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** El JSON del estado, o `null` si no se deja serializar. */
export function serializar(estado: unknown): string | null {
  try {
    const t = JSON.stringify(estado)
    return typeof t === 'string' ? t : null
  } catch {
    return null
  }
}

/**
 * ¿Este mensaje sustituye al que ya teníamos? Solo con un `seq` mayor, y por lo
 * mismo que en el espejo y el puntero: el bus no garantiza orden, y un mensaje
 * atrasado devolvería el formulario a mitad del tecleo.
 */
export function esMasNuevo(entrante: Eco, actual: Eco | null): boolean {
  return !actual || entrante.seq > actual.seq
}

/** El eco que toca para esta diapositiva, o `null` si es de otra. */
export function ecoPara(e: Eco | null, pos: number): Eco | null {
  return e && e.pos === pos ? e : null
}

/**
 * El mensaje a publicar, o `null` si no hay nada nuevo que contar.
 *
 * La comparación es por JSON y no por identidad: la página construye su estado
 * de cero en cada lectura, así que dos objetos distintos con el mismo contenido
 * son -y tienen que ser- "sin novedad". Un estado que no quepa tampoco es
 * novedad: publicar la mitad sería peor que no publicar.
 */
export function siguienteEco(pos: number, estado: unknown, anterior: Eco | null): Eco | null {
  if (estado === undefined) return null
  const texto = serializar(estado)
  if (texto === null || texto.length > ECO_MAX) return null
  if (anterior && anterior.pos === pos && serializar(anterior.estado) === texto) return null
  return { pos, seq: (anterior?.seq ?? 0) + 1, estado }
}

/* ==================================================================== *
 * EL CONTRATO CON LA PÁGINA VIVA (navegador)
 * ==================================================================== */

/**
 * Lo que una página viva publica en su `window` para participar del eco.
 *
 * `leer` corre en el portátil del ponente y devuelve lo que haya que contar
 * (o `undefined` si no hay nada). `aplicar` corre en cada equipo de la sala y
 * recibe eso mismo, venido de la red: **es dato ajeno**, y la página que lo
 * implementa tiene que tratarlo como tal (nada de `innerHTML` con él sin
 * escapar, nada de confiar en sus tipos).
 */
export type EspejoVivo = {
  leer(): unknown
  aplicar(estado: unknown): void
}

/** Dónde se busca. Un nombre en la `window` de la página viva, no un `postMessage`:
 *  la cadena entera es de un solo origen y una llamada directa no necesita ni
 *  protocolo ni listener que pueda perderse antes de engancharse. */
export const GLOBAL = 'ESPEJO_VIVO'

/** El contrato de este documento, o `null` si la página no participa (que es lo
 *  normal: solo un beat lo necesita). */
export function espejoVivoDe(doc: Document | null): EspejoVivo | null {
  try {
    const w = doc?.defaultView as (Window & { [GLOBAL]?: unknown }) | null | undefined
    const c = w?.[GLOBAL] as EspejoVivo | undefined
    return c && typeof c.leer === 'function' && typeof c.aplicar === 'function' ? c : null
  } catch {
    // Otro origen o documento a medio cargar: no hay eco, que es la degradación
    // buena (se ve la página, sin lo tecleado).
    return null
  }
}

/** Lo que la página viva quiere contar, o `undefined` si no hay nada ni nadie
 *  que lo cuente. Fail-open: un `leer()` que lance no puede tumbar el bucle que
 *  publica la posición. */
export function leerEco(doc: Document | null): unknown {
  try {
    return espejoVivoDe(doc)?.leer()
  } catch {
    return undefined
  }
}

/**
 * Aplica en el seguidor lo que mandó el ponente. Devuelve si se llegó a
 * aplicar, que es lo que permite no reintentar el mismo estado en cada vuelta.
 *
 * Fail-open por la misma razón de siempre: una página a medio cargar (el iframe
 * acaba de navegar y su script todavía no ha corrido) no es un error, es un
 * "todavía no", y el ciclo siguiente lo vuelve a intentar.
 */
export function aplicarEco(doc: Document | null, e: Eco | null): boolean {
  if (!e) return false
  try {
    const c = espejoVivoDe(doc)
    if (!c) return false
    c.aplicar(e.estado)
    return true
  } catch {
    return false
  }
}
