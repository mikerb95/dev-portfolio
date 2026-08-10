// Empaqueta los diagramas UML de /docs en un solo documento con formato APA 7.
//
// Los diagramas no se copian a mano: se leen del sitio ya renderizado (los de
// motor propio salen del SSR, los de Mermaid se pintan en el navegador), de
// modo que el documento nunca se desincroniza del código. Uso:
//
//   npm run dev          # en otra terminal
//   node scripts/export-uml-apa.mjs
//
// Produce manuales_sena/Diagramas-UML-CodeByMike.pdf. La numeración de la
// tabla de contenido se resuelve en dos pasadas: se imprime un PDF tentativo,
// se leen las páginas reales con pdftotext y se vuelve a imprimir.

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.UML_BASE_URL ?? 'http://localhost:4321'
const SALIDA = join(RAIZ, 'manuales_sena', 'Diagramas-UML-CodeByMike.pdf')
const SALIDA_DOCX = join(RAIZ, 'manuales_sena', 'Diagramas-UML-CodeByMike.docx')

// ── Datos de portada ────────────────────────────────────────────────────────
const PORTADA = {
  titulo: 'Modelado con UML del sistema CodeByMike',
  subtitulo: 'Portafolio, panel de control y portal de clientes',
  autor: 'Michael David Rodríguez Beltrán',
  programa: 'Análisis y Desarrollo de Software (ADSO), ficha 3114731',
  institucion: 'Servicio Nacional de Aprendizaje (SENA)',
  centro: 'Centro de Servicios Financieros, Regional Distrito Capital',
  curso: 'Introducción al lenguaje de modelado UML',
  docente: '[Nombre de la instructora]',
  fecha: new Date().toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
}

// ── 1. Extracción de los SVG desde el sitio ─────────────────────────────────
const PAGINAS = [
  ['/docs/casos-de-uso', 'casos-de-uso'],
  ['/docs/diagrama-secuencia', 'secuencia'],
  ['/docs/diagrama-comunicacion', 'comunicacion'],
  ['/docs/diagrama-actividades', 'actividades'],
  ['/docs/diagrama-clases', 'clases'],
  ['/docs/diagrama-objetos', 'objetos'],
  ['/docs/diagrama-componentes', 'componentes'],
  ['/docs/diagrama-despliegue', 'despliegue'],
  ['/docs/diagrama-paquetes', 'paquetes'],
]

async function extraer(browser) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1200 } })
  const porTipo = {}

  for (const [ruta, clave] of PAGINAS) {
    await page.goto(BASE + ruta, { waitUntil: 'networkidle' })
    // Mermaid pinta en cliente: sin esta espera se extraería el <pre> crudo.
    await page
      .waitForFunction(
        () => document.querySelectorAll('pre.mermaid:not([data-processed])').length === 0,
        null,
        { timeout: 30000 },
      )
      .catch(() => {})
    await page.waitForTimeout(1500)

    porTipo[clave] = await page.evaluate(() => {
      // Los motores propios pintan con var(--uml-*) y clases definidas en la
      // hoja de estilos del sitio. Sacado el SVG de la página, esas
      // referencias no resuelven y el navegador cae en negro sólido, así que
      // se congelan los valores computados como estilo en línea.
      const PROPS = [
        // Mermaid mete los títulos de clase en un foreignObject: ahí el texto
        // es HTML y se pinta con color, no con fill.
        'color',
        'fill',
        'fill-opacity',
        'stroke',
        'stroke-width',
        'stroke-dasharray',
        'stroke-linecap',
        'stroke-linejoin',
        'stroke-opacity',
        // Sin paint-order, el halo que separa el texto de las líneas se pinta
        // encima de la letra y la borra: el texto queda invisible.
        'paint-order',
        'opacity',
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'text-anchor',
        'dominant-baseline',
        'letter-spacing',
      ]
      const congelar = (svg) => {
        const clon = svg.cloneNode(true)
        const orig = [svg, ...svg.querySelectorAll('*')]
        const copia = [clon, ...clon.querySelectorAll('*')]
        for (let i = 0; i < orig.length; i++) {
          const cs = getComputedStyle(orig[i])
          const decl = []
          for (const p of PROPS) {
            const v = cs.getPropertyValue(p)
            if (v && v !== 'normal' && v !== 'auto' && v !== 'none' && v !== '0px') {
              decl.push(`${p}:${v}`)
            } else if (v === 'none' && (p === 'fill' || p === 'stroke')) {
              decl.push(`${p}:none`)
            }
          }
          copia[i].setAttribute('style', decl.join(';'))
        }
        return clon.outerHTML
      }

      const out = []
      for (const svg of document.querySelectorAll('svg')) {
        if (svg.closest('nav, header, footer, a, button')) continue
        if (svg.getAttribute('aria-hidden') === 'true') continue // muestras de notación
        const r = svg.getBoundingClientRect()
        if (r.width < 260 || r.height < 120) continue
        const sec = svg.closest('section') || svg.parentElement?.parentElement
        const h = sec?.querySelector('h2, h1')
        const ps = sec ? [...sec.querySelectorAll('p')].map((p) => p.textContent.trim()) : []
        out.push({
          titulo: h ? h.textContent.trim() : '',
          desc: ps.find((t) => t.length > 30) || '',
          svg: congelar(svg),
        })
      }
      return out
    })
    console.log(`  ${ruta}: ${porTipo[clave].length} figura(s)`)
  }

  await page.close()
  return porTipo
}

// ── 2. Paso a paleta clara ──────────────────────────────────────────────────
// El sitio es oscuro y el papel es blanco. En vez de mantener un mapa de
// equivalencias color a color (que se rompe con cada retoque de la paleta),
// se invierte la luminancia y se conservan tono y saturación: los fondos
// oscuros se vuelven claros, el texto claro se vuelve oscuro y los acentos
// siguen siendo reconocibles como el mismo color de marca.
function invertirLuminancia(rgb) {
  const [r, g, b] = rgb.map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  // Invertir a secas deja trazos gris medio que en papel se pierden: se
  // oscurece lo que queda oscuro y se lleva a blanco puro lo casi blanco.
  let nl = 1 - l
  if (nl < 0.65) nl *= 0.5
  else if (nl > 0.9) nl = 1
  const c = (1 - Math.abs(2 * nl - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = nl - c / 2
  const seg = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.floor(h / 60) % 6]
  return seg.map((v) => Math.round((v + m) * 255))
}

const RE_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+\s*(?:[,/]\s*[\d.%]+\s*)?\)/g

function aclararSvg(svg) {
  return svg.replace(RE_COLOR, (col) => {
    let r, g, b
    let alfa = null
    if (col.startsWith('#')) {
      let hex = col.slice(1)
      if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('')
      if (hex.length !== 6 && hex.length !== 8) return col
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
      if (hex.length === 8) alfa = (parseInt(hex.slice(6, 8), 16) / 255).toFixed(3)
    } else {
      const n = col.match(/[\d.]+%?/g)
      if (!n || n.length < 3) return col
      ;[r, g, b] = n.slice(0, 3).map(Number)
      if (n[3] !== undefined) alfa = n[3].endsWith('%') ? parseFloat(n[3]) / 100 : Number(n[3])
    }
    const [nr, ng, nb] = invertirLuminancia([r, g, b])
    return alfa === null
      ? `#${[nr, ng, nb].map((v) => v.toString(16).padStart(2, '0')).join('')}`
      : `rgba(${nr}, ${ng}, ${nb}, ${alfa})`
  })
}

