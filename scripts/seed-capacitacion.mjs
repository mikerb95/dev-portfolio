// Siembra de arranque del módulo de capacitación: un programa del catálogo y
// dos recursos del banco, uno público y uno restringido, para poder recorrer el
// flujo completo (landing → banco → canje de código) con contenido real.
//
// Idempotente por slug: correrlo dos veces no duplica nada. No borra ni pisa lo
// que ya exista, así que es seguro sobre una base con contenido.
//
//   export $(grep -E '^TURSO_' .env | xargs)
//   node scripts/seed-capacitacion.mjs
//
// Para sembrar la base de la demo en vez de la principal:
//   TURSO_DATABASE_URL=$TURSO_DEMO_URL TURSO_AUTH_TOKEN=$TURSO_DEMO_AUTH_TOKEN \
//     node scripts/seed-capacitacion.mjs

import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url) {
  console.error('falta TURSO_DATABASE_URL')
  process.exit(1)
}

const db = createClient({ url, authToken })
const ahora = Date.now()

const PROGRAMA = {
  slug: 'ia-aplicada-al-trabajo-diario',
  title: 'IA aplicada al trabajo diario',
  summary:
    'Taller práctico para equipos que no programan: cómo usar inteligencia artificial en las tareas que ya hacen todos los días, con los documentos y procesos reales de la organización.',
  audience: 'Equipos no técnicos: ventas, administración, servicio al cliente y operaciones.',
  format: 'taller',
  duration_hours: 4,
  level: 'intro',
  outcomes: JSON.stringify([
    'Identificar en el propio puesto tres tareas donde la IA ahorra tiempo de verdad, y varias donde no.',
    'Escribir instrucciones que devuelvan un resultado usable a la primera, en vez de una respuesta genérica.',
    'Revisar y corregir lo que produce un modelo, con criterio para detectar cuándo se está inventando datos.',
    'Saber qué información NO se puede pegar en una herramienta externa y por qué.',
  ]),
  modules: JSON.stringify([
    'Qué hace y qué no hace un modelo de lenguaje, sin metáforas engañosas',
    'Instrucciones que funcionan: contexto, formato de salida y ejemplos',
    'Trabajo sobre documentos propios: correos, informes, actas y respuestas a clientes',
    'Verificación: cómo detectar una respuesta segura de sí misma y equivocada',
    'Límites, datos sensibles y qué queda registrado al usar una herramienta externa',
  ]),
  price_note: 'Desde $1.800.000 COP por sesión cerrada (hasta 15 personas)',
  sort_order: 0,
  is_public: 1,
}

