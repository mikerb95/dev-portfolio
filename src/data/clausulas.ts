// Biblioteca de cláusulas de Plano (docs/plan-plano.md).
//
// La IA NO redacta términos: elige de aquí y Mike activa o desactiva. Cada
// cláusula tiene dos textos, el formal (el que va en el PDF y vale como
// acuerdo) y el "en cristiano" (el que el cliente lee de verdad), y una regla
// de cuándo aplica. Las cifras salen del tarifario y de la propuesta: si una
// cláusula dijera "2 rondas" escrito a mano, el día que cambie la regla la
// propuesta y la web dirían cosas distintas.
//
// Pendiente: revisión única por un abogado (sobre todo propiedad, datos
// personales y terminación).
//
// Módulo PURO e isomorfo.

import { CANAL_LABEL, SEGUIMIENTO_LABEL, type MapaContacto } from '../lib/plano/contacto'
import { ENTREGA, HOSTING_ANUAL, REGLAS, TARIFA_HORA, formatearMonto, type Moneda } from './tarifario'

export type ContextoClausulas = {
  /** Ids de los componentes incluidos. */
  componentes: readonly string[]
  base: 'presencia' | 'negocio' | null
  moneda: Moneda
  planTipo: 'hitos' | 'cuotas' | 'contado'
  numCuotas: number
  recargoMensualPct: number
  contacto: MapaContacto
}

export type Clausula = {
  id: string
  titulo: string
  /** Por qué aplica, cuando no es universal. Se le muestra a Mike en el constructor. */
  motivo: ((c: ContextoClausulas) => string) | null
  aplica: (c: ContextoClausulas) => boolean
  formal: (c: ContextoClausulas) => string
  simple: (c: ContextoClausulas) => string
}

const siempre = () => true
const tiene = (c: ContextoClausulas, ...ids: string[]) => ids.some((id) => c.componentes.includes(id))
const pct = (n: number) => `${String(n).replace('.', ',')} %`
const palabras: Record<number, string> = { 1: 'una', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 10: 'diez', 15: 'quince', 30: 'treinta' }
const enLetras = (n: number) => (palabras[n] ? `${palabras[n]} (${n})` : String(n))

const TERCEROS: Record<string, string> = {
  pagos: 'la pasarela de pagos',
  tienda: 'los envíos',
  reservas: 'los recordatorios por WhatsApp o mensaje de texto',
  facturacion: 'el proveedor de facturación electrónica',
  integracion: 'el sistema que se conecta',
  'app-nativa': 'las cuentas de desarrollador de Apple y Google',
}