// Mermaid emite width="100%": para poder escalar la figura al hueco de papel
// hace falta que el SVG declare sus dimensiones nativas.
function dimensionesNativas(svg) {
  const vb = svg.match(/viewBox="([-\d.\s]+)"/)
  if (!vb) return null
  const [x, y, w, h] = vb[1].trim().split(/\s+/).map(Number)
  return { x, y, w, h }
}

// Una figura mucho más alta que ancha, encogida hasta caber en una página, se
// vuelve ilegible. Se corta en franjas horizontales del mismo SVG (mismo
// dibujo, distinto viewBox) con un solape que evita partir una caja en dos.
const RATIO_PAGINA = 19 / 16.5 // caja de una figura a hoja completa (alto/ancho)
// Hasta este alargamiento la figura se escala por la altura y sigue siendo
// legible; más allá, el ancho resultante sería una columna demasiado angosta.
const RATIO_MAXIMO = 2.2
const SOLAPE = 90

function trocear(svg) {
  const d = dimensionesNativas(svg)
  if (!d) return [{ svg, parte: 0, total: 1 }]
  const ratio = d.h / d.w
  if (ratio <= RATIO_MAXIMO) return [{ svg, parte: 0, total: 1 }]

  const total = Math.ceil(ratio / RATIO_PAGINA)
  const alto = d.h / total
  const trozos = []
  for (let i = 0; i < total; i++) {
    const y0 = d.y + i * alto - (i > 0 ? SOLAPE : 0)
    const h = alto + (i > 0 ? SOLAPE : 0)
    trozos.push({
      svg: svg.replace(/viewBox="[^"]*"/, `viewBox="${d.x} ${y0} ${d.w} ${h}"`),
      parte: i + 1,
      total,
      w: d.w,
      h,
    })
  }
  return trozos
}

// El diagrama de casos de uso es una pila de subsistemas independientes: una
// caja por módulo con su actor al lado. Cortarlo en franjas de altura fija
// partía cajas por la mitad, así que se separa por sus propias fronteras y
// cada subsistema pasa a ser una figura suelta, libre de saltar de página.
function partirPorBloques(svg) {
  const d = dimensionesNativas(svg)
  if (!d) return null

  // Las fronteras del sistema son los únicos rect sin relleno y altos.
  const marcos = [...svg.matchAll(/<rect\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((r) => /fill="none"/.test(r))
    .map((r) => ({
      x: Number(r.match(/\bx="([-\d.]+)"/)?.[1]),
      y: Number(r.match(/\by="([-\d.]+)"/)?.[1]),
      w: Number(r.match(/\bwidth="([-\d.]+)"/)?.[1]),
      h: Number(r.match(/\bheight="([-\d.]+)"/)?.[1]),
    }))
    .filter((b) => Number.isFinite(b.y) && Number.isFinite(b.h) && b.h > 60)
    .sort((a, b) => a.y - b.y)

  if (marcos.length < 2) return null

  const textos = [...svg.matchAll(/<text\b[^>]*\by="([-\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({
    y: Number(m[1]),
    txt: m[2].trim(),
  }))
  // Solo las etiquetas de la columna del actor: las de los óvalos van mucho
  // más a la derecha, y sin este filtro el rótulo acababa siendo un caso de uso.
  const etiquetas = [
    ...svg.matchAll(/<foreignObject\b[^>]*\bx="([-\d.]+)"[^>]*\by="([-\d.]+)"[^>]*>([\s\S]*?)<\/foreignObject>/g),
  ]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), txt: m[3].replace(/<[^>]*>/g, '').trim() }))
    .filter((e) => e.x < 120)

  const MARGEN_SUP = 12
  const MARGEN_INF = 48 // deja sitio al nombre del actor sin invadir el bloque siguiente
  const MARGEN_DER = 16

  return marcos.map((b) => {
    const titulo = textos.find((t) => t.y > b.y && t.y < b.y + 34)?.txt ?? ''
    // El actor va a la izquierda, centrado verticalmente en su bloque.
    const actor = etiquetas
      .filter((e) => e.y > b.y && e.y < b.y + b.h + MARGEN_INF)
      .sort((p, q) => Math.abs(p.y - (b.y + b.h / 2)) - Math.abs(q.y - (b.y + b.h / 2)))[0]
    // También en horizontal: un bloque angosto dentro del ancho del diagrama
    // completo dejaría media hoja en blanco y el texto ilegible de pequeño.
    const ancho = Number.isFinite(b.x) && Number.isFinite(b.w) ? b.x + b.w + MARGEN_DER : d.w
    const alto = b.h + MARGEN_SUP + MARGEN_INF
    return {
      svg: svg.replace(
        /viewBox="[^"]*"/,
        `viewBox="${d.x} ${b.y - MARGEN_SUP} ${ancho} ${alto}"`,
      ),
      w: ancho,
      h: alto,
      parte: 0,
      total: 1,
      titulo: [titulo, actor?.txt].filter(Boolean).join(' - '),
    }
  })
}

function prepararFigura(svg, { porBloques = false } = {}) {
  const claro = aclararSvg(svg)
  const partes = (porBloques && partirPorBloques(claro)) || trocear(claro)
  return partes.map((t) => {
    const d = t.w ? { w: t.w, h: t.h } : dimensionesNativas(t.svg) ?? { w: 800, h: 600 }
    // Un SVG en línea no es un elemento reemplazado: max-height lo aplasta en
    // vez de reducirlo en proporción. El tamaño lo fija un marco con
    // aspect-ratio y el SVG se limita a llenarlo.
    // Solo la etiqueta de apertura: los SVG de Mermaid no declaran height en
    // la raíz, y una limpieza global se llevaba por delante el height del
    // primer foreignObject, dejando sin pintar el título de esa clase.
    const con = t.svg.replace(
      /^<svg[^>]*>/,
      (raiz) =>
        raiz
          .replace(/\swidth="[^"]*"/, '')
          .replace(/\sheight="[^"]*"/, '')
          .replace(/\sstyle="[^"]*"/, '')
          .replace(/\spreserveAspectRatio="[^"]*"/, '')
          .replace('<svg', '<svg preserveAspectRatio="xMidYMid meet"'),
    )
    return { ...t, svg: con, ratio: d.h / d.w, ar: (d.w / d.h).toFixed(4) }
  })
}

// ── 3. Contenido redactado del documento ────────────────────────────────────
const p = (t) => `<p>${t}</p>`