const RECURSOS = [
  {
    slug: 'que-hacer-el-lunes-siguiente',
    title: 'Qué hacer el lunes siguiente',
    summary:
      'Tres usos de IA que sobreviven a la semana siguiente de una capacitación, y por qué la mayoría no lo hace.',
    kind: 'guia',
    level: 'intro',
    visibility: 'publico',
    topics: JSON.stringify(['adopción', 'primeros pasos', 'equipos no técnicos']),
    sort_order: 0,
    body: `La mayoría de las capacitaciones en IA fracasan por la misma razón: enseñan
una herramienta impresionante y no la conectan con ninguna tarea concreta. A la
semana siguiente nadie la abre, porque nadie tenía una razón para abrirla.

Esta guía es lo contrario. Tres usos, aburridos a propósito, que se sostienen.

## 1. Redactar el primer borrador, nunca el final

El modelo es bueno arrancando y mediocre cerrando. Úsalo para pasar de la hoja
en blanco a un borrador con estructura, y quédate tú con la edición.

Sirve especialmente para correos difíciles, respuestas a reclamos, actas de
reunión y descripciones de producto.

> Regla práctica: si vas a mandar el texto tal como salió, el uso está mal
> planteado. Lo que se gana es el arranque, no la firma.

## 2. Convertir formatos

Es el uso menos vistoso y el que más tiempo devuelve. Pasar de notas sueltas a
un acta ordenada. De una transcripción de una hora a cinco puntos de acuerdo. De
una tabla desordenada a un resumen por categoría.

Aquí el riesgo de invención es bajo, porque la información ya está en el texto
que entregaste: el modelo la reorganiza, no la produce.

## 3. Preguntarle a un documento que no vas a leer entero

Contratos, manuales, pliegos, informes de sesenta páginas. Pegar el documento y
preguntar puntualmente es mucho más rápido que buscar con Ctrl+F por palabras
que no sabes cómo están escritas.

**Con una condición innegociable:** toda respuesta que vayas a usar para decidir
algo se verifica contra el documento original. El modelo puede citar una
cláusula que no existe con total seguridad.

---

## Lo que no funciona

- **Pedirle cifras que no le diste.** No sabe cuánto vendió tu empresa el mes
  pasado, y si se lo preguntas, se lo inventa con formato convincente.
- **Delegar la decisión.** Puede ordenar los argumentos de una decisión; no
  puede tomarla ni cargar con ella.
- **Pegar datos personales de clientes o información confidencial** en una
  herramienta que no está aprobada por la organización. Ese es un problema
  legal, no técnico.

## El único indicador que importa

A los treinta días, pregúntale al equipo cuántas veces usó IA en la semana. Si
la respuesta es "ninguna", la capacitación no sirvió, por bien que se haya
sentido el día del taller.`,
  },
  {
    slug: 'prompts-para-atencion-al-cliente',
    title: 'Banco de prompts para atención al cliente',
    summary:
      'Instrucciones listas para usar en respuestas a reclamos, seguimientos y cierres de venta, con el patrón que las hace funcionar.',
    kind: 'prompt',
    level: 'intro',
    visibility: 'con_codigo',
    topics: JSON.stringify(['prompts', 'servicio al cliente', 'ventas']),
    sort_order: 1,
    body: `Este material se entrega a los equipos que asistieron al taller. Los prompts
están escritos para pegarse tal cual y ajustarse después.

## El patrón que hay detrás

Todos siguen la misma estructura, y entenderla vale más que la lista:

1. **Rol y contexto**: quién responde y para qué organización.
2. **La materia prima**: el mensaje del cliente, pegado literal.
3. **El resultado esperado**: formato, extensión y tono.
4. **Los límites**: qué no puede prometer.

El cuarto punto es el que casi nadie escribe y el que evita la mayoría de los
problemas.

## Respuesta a un reclamo

\`\`\`
Eres quien responde los mensajes de servicio al cliente de [EMPRESA],
una [DESCRIPCIÓN EN UNA LÍNEA].

Este es el mensaje del cliente:
"[PEGAR MENSAJE]"

Escribe una respuesta que:
- reconozca el problema concreto, sin frases de manual
- explique el siguiente paso y en cuánto tiempo ocurre
- no supere las 120 palabras

No prometas reembolsos, descuentos ni fechas que no aparezcan
en el mensaje. Si falta información para responder, di qué dato
hace falta pedirle al cliente.
\`\`\`

## Seguimiento a una cotización sin respuesta

\`\`\`
Escribe un mensaje corto de seguimiento a un cliente que recibió
una cotización hace [N] días y no ha respondido.

Contexto: [QUÉ SE COTIZÓ Y POR CUÁNTO]

Tono: cercano, sin presión y sin disculparse por escribir.
Máximo 60 palabras. Termina con una sola pregunta concreta.
\`\`\`

## Resumen de una conversación larga

\`\`\`
Resume esta conversación con un cliente en tres partes:
1. qué pidió
2. qué se le prometió y con qué fecha
3. qué queda pendiente de nuestro lado

Conversación:
"[PEGAR]"

Si algo no está claro en la conversación, escríbelo como
"sin definir" en vez de deducirlo.
\`\`\`

---

## Antes de mandar cualquier respuesta

- ¿La fecha o el precio que aparece salió del mensaje original, o lo puso el
  modelo por su cuenta?
- ¿Suena a persona de esta empresa, o a chatbot genérico?
- ¿Promete algo que no puedes cumplir?

Esa revisión toma quince segundos y es la diferencia entre ahorrar tiempo y
crear un problema nuevo.`,
  },
]

async function existe(tabla, slug) {
  const r = await db.execute({
    sql: `select id from ${tabla} where slug = ? limit 1`,
    args: [slug],
  })
  return r.rows[0]?.id ?? null
}

let programaId = await existe('training_programs', PROGRAMA.slug)
if (programaId) {
  console.log(`programa ya existía (id ${programaId}), no se toca`)
} else {
  const r = await db.execute({
    sql: `insert into training_programs
      (slug, title, summary, audience, format, duration_hours, level, outcomes, modules, price_note, sort_order, is_public, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id`,
    args: [
      PROGRAMA.slug, PROGRAMA.title, PROGRAMA.summary, PROGRAMA.audience,
      PROGRAMA.format, PROGRAMA.duration_hours, PROGRAMA.level, PROGRAMA.outcomes,
      PROGRAMA.modules, PROGRAMA.price_note, PROGRAMA.sort_order, PROGRAMA.is_public,
      ahora, ahora,
    ],
  })
  programaId = r.rows[0].id
  console.log(`programa creado (id ${programaId}): ${PROGRAMA.title}`)
}

for (const r of RECURSOS) {
  const ya = await existe('training_resources', r.slug)
  if (ya) {
    console.log(`recurso ya existía (id ${ya}), no se toca: ${r.title}`)
    continue
  }
  const res = await db.execute({
    sql: `insert into training_resources
      (slug, title, summary, kind, body, program_id, level, topics, visibility, views, sort_order, published_at, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?) returning id`,
    args: [
      r.slug, r.title, r.summary, r.kind, r.body, programaId, r.level,
      r.topics, r.visibility, r.sort_order, ahora, ahora, ahora,
    ],
  })
  console.log(`recurso creado (id ${res.rows[0].id}, ${r.visibility}): ${r.title}`)
}

console.log('\nlisto')