function listaTerceros(c: ContextoClausulas): string {
  const items = [...new Set(c.componentes.filter((id) => TERCEROS[id]).map((id) => TERCEROS[id]))]
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

const DATOS = ['usuarios', 'tienda', 'reservas', 'pagos', 'facturacion', 'migracion']
const EXTERNOS = ['pagos', 'facturacion', 'integracion', 'app-nativa']

export const CLAUSULAS: readonly Clausula[] = [
  {
    id: 'alcance',
    titulo: 'Alcance y exclusiones',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'El alcance de este proyecto se limita a los componentes, entregables y condiciones descritos en esta propuesta. Toda funcionalidad, contenido o servicio que no figure expresamente en ella se considera excluido y, de requerirse, se cotizará por separado.',
    simple: () => 'Lo que está escrito en esta propuesta es lo que se hace. Si algo no aparece, no está incluido; si lo necesitas, lo cotizamos aparte.',
  },
  {
    id: 'cambios-alcance',
    titulo: 'Cambios de alcance',
    motivo: null,
    aplica: siempre,
    formal: (c) =>
      `Toda solicitud que modifique el alcance deberá formularse por escrito a través de ${CANAL_LABEL[c.contacto.canal]}. EL DESARROLLADOR presentará su costo y su efecto en el cronograma, y el cambio solo se ejecutará tras la aprobación escrita de EL CLIENTE.`,
    simple: () => 'Si quieres agregar o cambiar algo grande en el camino, me lo pides por escrito, te digo cuánto cuesta y cuánto mueve la fecha, y solo arranco cuando me digas que sí.',
  },
  {
    id: 'rondas',
    titulo: 'Rondas de ajustes',
    motivo: null,
    aplica: siempre,
    formal: (c) =>
      `Se incluyen ${enLetras(ENTREGA.rondasCambios)} rondas de ajustes sobre cada entrega antes de la publicación. Una ronda agrupa en un solo envío todas las observaciones de EL CLIENTE sobre esa entrega. Las rondas adicionales se facturan a la tarifa vigente de ${formatearMonto(TARIFA_HORA[c.moneda], c.moneda)} por hora.`,
    simple: (c) =>
      `En cada entrega tienes ${ENTREGA.rondasCambios} rondas de cambios incluidas: me mandas todo lo que quieres ajustar en un solo mensaje y lo corrijo. Desde la ronda ${ENTREGA.rondasCambios + 1}, se cobra por hora, a ${formatearMonto(TARIFA_HORA[c.moneda], c.moneda)} la hora.`,
  },
  {
    id: 'reloj-detenido',
    titulo: 'Plazos y colaboración del cliente',
    motivo: null,
    aplica: siempre,
    formal: (c) =>
      `Los plazos dependen de la oportuna colaboración de EL CLIENTE. Si EL CLIENTE tarda más de ${enLetras(c.contacto.respuestaClienteDias)} días hábiles en entregar material, accesos o respuestas solicitadas, el cronograma se extenderá por el mismo tiempo de la demora. Transcurridos ${enLetras(c.contacto.diasPausa)} días calendario sin respuesta, el proyecto quedará en pausa y su reactivación se programará según la disponibilidad de EL DESARROLLADOR.`,
    simple: (c) =>
      `Si te pido algo (textos, fotos, una respuesta) y tardas más de ${c.contacto.respuestaClienteDias} días hábiles, la entrega se corre lo mismo que tardaste. Si pasan ${c.contacto.diasPausa} días sin noticias, el proyecto se pausa y lo retomamos cuando haya espacio en mi agenda.`,
  },
  {
    id: 'mora',
    titulo: 'Pagos atrasados',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'Si un pago se retrasa más de diez (10) días calendario respecto de su vencimiento, EL DESARROLLADOR podrá suspender los trabajos hasta que EL CLIENTE se ponga al día, y el cronograma se extenderá por el tiempo de la suspensión.',
    simple: () => 'Si un pago se atrasa más de 10 días, paro el trabajo hasta que te pongas al día, y la fecha de entrega se corre lo mismo.',
  },
  {
    id: 'cuotas',
    titulo: 'Pago en cuotas',
    motivo: () => 'Porque se eligió pagar en cuotas.',
    aplica: (c) => c.planTipo === 'cuotas',
    formal: (c) =>
      `El saldo se pagará en ${enLetras(c.numCuotas)} cuotas mensuales con un recargo del ${pct(c.recargoMensualPct)} mensual sobre el saldo pendiente, conforme a la tabla de esta propuesta, sin exceder en ningún caso la tasa máxima legal vigente. La propiedad del desarrollo se transferirá con el pago de la última cuota.`,
    simple: (c) =>
      `Pagas el resto en ${c.numCuotas} cuotas. El recargo es de ${pct(c.recargoMensualPct)} al mes sobre lo que falta, y la tabla te muestra cuánto es cada cuota. El proyecto pasa a tu nombre con la última.`,
  },
  {
    id: 'propiedad',
    titulo: 'Propiedad del proyecto',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'Pagada la totalidad del precio, EL CLIENTE adquiere los derechos patrimoniales sobre el desarrollo específico realizado para este proyecto, incluido su código fuente. EL DESARROLLADOR conserva la titularidad de las herramientas y componentes genéricos preexistentes o reutilizables, sobre los cuales otorga a EL CLIENTE una licencia de uso perpetua, no exclusiva y gratuita para este proyecto. Salvo pacto de confidencialidad, EL DESARROLLADOR podrá mencionar el proyecto en su portafolio.',
    simple: () =>
      'Cuando termines de pagar, el proyecto es tuyo, código incluido. Las piezas genéricas que uso en todos mis proyectos siguen siendo mías, pero puedes usarlas en el tuyo para siempre. Puedo mostrarlo en mi portafolio, salvo que me pidas que no.',
  },
  {
    id: 'garantia',
    titulo: 'Garantía',
    motivo: null,
    aplica: siempre,
    formal: () =>
      `Durante los ${enLetras(ENTREGA.garantiaDias)} días calendario siguientes a la publicación, EL DESARROLLADOR corregirá sin costo los errores de funcionamiento atribuibles a su trabajo. La garantía no cubre cambios de alcance, contenidos, fallas de servicios de terceros ni modificaciones hechas por personas distintas de EL DESARROLLADOR.`,
    simple: () =>
      `Por ${ENTREGA.garantiaDias} días después de publicar, si algo de lo que hice falla, lo arreglo gratis. Eso no incluye cosas nuevas ni daños que haga otra persona.`,
  },
  {
    id: 'hosting',
    titulo: 'Dominio y alojamiento',
    motivo: null,
    aplica: siempre,
    formal: (c) =>
      c.base
        ? `El primer año de dominio y alojamiento está incluido en el precio. A partir del segundo año, la renovación tiene un costo anual de ${formatearMonto(HOSTING_ANUAL[c.base][c.moneda], c.moneda)}, que EL CLIENTE podrá pagar a EL DESARROLLADOR o asumir directamente con el proveedor.`
        : 'El costo de alojamiento depende del uso real del sistema (usuarios, archivos almacenados, redundancia) y se cotizará por separado antes de la publicación.',
    simple: (c) =>
      c.base
        ? `El primer año de dominio y servidor va incluido. Desde el segundo año cuesta ${formatearMonto(HOSTING_ANUAL[c.base][c.moneda], c.moneda)} al año.`
        : 'Lo que cuesta mantener el sistema en internet depende de cuánto se use; te lo cotizo antes de publicar, con cifras reales.',
  },
  {
    id: 'terceros',
    titulo: 'Servicios de terceros',
    motivo: (c) => `Porque el proyecto usa ${listaTerceros(c)}.`,
    aplica: (c) => listaTerceros(c) !== '',
    formal: (c) =>
      `Los costos de servicios de terceros necesarios para el funcionamiento del proyecto, en particular ${listaTerceros(c)}, no están incluidos en el precio y son asumidos directamente por EL CLIENTE conforme a las tarifas de cada proveedor.`,
    simple: (c) => `Lo que cobran otras empresas (${listaTerceros(c)}) lo pagas directamente a ellas; no está en mi precio.`,
  },
  {
    id: 'datos-personales',
    titulo: 'Datos personales',
    motivo: () => 'Porque el sistema guarda datos de los clientes de tu cliente.',
    aplica: (c) => tiene(c, ...DATOS),
    formal: () =>
      'En la medida en que el proyecto trate datos personales de los usuarios o clientes de EL CLIENTE, este actuará como Responsable del Tratamiento en los términos de la Ley 1581 de 2012 y sus decretos reglamentarios, y EL DESARROLLADOR como Encargado, limitándose a tratar dichos datos para la ejecución del proyecto y adoptando medidas de seguridad razonables. EL CLIENTE es responsable de contar con la autorización de los titulares y con una política de tratamiento publicada.',
    simple: () =>
      'Si tu sistema guarda datos de tus clientes (nombres, correos, teléfonos), tú eres el responsable ante la ley de protección de datos (Ley 1581) y yo solo los uso para construir el sistema y los protejo. Necesitas una política de privacidad publicada.',
  },
  {
    id: 'accesos',
    titulo: 'Accesos y credenciales',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'EL CLIENTE suministrará oportunamente los accesos necesarios (dominio, correo, proveedores). Al término del proyecto, EL DESARROLLADOR entregará la totalidad de las credenciales, y el dominio y las cuentas de servicios quedarán a nombre de EL CLIENTE.',
    simple: () => 'Tú me das los accesos que hagan falta y, al terminar, te entrego todas las contraseñas. El dominio y las cuentas quedan a tu nombre, no al mío.',
  },
  {
    id: 'plataformas-externas',
    titulo: 'Cambios de plataformas externas',
    motivo: () => 'Porque el proyecto depende del sistema de otra empresa.',
    aplica: (c) => tiene(c, ...EXTERNOS),
    formal: () =>
      'Las modificaciones que terceros introduzcan en sus plataformas, interfaces o políticas después de la entrega (por ejemplo, cambios en la API de un proveedor o en los requisitos de las tiendas de aplicaciones) no están cubiertas por la garantía y se atenderán como mantenimiento.',
    simple: () => 'Si después de entregar otra empresa cambia cómo funciona su sistema (la pasarela, la DIAN, Apple), adaptar el proyecto es mantenimiento, no garantía.',
  },
  {
    id: 'posicionamiento',
    titulo: 'Posicionamiento en buscadores',
    motivo: () => 'Porque el proyecto incluye un sitio web público.',
    aplica: (c) => c.base !== null,
    formal: () =>
      'EL DESARROLLADOR implementará buenas prácticas técnicas de posicionamiento (estructura, velocidad, metadatos). Los resultados en buscadores dependen de factores ajenos a su control, por lo que no se garantiza una posición determinada.',
    simple: () => 'Dejo el sitio bien hecho para Google (rápido, ordenado y con sus datos), pero nadie puede prometer el primer lugar: eso depende de Google y de la competencia.',
  },
  {
    id: 'navegadores',
    titulo: 'Compatibilidad',
    motivo: null,
    aplica: siempre,
    formal: () => 'El proyecto funcionará en las dos versiones más recientes de Chrome, Safari, Firefox y Edge, en computador y celular, vigentes a la fecha de entrega.',
    simple: () => 'Funciona en los navegadores actuales (Chrome, Safari, Firefox y Edge), en computador y celular.',
  },
  {
    id: 'ia',
    titulo: 'Uso de inteligencia artificial',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'EL DESARROLLADOR podrá apoyarse en herramientas de inteligencia artificial durante el desarrollo, bajo su supervisión y responsabilidad. Todo el código entregado es revisado por EL DESARROLLADOR, y ningún dato confidencial de EL CLIENTE se compartirá con dichas herramientas sin su autorización.',
    simple: () => 'Uso herramientas de inteligencia artificial para trabajar más rápido, pero reviso todo lo que entrego y no comparto tus datos privados con ellas sin tu permiso.',
  },
  {
    id: 'cuenta-cobro',
    titulo: 'Soporte de los pagos',
    motivo: () => 'Porque se cobra en pesos colombianos.',
    aplica: (c) => c.moneda === 'COP',
    formal: () =>
      'EL DESARROLLADOR es persona natural no responsable de IVA. Cada pago se soportará con una cuenta de cobro y, si EL CLIENTE es agente de retención, practicará las retenciones que correspondan conforme a la ley.',
    simple: () => 'Cobro con cuenta de cobro (no con factura con IVA, porque soy persona natural no responsable de IVA). Si tu empresa practica retenciones, las descuenta de cada pago.',
  },
  {
    id: 'confidencialidad',
    titulo: 'Confidencialidad',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'Las partes mantendrán reserva sobre la información confidencial que conozcan con ocasión del proyecto, y solo la usarán para su ejecución. Esta obligación se mantiene por dos (2) años después de terminado el proyecto.',
    simple: () => 'Lo que me cuentes de tu negocio queda entre nosotros, también después de terminar.',
  },
  {
    id: 'terminacion',
    titulo: 'Terminación anticipada',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'Cualquiera de las partes podrá terminar el proyecto anticipadamente mediante aviso escrito. En tal caso, EL CLIENTE pagará el trabajo ejecutado hasta la fecha del aviso, en proporción al avance; los pagos ya realizados se imputarán a ese valor y no serán reembolsables en la parte que corresponda al trabajo hecho. EL DESARROLLADOR entregará lo construido hasta ese momento una vez recibido el pago.',
    simple: () => 'Si alguno decide no seguir, se paga lo trabajado hasta ese día (lo que ya pagaste cuenta para eso) y te entrego lo que esté construido.',
  },
  {
    id: 'comunicacion',
    titulo: 'Comunicación',
    motivo: null,
    aplica: siempre,
    formal: (c) =>
      `La comunicación del proyecto se hará por ${CANAL_LABEL[c.contacto.canal]}${c.contacto.contacto.nombre ? `, con ${c.contacto.contacto.nombre} como punto único de contacto de EL CLIENTE` : ''}, en el horario de ${c.contacto.horario}. EL DESARROLLADOR responderá en un máximo de ${c.contacto.respuestaMikeHoras} horas hábiles, y el seguimiento se hará con ${SEGUIMIENTO_LABEL[c.contacto.seguimiento]}.`,
    simple: (c) =>
      `Hablamos por ${CANAL_LABEL[c.contacto.canal]}${c.contacto.contacto.nombre ? ` y tu persona de contacto es ${c.contacto.contacto.nombre}` : ''}. Te respondo en máximo ${c.contacto.respuestaMikeHoras} horas hábiles y nos vemos con ${SEGUIMIENTO_LABEL[c.contacto.seguimiento]}.`,
  },
  {
    id: 'validez',
    titulo: 'Validez de la propuesta',
    motivo: null,
    aplica: siempre,
    formal: () => `Esta propuesta es válida por ${enLetras(REGLAS.validezDias)} días calendario desde su envío. Vencido ese plazo, los precios y fechas podrán actualizarse.`,
    simple: () => `Esta propuesta vale ${REGLAS.validezDias} días. Después, el precio y las fechas pueden cambiar.`,
  },
  {
    id: 'aceptacion',
    titulo: 'Aceptación electrónica',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'La aceptación de esta propuesta mediante el registro del nombre y la identificación de EL CLIENTE en el enlace dispuesto para ello tiene plena validez y fuerza obligatoria, conforme a la Ley 527 de 1999. La versión aceptada, identificada por su huella digital, constituye el acuerdo entre las partes.',
    simple: () => 'Aceptar en el enlace, con tu nombre y documento, vale igual que firmar en papel (Ley 527 de 1999). Queda guardada una huella digital de la versión exacta que aceptaste.',
  },
  {
    id: 'conflictos',
    titulo: 'Diferencias',
    motivo: null,
    aplica: siempre,
    formal: () =>
      'Las diferencias se resolverán primero mediante arreglo directo; de no lograrse en quince (15) días, las partes acudirán a conciliación ante un centro autorizado en Colombia antes de cualquier acción judicial. Esta propuesta se rige por la ley colombiana.',
    simple: () => 'Si no estamos de acuerdo en algo, primero lo hablamos. Si en 15 días no lo resolvemos, vamos a un centro de conciliación antes de pensar en abogados.',
  },
]

export type ClausulaRenderizada = {
  id: string
  titulo: string
  formal: string
  simple: string
  motivo: string | null
  activa: boolean
}

/** Las cláusulas que aplican al contexto, con sus textos ya resueltos. */
export function clausulasPara(c: ContextoClausulas, desactivadas: readonly string[] = []): ClausulaRenderizada[] {
  return CLAUSULAS.filter((x) => x.aplica(c)).map((x) => ({
    id: x.id,
    titulo: x.titulo,
    formal: x.formal(c),
    simple: x.simple(c),
    motivo: x.motivo ? x.motivo(c) : null,
    activa: !desactivadas.includes(x.id),
  }))
}