const SECCIONES = [
  {
    nivel: 1,
    id: 'introduccion',
    titulo: 'Introducción',
    cuerpo: [
      p(
        `El lenguaje unificado de modelado (UML, por sus siglas en inglés) surgió en 1994 del trabajo conjunto de Rumbaugh, Booch y Jacobson, y fue adoptado como estándar por el Object Management Group en su versión 1.1 de 1997 (Servicio Nacional de Aprendizaje [SENA], 2018). Su propósito es representar de manera gráfica y estandarizada los modelos de un sistema, de modo que un diseño pueda compartirse entre distintos diseñadores y entre el equipo de desarrollo y el cliente sin depender de un lenguaje de programación concreto (Rumbaugh et al., 2007).`,
      ),
      p(
        `Este documento reúne los diagramas UML elaborados para el sistema CodeByMike, una plataforma que integra un portafolio público, un panel de control administrativo, un portal de clientes y un laboratorio de ingeniería. Cada diagrama se acompaña de la definición del tipo al que pertenece, la notación empleada y una interpretación de lo que el modelo revela sobre el sistema, siguiendo la secuencia pedagógica propuesta en la guía Introducción al lenguaje de modelado UML (SENA, 2018).`,
      ),
      p(
        `Los diagramas no se dibujaron en una herramienta externa: se generan desde el propio código fuente del sistema, ya sea mediante Mermaid o mediante motores de trazado escritos para el proyecto, y se exportaron a este documento directamente desde la aplicación en ejecución. Esa decisión garantiza que el modelo aquí presentado corresponda al sistema tal como está construido y no a una versión que quedó desactualizada al primer cambio de código.`,
      ),
    ],
  },
  {
    nivel: 1,
    id: 'objetivos',
    titulo: 'Objetivos',
    cuerpo: [
      `<h3>Objetivo general</h3>`,
      p(
        `Documentar el análisis y el diseño del sistema CodeByMike mediante los diagramas del lenguaje unificado de modelado, de manera que la estructura y el comportamiento de la solución queden representados en una notación estándar y verificable.`,
      ),
      `<h3>Objetivos específicos</h3>`,
      `<ul>
        <li>Identificar los actores y las funcionalidades del sistema a través de diagramas de casos de uso.</li>
        <li>Describir el comportamiento dinámico de las funcionalidades críticas con diagramas de secuencia, comunicación y actividades.</li>
        <li>Representar la estructura estática de la solución con diagramas de clases, objetos, componentes, despliegue y paquetes.</li>
        <li>Relacionar cada diagrama con el elemento del código fuente que lo implementa, para conservar la trazabilidad entre el modelo y el sistema construido.</li>
      </ul>`,
    ],
  },
  {
    nivel: 1,
    id: 'marco',
    titulo: 'Marco conceptual',
    cuerpo: [
      p(
        `UML es un lenguaje centrado en la representación gráfica de un sistema, que indica cómo crear y leer los modelos representando flujos de trabajo mediante elementos gráficos (SENA, 2018). Sus cuatro propósitos son visualizar el sistema de forma que otros lo comprendan, especificar sus características antes del desarrollo, construir los sistemas diseñados a partir de los modelos y documentar la solución para facilitar su mantenimiento posterior.`,
      ),
      p(
        `Un modelo UML se compone de tres bloques de construcción. Los elementos son abstracciones de cosas reales o ficticias, con identidad propia y distinguibles entre sí; las relaciones vinculan esos elementos y dotan de funcionalidad al sistema; los diagramas reflejan gráficamente el comportamiento y las relaciones entre elementos (SENA, 2018). La especificación vigente del estándar, UML 2.5.1, clasifica los diagramas en dos grandes familias: los de estructura, que describen la organización estática del sistema, y los de comportamiento, que describen su dinámica (Object Management Group [OMG], 2017).`,
      ),
      p(
        `Esa clasificación organiza el presente documento. Primero se presentan los diagramas de comportamiento, porque el análisis parte de lo que el sistema debe hacer y de quién lo solicita; después los de estructura, que responden a cómo se organiza internamente para hacerlo. Larman (2007) sostiene precisamente que el orden natural del análisis orientado a objetos va del comportamiento observable hacia la asignación de responsabilidades entre clases.`,
      ),
    ],
  },
  {
    nivel: 1,
    id: 'sistema',
    titulo: 'Descripción del sistema modelado',
    cuerpo: [
      p(
        `CodeByMike es un sistema de información desplegado en producción bajo el dominio codebymike.tech. Reúne cuatro subsistemas que comparten una misma base de datos y una misma capa de seguridad: un portafolio público con contenido técnico, un panel de control administrativo que gestiona clientes, proyectos, costos y cobros, un portal privado donde cada cliente consulta el estado de sus proyectos y sus facturas, y un laboratorio de ingeniería que expone las pruebas, los indicadores de nivel de servicio y la observabilidad de seguridad del propio sistema.`,
      ),
      p(
        `El sistema se construyó con Astro sobre renderizado del lado del servidor, una base de datos libSQL gestionada con Drizzle, y se despliega sobre una plataforma de cómputo sin servidor. Tres mecanismos de autenticación conviven sin compartir estado: el acceso administrativo mediante OAuth con lista de permitidos, el portal de clientes con credenciales propias, y un pase temporal para la demostración pública de solo lectura. Esta separación, que resulta invisible en la interfaz, es una de las decisiones de diseño que los diagramas hacen explícita.`,
      ),
      p(
        `Los diagramas que siguen no describen un sistema hipotético: cada actor, cada clase y cada nodo de despliegue corresponde a un elemento existente en el código fuente o en la infraestructura de producción. Bajo cada figura se indica, cuando aplica, el módulo que la implementa.`,
      ),
    ],
  },
]

// Texto propio de cada tipo de diagrama. Las figuras se insertan al final de
// cada bloque, en el orden en que aparecen en el sitio.
const TIPOS = [
  {
    clave: 'casos-de-uso',
    parte: 'Diagramas de comportamiento',
    titulo: 'Diagrama de casos de uso',
    cuerpo: [
      p(
        `El diagrama de casos de uso muestra las relaciones entre los actores y el sistema, y modela la funcionalidad según la percepción del usuario externo (SENA, 2018). Es responsable de documentar los macrorrequisitos: puede leerse como la lista de funcionalidades que el sistema debe proporcionar. Fowler y Scott (1997) advierten que su valor no está en el dibujo sino en la disciplina de delimitar qué queda dentro y qué queda fuera de la frontera del sistema.`,
      ),
      p(
        `La notación emplea tres componentes. El sistema se representa mediante un rectángulo que delimita gráficamente lo que está dentro (los casos de uso) y lo que está fuera (los actores). El actor se representa mediante una figura humana esquemática e indica el tipo de usuario que podrá ejecutar alguna función. El caso de uso se representa mediante un óvalo y se nombra con un verbo en infinitivo que expresa la función a realizar (SENA, 2018).`,
      ),
      p(
        `Entre esos elementos se dan tres tipos de relaciones. La asociación, trazada del actor al caso de uso, indica que el actor lleva a cabo esa funcionalidad. La relación de inclusión, marcada con el estereotipo &lt;&lt;include&gt;&gt;, se da cuando un caso de uso incorpora obligatoriamente el comportamiento de otro. La relación de extensión, marcada con &lt;&lt;extend&gt;&gt;, señala que un caso de uso amplía o especializa a otro en circunstancias determinadas.`,
      ),
      p(
        `Las figuras siguientes presentan el diagrama de casos de uso del sistema, una por subsistema: cada figura muestra la frontera de un módulo, los casos de uso que contiene y el actor que los ejecuta. Se presentan por separado, y no como un único diagrama, porque el conjunto completo no cabe en una hoja con un tamaño de letra legible; la lectura conjunta se obtiene recorriéndolas en orden. Los actores identificados son el administrador, el cliente, el visitante público y los sistemas externos que actúan sin intervención humana, como el planificador de tareas programadas y la pasarela de pagos. Su inclusión como actores obedece a que inician casos de uso por su cuenta: la técnica no exige que un actor sea una persona, sino una entidad externa a la frontera del sistema.`,
      ),
    ],
  },
  {
    clave: 'secuencia',
    titulo: 'Diagrama de secuencia',
    cuerpo: [
      p(
        `Los diagramas de secuencia describen el funcionamiento interno del sistema desde el punto de vista de la implementación y forman parte de la vista de interacción de UML (SENA, 2018). Cada objeto se dibuja como una caja en la parte superior de una línea vertical punteada, llamada línea de vida, que representa su existencia durante la interacción; cada mensaje es una flecha entre dos líneas de vida, y el orden de los mensajes transcurre de arriba hacia abajo.`,
      ),
      p(
        `Se distinguen dos tipos de mensajes. Los sincrónicos corresponden a llamadas a métodos en las que el emisor queda bloqueado hasta que la llamada termina, y se representan con flechas de cabeza llena. Los asincrónicos terminan de inmediato y crean un nuevo hilo de ejecución dentro de la secuencia; se representan con flechas de cabeza abierta, y la respuesta a un mensaje se dibuja con una flecha discontinua (SENA, 2018).`,
      ),
      p(
        `Las cuatro interacciones modeladas corresponden a los casos de uso de mayor riesgo del sistema: la autenticación del administrador, el ciclo de monitoreo que abre incidentes, la aplicación de las defensas de seguridad en cada petición y el procesamiento de un webhook de pago. Se eligieron esos cuatro porque son los flujos donde un error no degrada una función sino que compromete datos, dinero o disponibilidad.`,
      ),
    ],
  },
  {
    clave: 'comunicacion',
    titulo: 'Diagrama de comunicación',
    cuerpo: [
      p(
        `El diagrama de comunicación, llamado de colaboración en UML 1.0, transmite la misma información que un diagrama de secuencia. La diferencia está en el énfasis: el de secuencia destaca el orden en que se emiten los mensajes e incorpora la línea de vida de cada objeto, mientras que el de comunicación destaca la relación entre los objetos y genera una visión espacial del sistema durante la ejecución de un proceso (SENA, 2018).`,
      ),
      p(
        `Sus componentes gráficos son los del diagrama de secuencia salvo por dos diferencias: no se emplea la línea de vida y cada mensaje lleva un número que identifica el orden en que debe ejecutarse. La numeración es, por tanto, el único portador de la secuencia temporal.`,
      ),
      p(
        `Los cuatro diagramas siguientes representan las mismas interacciones de la sección anterior, vistas ahora por su estructura. El contraste entre ambas vistas es deliberado: la representación espacial revela con qué otros objetos se acopla cada participante, información que la vista temporal dispersa a lo largo del eje vertical.`,
      ),
    ],
  },
  {
    clave: 'actividades',
    titulo: 'Diagrama de actividades',
    cuerpo: [
      p(
        `El diagrama de actividades muestra el flujo de actividades dentro de un sistema, cubre su parte dinámica y resalta el flujo de control entre objetos (SENA, 2018). Es similar al diagrama de flujo tradicional, con una diferencia decisiva: permite representar actividades concurrentes, es decir, pasos que se ejecutan en paralelo y luego se unen. En el contexto de la orientación a objetos se usa habitualmente para detallar los pasos lógicos que requiere un caso de uso.`,
      ),
      p(
        `La notación empleada es la siguiente. El inicio es un círculo relleno, y todo diagrama posee uno solo. El fin es un círculo que rodea a un círculo relleno. Las actividades son rectángulos de vértices redondeados, y las flechas que las enlazan se denominan transiciones. La decisión se representa mediante un rombo del que parten los caminos alternativos, cada uno con su condición. El inicio y el fin de una ruta concurrente se representan mediante una línea horizontal sólida (SENA, 2018).`,
      ),
      p(
        `Se modelaron tres procesos: la atención de una solicitud en la capa intermedia de seguridad, el flujo de integración y despliegue continuo con reversión automática, y la aplicación idempotente de un evento de la pasarela de pagos. Los tres contienen bifurcaciones condicionales, y los dos primeros contienen además rutas concurrentes, lo que justifica el uso de este diagrama frente a un diagrama de flujo convencional.`,
      ),
    ],
  },
  {
    clave: 'clases',
    parte: 'Diagramas de estructura',
    titulo: 'Diagrama de clases',
    cuerpo: [
      p(
        `El diagrama de clases es el más común para describir el diseño de los sistemas orientados a objetos: muestra un conjunto de clases con sus atributos, operaciones, interfaces y relaciones (SENA, 2018). Una clase es la unidad básica que agrupa una colección de objetos con un mismo comportamiento, y se compone de tres partes: el nombre, los atributos o propiedades, y los métodos u operaciones, que se identifican con verbos en infinitivo.`,
      ),
      p(
        `La visibilidad de atributos y métodos se indica con un símbolo antepuesto. El signo más (+) corresponde a visibilidad pública, accesible desde cualquier punto; el signo menos (−) a visibilidad privada, accesible solo desde dentro de la clase; y la almohadilla (#) a visibilidad protegida, accesible desde la clase y sus subclases pero no desde fuera (SENA, 2018).`,
      ),
      p(
        `Las relaciones entre clases pueden ser de herencia, asociación, agregación, composición y dependencia. La composición expresa una relación estática de parte y todo, en la que el tiempo de vida del objeto incluido depende del que lo incluye; la agregación expresa una relación dinámica en la que ambos tiempos de vida son independientes; la asociación vincula objetos que colaboran sin que uno dependa del otro para existir; y la dependencia indica que una clase instancia o crea objetos de otra (SENA, 2018; Larman, 2007).`,
      ),
      p(
        `El modelo de datos del sistema se presenta dividido en cuatro vistas temáticas, no porque sean subsistemas aislados sino porque un único diagrama con todas las entidades resultaría ilegible en papel. Las vistas corresponden a la gestión comercial y financiera, la observabilidad y el laboratorio, la seguridad, y el currículo y la formación.`,
      ),
    ],
  },
  {
    clave: 'objetos',
    titulo: 'Diagrama de objetos',
    cuerpo: [
      p(
        `Un diagrama de objetos es en esencia muy similar a uno de clases, pero su propósito es modelar el sistema en un momento determinado a partir de las instancias derivadas de las clases (SENA, 2018). En lugar de presentar el nombre de la clase como una abstracción general, presenta un objeto concreto, lo que aporta claridad al modelo. Se emplean los mismos componentes que en el diagrama de clases, con la salvedad de que se omite la multiplicidad, pues esta se observa de manera explícita al incorporar varias instancias de una misma clase.`,
      ),
      p(
        `La sintaxis del nombre de un objeto es nombreObjeto:NombreClase. Las dos instantáneas que siguen se construyeron con datos que efectivamente ocurren en producción, y cumplen una función de verificación: si una configuración real no puede representarse con el diagrama de clases vigente, el modelo estructural está incompleto.`,
      ),
    ],
  },
  {
    clave: 'componentes',
    titulo: 'Diagrama de componentes',
    cuerpo: [
      p(
        `El diagrama de componentes representa las piezas que conforman una aplicación, junto con sus relaciones, interacciones e interfaces públicas (SENA, 2018). Modela el sistema a partir de las unidades desde las cuales se construye la aplicación, y resulta especialmente útil para comprender sistemas grandes como composición de partes pequeñas.`,
      ),
      p(
        `La notación se apoya en la metáfora de bola y enchufe: una interfaz proporcionada, aquello que el componente ofrece, se dibuja como un círculo sólido en el extremo de una línea; una interfaz requerida, aquello que el componente necesita, se dibuja como un semicírculo abierto hacia la interfaz con la que se acopla. Cuando la bola encaja dentro del enchufe se representa un conector de ensamblaje, es decir, una dependencia real entre los dos componentes.`,
      ),
    ],
  },
  {
    clave: 'despliegue',
    titulo: 'Diagrama de despliegue',
    cuerpo: [
      p(
        `El diagrama de despliegue físico muestra cómo y dónde se desplegará el sistema. Las máquinas físicas y los procesadores se representan como nodos, visualizados habitualmente como cubos, y los artefactos se ubican dentro de esos nodos para modelar el despliegue (SENA, 2018). La ubicación de cada artefacto se guía por las especificaciones de despliegue.`,
      ),
      p(
        `El caso de este sistema tiene una particularidad que el diagrama expone con claridad: no existe un servidor propio. El cómputo ocurre en funciones administradas por la plataforma de despliegue, la base de datos reside en un servicio gestionado con réplicas por región, y las tareas programadas las dispara un planificador externo mediante peticiones autenticadas. Los nodos del diagrama son, por tanto, entornos de ejecución de terceros y no máquinas bajo control directo del proyecto.`,
      ),
    ],
  },
  {
    clave: 'paquetes',
    titulo: 'Diagrama de paquetes',
    cuerpo: [
      p(
        `El diagrama de paquetes permite organizar los elementos de modelado en agrupaciones y representar las dependencias entre ellas (SENA, 2018). Sus usos más frecuentes son ordenar diagramas de casos de uso y de clases, aunque no está limitado a esos elementos.`,
      ),
      p(
        `En este sistema el diagrama de paquetes documenta una regla de arquitectura que el código debe respetar: las dependencias fluyen en una sola dirección, desde las páginas y los puntos de entrada hacia la lógica de dominio y de ahí hacia el acceso a datos, sin ciclos de retorno. Los módulos de lógica pura no dependen de la base de datos, y esa restricción es la que permite probarlos sin levantar una base de datos real.`,
      ),
    ],
  },
]

const CIERRE = [
  {
    nivel: 1,
    id: 'conclusiones',
    titulo: 'Conclusiones',
    cuerpo: [
      p(
        `El modelado con UML del sistema CodeByMike permitió representar, en una notación estándar, tanto las funcionalidades que la solución ofrece a sus actores como la estructura interna que las soporta. Los diagramas de comportamiento evidenciaron que los flujos de mayor riesgo del sistema (autenticación, monitoreo, defensa perimetral y procesamiento de pagos) comparten un mismo principio de diseño: ninguna falla en un mecanismo auxiliar debe interrumpir el flujo principal.`,
      ),
      p(
        `El contraste entre el diagrama de secuencia y el de comunicación resultó particularmente útil. Aunque ambos representan la misma interacción, la vista espacial dejó ver acoplamientos entre objetos que la vista temporal distribuye a lo largo del eje vertical y, por tanto, oculta. Esto confirma la observación de la guía en el sentido de que la elección del diagrama no es una cuestión de preferencia sino de qué pregunta se quiere responder (SENA, 2018).`,
      ),
      p(
        `Por último, generar los diagramas desde el código fuente en lugar de dibujarlos en una herramienta aparte cambió su función dentro del proyecto: dejaron de ser documentación que envejece para convertirse en una vista del sistema que se actualiza con él. Un diagrama que se desincroniza del código no solo pierde utilidad, sino que induce a error a quien lo consulta.`,
      ),
    ],
  },
]

const REFERENCIAS = [
  `Fowler, M., &amp; Scott, K. (1997). <i>UML gota a gota</i>. Pearson Educación.`,
  `Gutiérrez, C. (2011). <i>Casos prácticos de UML</i>. Editorial Complutense.`,
  `Kimmel, P. (2008). <i>Manual de UML: guía de aprendizaje</i>. McGraw-Hill Professional Publishing.`,
  `Larman, C. (2007). <i>UML y patrones: una introducción al análisis y diseño orientado a objetos y al proceso unificado</i> (2.ª ed.). Prentice Hall.`,
  `Object Management Group. (2017). <i>OMG unified modeling language (OMG UML), version 2.5.1</i>. https://www.omg.org/spec/UML/2.5.1/`,
  `Rumbaugh, J., Jacobson, I., &amp; Booch, G. (2007). <i>El lenguaje unificado de modelado: manual de referencia</i> (2.ª ed.). Addison-Wesley.`,
  `Servicio Nacional de Aprendizaje. (2018). <i>Introducción al lenguaje de modelado UML</i> [Objeto virtual de aprendizaje]. SENA, Centro Industrial de Mantenimiento Integral.`,
  `Teniente López, E. (2003). <i>Especificación de sistemas software en UML</i>. Universidad Politécnica de Catalunya.`,
]

// ── 4. Armado del HTML ──────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Cada caja de casos de uso lleva su propia leyenda explicando por qué sus
// relaciones son de inclusión o de extensión: la distinción no se ve en el
// dibujo (una flecha punteada con su estereotipo) y es justo lo que se evalúa.
// Se indexan por módulo y actor, las dos partes del rótulo de la figura.
const LEYENDAS_CASOS_USO = [
  {
    modulo: 'sitio público',
    actor: 'visitante',
    nota: 'CU-19 declara dos extensiones y ninguna inclusión. Sugerir el inglés según el idioma del navegador solo ocurre si el visitante llega con otro idioma configurado, y devolver la versión en español solo si esa página aún no está traducida; en ambos casos el caso base se completa sin ellas. Un comportamiento que siempre se ejecuta se modela como <<include>>, uno que depende de una condición como <<extend>>.',
  },
  {
    modulo: 'autenticación',
    actor: 'administrador',
    nota: 'Rechazar el login fuera de la allowlist extiende a CU-04 porque solo se activa cuando la validación de la lista de permitidos falla. El flujo principal de autenticación termina sin pasar nunca por esa extensión, que es la razón por la que no se modela como inclusión.',
  },
  {
    modulo: 'crm',
    actor: 'administrador',
    nota: 'CU-06 incluye dos pasos encadenados, registrar la interacción de seguimiento y documentar la decisión de arquitectura: son <<include>> porque el seguimiento de un proyecto no está completo sin ellos, y van encadenados porque el ADR se documenta sobre una interacción ya registrada. Publicar el ADR en la vitrina pública, en cambio, extiende al caso base: la decisión puede quedarse privada y el caso de uso igual se cumple.',
  },
  {
    modulo: 'crm',
    actor: 'cliente',
    nota: 'CU-16 incluye generar un PIN libre de colisiones y sincronizar la diapositiva por pub/sub: sin cualquiera de los dos no hay sesión proyectada, así que son obligatorios. Recoger el feedback del público al cerrar es una extensión porque ocurre al final y solo si la sesión se cierra formalmente.',
  },
  {
    modulo: 'finanzas',
    actor: 'administrador',
    nota: 'Calcular el P&L del proyecto es un <<include>> de CU-08: registrar un costo sin recalcular el resultado dejaría el proyecto con cifras inconsistentes, de modo que el paso no es opcional. Excluir un costo sin tasa de cambio es un <<extend>> porque solo se dispara ante el caso particular de un costo en otra moneda sin tasa registrada.',
  },
  {
    modulo: 'observabilidad',
    actor: 'cron',
    nota: 'Abrir el incidente y notificar la caída por push son inclusiones encadenadas: cuando el chequeo detecta la caída, ambos pasos se ejecutan siempre y en ese orden, porque la notificación necesita el incidente ya creado. Cerrar el incidente por recuperación y marcar la degradación por latencia son extensiones: dependen de condiciones distintas (que el servicio vuelva, o que responda pero lento) y ninguna forma parte del flujo básico de la alerta.',
  },
  {
    modulo: 'observabilidad',
    actor: 'administrador',
    nota: 'CU-10 no declara relaciones. Es un caso de uso atómico: consultar el presupuesto de error de un monitor no exige ningún paso compartido con otros casos ni admite variantes condicionales, y descomponerlo solo añadiría ruido al diagrama.',
  },
  {
    modulo: 'sistema',
    actor: 'administrador',
    nota: 'El backup automático por cron extiende a CU-11 porque es la misma operación disparada por otro camino, el planificador externo en lugar del administrador, y solo ocurre en esa circunstancia. En CU-18, navegar una subpágina de documentación es una inclusión (no hay consulta sin navegación) y consultar un diagrama Mermaid es una extensión, ya que solo algunas páginas de la documentación llevan diagrama.',
  },
  {
    modulo: 'lab',
    actor: 'pasarela',
    nota: 'CU-12 tiene dos extensiones y ninguna inclusión, y eso describe con precisión el diseño de idempotencia: el flujo normal aplica el evento del webhook y termina. Registrar un evento duplicado ocurre solo si la pasarela reenvía un evento ya procesado, y registrar un evento fuera de orden solo si llega uno anterior al estado actual. Ambos son desvíos condicionales, no pasos del camino feliz.',
  },
  {
    modulo: 'lab',
    actor: 'administrador',
    nota: 'Aplicar el fallo simulado en el middleware es un <<include>> de CU-13: sin ese paso el flag quedaría registrado pero no habría fallo que observar, luego el paso es parte constitutiva del caso. Desactivar todos los flags con el botón de pánico extiende al caso base porque es una salida de emergencia que solo se usa si el experimento se descontrola.',
  },
  {
    modulo: 'seguridad',
    actor: 'administrador',
    nota: 'Registrar el evento de seguridad es una inclusión de CU-14 sin excepciones: toda decisión del sensor queda en la bitácora del micro-SIEM, tanto si termina en bloqueo como si no, y una bitácora con huecos no serviría para auditar. Bloquear la IP manualmente extiende al caso porque es la vía alternativa a la que el auto-bloqueo recorre por su cuenta.',
  },
  {
    modulo: 'sitio público',
    actor: 'buscador',
    nota: 'CU-17 no declara relaciones. El actor es un sistema externo (el rastreador del buscador) y el caso de uso se agota en un intercambio: se notifica el contenido nuevo y se actualizan los recursos de indexación, sin pasos compartidos ni variantes condicionales.',
  },
]

const sinAcentos = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

function leyendaDeBloque(titulo) {
  const t = sinAcentos(titulo)
  const [modulo = '', actor = ''] = t.split(' - ')
  const hit = LEYENDAS_CASOS_USO.find(
    (l) => modulo.includes(sinAcentos(l.modulo)) && actor.includes(sinAcentos(l.actor)),
  )
  return hit?.nota ?? ''
}

// Figuras ya aclaradas, troceadas y con clave estable, para que el PDF y el
// documento de Word numeren y ordenen exactamente igual.
const cachePrep = new Map()
function figurasDe(porTipo, clave) {
  if (!cachePrep.has(clave)) {
    const lista = (porTipo[clave] ?? []).flatMap((f, i) =>
      prepararFigura(f.svg, { porBloques: clave === 'casos-de-uso' }).map((tr, j) => ({
        ...tr,
        // El corte por bloques trae su propio rótulo (el subsistema y su
        // actor); el resto hereda el título de la sección del sitio.
        titulo: tr.titulo || f.titulo,
        desc: tr.titulo ? leyendaDeBloque(tr.titulo) : f.desc,
        id: `${clave}-${i}-${j}-${tr.parte}`,
      })),
    )
    // Los bloques se recortan a su propio ancho, así que llevarlos todos al
    // ancho de la caja de texto ampliaría más el diagrama más pequeño. La
    // fracción los devuelve a una escala común: se comparan entre sí.
    const anchoMax = Math.max(...lista.map((f) => f.w || 0), 1)
    for (const f of lista) f.frac = f.w ? Math.max(0.35, f.w / anchoMax) : 1
    cachePrep.set(clave, lista)
  }
  return cachePrep.get(clave)
}

function construirHtml(porTipo, paginasToc, pngs = null) {
  let nFig = 0
  const toc = []
  const bloques = []

  // Marca invisible junto a cada encabezado: pdftotext la extrae y permite
  // saber en qué hoja cayó, sin confundirla con la mención del mismo título
  // dentro de la propia tabla de contenido.
  const registrar = (nivel, titulo) => {
    const id = 'h' + toc.length
    toc.push({ id, nivel, titulo })
    return id
  }
  const marca = (id) => `<span class="mk">[[${id}]]</span>`

  const seccion = (s) => {
    const id = registrar(s.nivel ?? 1, s.titulo)
    // El salto va en línea y no solo en la hoja de estilos: al importar el
    // HTML, Word conserva el atributo style pero descarta las reglas de clase.
    return `<section class="seccion"><h1 id="${id}" style="page-break-before:always">${s.titulo}${marca(id)}</h1>${s.cuerpo.join('\n')}</section>`
  }

  for (const s of SECCIONES) bloques.push(seccion(s))

  let parteActual = null
  let traeParte = false
  for (const t of TIPOS) {
    if (t.parte && t.parte !== parteActual) {
      parteActual = t.parte
      traeParte = true
      const id = registrar(1, t.parte)
      bloques.push(
        `<h1 id="${id}" class="parte" style="page-break-before:always">${t.parte}${marca(id)}</h1>`,
      )
    }
    const id = registrar(2, t.titulo)
    const figuras = figurasDe(porTipo, t.clave)

    // Una figura lógica puede ocupar varias hojas; el número APA no cambia.
    let numeroActual = null
    let ultimoTitulo = null
    const html = figuras.map((f) => {
      if (f.titulo !== ultimoTitulo || f.parte <= 1) {
        if (f.parte <= 1 || ultimoTitulo !== f.titulo) {
          nFig += 1
          numeroActual = nFig
          ultimoTitulo = f.titulo
        }
      }
      const rotulo =
        f.total > 1
          ? `Figura ${numeroActual} <span class="cont">(sección ${f.parte} de ${f.total})</span>`
          : `Figura ${numeroActual}`
      const titulo = f.titulo || t.titulo
      const nota = f.desc && f.parte <= 1 ? `<p class="nota" style="text-indent:0"><i>Nota.</i> ${esc(f.desc)}</p>` : ''
      // Las figuras troceadas van a hoja propia: cada sección debe aprovechar
      // todo el alto disponible o el corte no habría servido de nada.
      const alta = f.ratio > 1.15 || f.total > 1
      return `<figure class="fig ${alta ? 'alta' : ''}">
        <p class="fig-num" style="text-indent:0;page-break-after:avoid${alta ? ';page-break-before:always' : ''}">${rotulo}</p>
        <p class="fig-tit" style="text-indent:0;page-break-after:avoid"><i>${esc(titulo)}</i></p>
        <div class="lienzo">${
          pngs
            ? (() => {
                // Word necesita las dos medidas en centímetros: con solo el
                // ancho escala la imagen a su tamaño en píxeles y desborda.
                const ancho = Math.min(16.5 * (f.frac ?? 1), (alta ? 19 : 15.5) * Number(f.ar))
                return `<img src="${pngs[f.id]}" style="width:${ancho.toFixed(2)}cm;height:${(ancho / Number(f.ar)).toFixed(2)}cm">`
              })()
            : `<div class="marco" style="--ar:${f.ar};--frac:${(f.frac ?? 1).toFixed(3)}">${f.svg}</div>`
        }</div>
        ${nota}
      </figure>`
    })

    // El título de la parte y el primer diagrama que agrupa comparten hoja:
    // una página con tres palabras y nada más es papel desperdiciado.
    bloques.push(
      `<section class="seccion${traeParte ? ' sigue' : ''}"><h2 id="${id}"${traeParte ? '' : ' style="page-break-before:always"'}>${t.titulo}${marca(id)}</h2>${t.cuerpo.join('\n')}${html.join('\n')}</section>`,
    )
    traeParte = false
  }

  for (const s of CIERRE) bloques.push(seccion(s))

  const idRef = registrar(1, 'Referencias')
  bloques.push(
    `<section class="seccion"><h1 id="${idRef}" style="page-break-before:always">Referencias${marca(idRef)}</h1>
     <div class="refs">${REFERENCIAS.map((r) => `<p>${r}</p>`).join('')}</div></section>`,
  )

  const tocHtml = toc
    .map(
      (e) =>
        `<p class="toc-e n${e.nivel}"><span class="t">${esc(e.titulo)}</span><span class="guia"></span><span class="pt">${
          paginasToc?.[e.id] ?? ''
        }</span></p>`,
    )
    .join('')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${PORTADA.titulo}</title>
<style>
  @page { size: Letter; margin: 2.54cm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", "Liberation Serif", serif;
    font-size: 12pt; line-height: 2; color: #000; margin: 0;
    text-align: left; hyphens: none;
  }
  p { margin: 0; text-indent: 1.27cm; }
  h1, h2, h3 { font-size: 12pt; margin: 0; line-height: 2; page-break-after: avoid; }
  h1 { text-align: center; font-weight: bold; }
  h1.parte { page-break-before: always; }
  h2 { text-align: left; font-weight: bold; margin-top: 0.5em; }
  h3 { text-align: left; font-weight: bold; font-style: italic; }
  ul { margin: 0 0 0 1.27cm; padding-left: 1.27cm; }
  li { line-height: 2; }
  .seccion { page-break-before: always; }
  .seccion h2 + p, .seccion h1 + p { text-indent: 1.27cm; }

  /* Portada APA 7 (formato estudiante): título a la mitad superior, en
     negrita, y los datos de identificación centrados debajo. */
  .portada {
    height: 100%; display: flex; flex-direction: column;
    align-items: center; text-align: center; page-break-after: always;
  }
  .portada .hueco { height: 5.5cm; }
  .portada .titulo { font-weight: bold; }
  .portada .sub { font-style: italic; }
  .portada .datos { margin-top: 2em; }
  .portada p { text-indent: 0; }

  .toc p { text-indent: 0; }
  .toc-e { display: flex; align-items: baseline; gap: 0.2cm; }
  .toc-e .guia { flex: 1; border-bottom: 1px dotted #444; transform: translateY(-0.15em); }
  .toc-e.n2 { padding-left: 1.27cm; }
  .toc-e .pt { font-variant-numeric: tabular-nums; }
  .seccion.sigue { page-break-before: auto; }
  /* Anclas de paginación: se imprimen en blanco y sin ocupar sitio, pero
     pdftotext las lee y así la tabla de contenido sabe a qué hoja apunta. */
  .mk { position: absolute; color: #fff; font-size: 1px; }

  /* Figuras APA: número en negrita, título en cursiva debajo, imagen y nota.
     Sin sangría y sin doble espacio dentro del bloque de la figura. */
  .fig { margin: 1.5em 0; page-break-inside: avoid; }
  .fig p { text-indent: 0; line-height: 1.4; }
  .fig-num { font-weight: bold; }
  .fig-num .cont { font-weight: normal; font-style: italic; }
  .fig-tit { margin-bottom: 0.4em; }
  .fig .nota { margin-top: 0.4em; font-size: 11pt; }
  .lienzo { width: 100%; display: flex; justify-content: center; }
  .marco { width: min(calc(100% * var(--frac, 1)), calc(15.5cm * var(--ar))); aspect-ratio: var(--ar); }
  .marco svg { width: 100%; height: 100%; display: block; }
  .fig.alta { page-break-before: always; }
  .fig.alta .marco { width: min(calc(100% * var(--frac, 1)), calc(19cm * var(--ar))); }

  .refs p { text-indent: 0; padding-left: 1.27cm; text-indent: -1.27cm; }
</style></head><body>

<div class="portada">
  <div class="hueco"></div>
  <p class="titulo">${PORTADA.titulo}</p>
  <p class="sub">${PORTADA.subtitulo}</p>
  <div class="datos">
    <p>${PORTADA.autor}</p>
    <p>${PORTADA.programa}</p>
    <p>${PORTADA.institucion}</p>
    <p>${PORTADA.centro}</p>
    <p>${PORTADA.curso}</p>
    <p>${PORTADA.docente}</p>
    <p>${PORTADA.fecha}</p>
  </div>
</div>

<section class="toc" style="page-break-after: always;">
  <h1 style="page-break-before:always">Tabla de contenido</h1>
  ${tocHtml}
</section>

${bloques.join('\n')}
</body></html>`
}

// ── 5. Impresión en dos pasadas ─────────────────────────────────────────────
const HEADER = `<div style="width:100%;font-family:'Times New Roman',serif;font-size:12pt;padding:0 2.54cm;text-align:right;"><span class="pageNumber"></span></div>`

async function imprimir(browser, html, destino) {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.pdf({
    path: destino,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: HEADER,
    footerTemplate: '<span></span>',
    margin: { top: '2.2cm', bottom: '2.54cm', left: '2.54cm', right: '2.54cm' },
  })
  await page.close()
}

// La tabla de contenido necesita números de página reales. Se obtienen del PDF
// tentativo con pdftotext, buscando en qué hoja cae cada encabezado.
function paginasDeMarcas(pdf) {
  const paginas = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }).split('\f')
  const mapa = {}
  paginas.forEach((texto, i) => {
    for (const m of texto.matchAll(/\[\[(h\d+)\]\]/g)) {
      if (mapa[m[1]] === undefined) mapa[m[1]] = i + 1
    }
  })
  return mapa
}

// ── 6. Versión editable en Word ─────────────────────────────────────────────
// Word no admite SVG en línea con garantías, así que cada figura se rasteriza
// a PNG con densidad suficiente para imprimir y el documento se arma con
// <img>. La conversión final la hace LibreOffice, que respeta la tipografía,
// el interlineado, la sangría y los saltos de página del HTML.
async function rasterizar(browser, porTipo, dir) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const rutas = {}
  for (const t of TIPOS) {
    for (const f of figurasDe(porTipo, t.clave)) {
      const d = dimensionesNativas(f.svg) ?? { w: 1000, h: 700 }
      const escala = Math.min(3, Math.max(1.5, 2200 / d.w))
      await page.setViewportSize({
        width: Math.ceil(d.w * escala),
        height: Math.ceil(d.h * escala),
      })
      await page.setContent(
        `<html><body style="margin:0;background:#fff">
           <div id="c" style="width:${d.w * escala}px;height:${d.h * escala}px;background:#fff">
             ${f.svg.replace('<svg', '<svg width="100%" height="100%"')}
           </div></body></html>`,
        { waitUntil: 'networkidle' },
      )
      // En data URI, no como archivo suelto: con rutas relativas LibreOffice
      // enlaza las imágenes en vez de incrustarlas y el .docx llega vacío al
      // moverlo de carpeta.
      const buf = await page.locator('#c').screenshot()
      rutas[f.id] = `data:image/png;base64,${buf.toString('base64')}`
    }
  }
  await page.close()
  return rutas
}

// LibreOffice escribe el .docx en A4 y sin encabezado. Dos cosas que APA no
// perdona (hoja carta y número de página arriba a la derecha) y que se
// arreglan tocando el XML del paquete, no volviendo a maquetar.
function ajustarDocx(origen, destino) {
  const dir = mkdtempSync(join(tmpdir(), 'docx-'))
  execFileSync('unzip', ['-q', origen, '-d', dir])

  const rutaDoc = join(dir, 'word', 'document.xml')
  let doc = readFileSync(rutaDoc, 'utf8')
  doc = doc.replace(/<w:pgSz[^/]*\/>/g, '<w:pgSz w:w="12240" w:h="15840"/>')
  doc = doc.replace(
    /<w:pgMar[^/]*\/>/g,
    '<w:pgMar w:left="1440" w:right="1440" w:gutter="0" w:header="720" w:top="1440" w:footer="720" w:bottom="1440"/>',
  )
  doc = doc.replace(
    '<w:type w:val="nextPage"/>',
    '<w:type w:val="nextPage"/><w:headerReference w:type="default" r:id="rIdHdrApa"/>',
  )
  writeFileSync(rutaDoc, doc)

  const NS =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  writeFileSync(
    join(dir, 'word', 'header1.xml'),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS}><w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:pPr>
<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>`,
  )

  const rutaRels = join(dir, 'word', '_rels', 'document.xml.rels')
  writeFileSync(
    rutaRels,
    readFileSync(rutaRels, 'utf8').replace(
      '</Relationships>',
      '<Relationship Id="rIdHdrApa" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>',
    ),
  )

  const rutaCt = join(dir, '[Content_Types].xml')
  writeFileSync(
    rutaCt,
    readFileSync(rutaCt, 'utf8').replace(
      '</Types>',
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
    ),
  )

  execFileSync('zip', ['-q', '-r', '-X', destino, '.'], { cwd: dir })
}

// ── main ────────────────────────────────────────────────────────────────────
console.log('Extrayendo diagramas de', BASE)
const browser = await chromium.launch()
const porTipo = await extraer(browser)

const tmp = mkdtempSync(join(tmpdir(), 'uml-apa-'))
const borrador = join(tmp, 'borrador.pdf')

console.log('Primera pasada (sin numerar la tabla de contenido)...')
const html1 = construirHtml(porTipo, null)
await imprimir(browser, html1, borrador)

const mapa = paginasDeMarcas(borrador)

console.log('Segunda pasada (con paginación real)...')
const html2 = construirHtml(porTipo, mapa)
writeFileSync(join(tmp, 'documento.html'), html2)
await imprimir(browser, html2, SALIDA)

console.log('Rasterizando figuras para la versión editable...')
const rutas = await rasterizar(browser, porTipo, tmp)
await browser.close()

// La numeración de la tabla de contenido del PDF sirve de referencia, pero en
// Word el reflujo la invalida: allí el índice va sin números y se actualiza
// desde el propio Word si se necesita.
const htmlWord = construirHtml(porTipo, null, rutas)
const htmlWordPath = join(tmp, 'documento-word.html')
writeFileSync(htmlWordPath, htmlWord)

// Sin --infilter, LibreOffice abre el HTML como "documento web" y descarta
// tamaño de página, márgenes y saltos: hay que forzar el importador de Writer.
execFileSync(
  'soffice',
  [
    '--headless',
    '--infilter=HTML (StarWriter)',
    '--convert-to',
    'docx:MS Word 2007 XML',
    '--outdir',
    tmp,
    htmlWordPath,
  ],
  { stdio: 'ignore' },
)
const docxTmp = join(tmp, 'documento-word.docx')
ajustarDocx(docxTmp, SALIDA_DOCX)

const hojas = execFileSync('pdfinfo', [SALIDA], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)?.[1]
console.log(`\nPDF:  ${SALIDA} (${hojas} páginas)`)
console.log(`Word: ${SALIDA_DOCX}`)
console.log(`HTML fuente: ${join(tmp, 'documento.html')}`)
