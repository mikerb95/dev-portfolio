/**
 * Convierte el XML JUnit que emite Vitest en un informe HTML navegable.
 *
 * El XML crudo es imposible de proyectar en una sustentación, y el reporter
 * `html` de Vitest exige @vitest/ui (dependencia nueva solo para esto). Este
 * script no añade dependencias: el XML de Vitest no trae CDATA ni testcases
 * anidados, así que una pasada de regex lo parsea sin traer un parser XML.
 *
 *   npx vitest run --reporter=junit --outputFile=informes/tests-junit.xml
 *   node scripts/report-tests.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const entrada = process.argv[2] || 'informes/tests-junit.xml'
const salida = process.argv[3] || 'informes/tests.html'

/** Las 10 suites que levantan una base libSQL real (ver CLAUDE.md, sección Tests). */
const INTEGRACION = new Set([
  'tests/portal-isolation.test.ts',
  'tests/payments.test.ts',
  'tests/cobros-db.test.ts',
  'tests/portal-activity.test.ts',
  'tests/fingerprint.test.ts',
  'tests/portal-live.test.ts',
  'tests/latency.test.ts',
  'tests/portal-health.test.ts',
  'tests/contracts.test.ts',
  'tests/security-blocklist-db.test.ts',
])

const xml = readFileSync(entrada, 'utf8')

const desescapar = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const escapar = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const atributo = (fragmento, nombre) => {
  const m = fragmento.match(new RegExp(`${nombre}="([^"]*)"`))
  return m ? m[1] : ''
}

const raiz = xml.match(/<testsuites[^>]*>/)[0]
const total = {
  pruebas: Number(atributo(raiz, 'tests')),
  fallos: Number(atributo(raiz, 'failures')),
  errores: Number(atributo(raiz, 'errors')),
  segundos: Number(atributo(raiz, 'time')),
}

// Cada bloque <testsuite> con sus <testcase> dentro.
const suites = []
const bloques = xml.split(/<testsuite\s/).slice(1)
for (const bloque of bloques) {
  const cabecera = '<testsuite ' + bloque.slice(0, bloque.indexOf('>') + 1)
  const archivo = atributo(cabecera, 'name')
  const casos = []
  for (const m of bloque.matchAll(/<testcase\s([^>]*)>/g)) {
    casos.push({
      nombre: desescapar(atributo('<x ' + m[1] + '>', 'name')),
      segundos: Number(atributo('<x ' + m[1] + '>', 'time')),
    })
  }
  suites.push({
    archivo,
    integracion: INTEGRACION.has(archivo),
    pruebas: Number(atributo(cabecera, 'tests')),
    fallos: Number(atributo(cabecera, 'failures')) + Number(atributo(cabecera, 'errors')),
    omitidas: Number(atributo(cabecera, 'skipped')),
    segundos: Number(atributo(cabecera, 'time')),
    casos,
  })
}

const todos = suites.flatMap((s) => s.casos)
const lentas = [...todos].sort((a, b) => b.segundos - a.segundos).slice(0, 12)
const integracion = suites.filter((s) => s.integracion)
const unitarias = suites.filter((s) => !s.integracion)
const suma = (xs, f) => xs.reduce((a, b) => a + f(b), 0)

// Histograma logarítmico: el grueso de la suite vive por debajo del milisegundo,
// así que en escala lineal todo se apilaría en una sola barra.
const CORTES = [0.001, 0.01, 0.1, 1, Infinity]
const ETIQUETAS = ['&lt; 1 ms', '1 - 10 ms', '10 - 100 ms', '0.1 - 1 s', '&gt; 1 s']
const cubos = CORTES.map(() => 0)
for (const c of todos) cubos[CORTES.findIndex((corte) => c.segundos < corte)]++
const cimaCubo = Math.max(...cubos)

const ms = (s) => (s < 1 ? `${(s * 1000).toFixed(s < 0.01 ? 2 : 1)} ms` : `${s.toFixed(2)} s`)
const pct = (n, d) => (d === 0 ? 0 : (n / d) * 100)

const fecha = new Date().toLocaleString('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
})

const filaSuite = (s) => {
  const casos = [...s.casos]
    .sort((a, b) => b.segundos - a.segundos)
    .map(
      (c) => `<li><span class="caso-nombre">${escapar(c.nombre)}</span>
        <span class="caso-tiempo">${ms(c.segundos)}</span></li>`
    )
    .join('')
  return `<tbody class="suite" data-pruebas="${s.pruebas}" data-tiempo="${s.segundos}" data-archivo="${escapar(s.archivo)}">
    <tr class="fila" tabindex="0" role="button" aria-expanded="false">
      <th scope="row">
        <span class="chevron" aria-hidden="true"></span>
        <code>${escapar(s.archivo.replace(/^tests\//, ''))}</code>
        ${s.integracion ? '<span class="etiqueta int">integración</span>' : ''}
      </th>
      <td class="num">${s.pruebas}</td>
      <td class="num ${s.fallos ? 'malo' : ''}">${s.fallos}</td>
      <td class="num tiempo">${ms(s.segundos)}</td>
      <td class="barra-celda">
        <span class="barra" style="--w:${pct(s.segundos, Math.max(...suites.map((x) => x.segundos)))}%"></span>
      </td>
    </tr>
    <tr class="detalle" hidden><td colspan="5"><ol class="casos">${casos}</ol></td></tr>
  </tbody>`
}

const html = `<title>Ejecución de pruebas</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&display=swap">
<style>
  :root {
    --ground: #eef2f5;
    --surface: #ffffff;
    --ink: #0f1a21;
    --muted: #5a6e7a;
    --line: #d6e0e6;
    --accent: #1f5673;
    --ok: #2f7d5c;
    --crit: #b3261e;
    --barra: #9fc0d3;
    --sombra: 0 1px 2px rgba(15, 26, 33, .06), 0 8px 24px -16px rgba(15, 26, 33, .3);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #0b1317;
      --surface: #121d24;
      --ink: #e4edf2;
      --muted: #8fa5b1;
      --line: #22333d;
      --accent: #78b0cd;
      --ok: #5cb98b;
      --crit: #e8756a;
      --barra: #3d6274;
      --sombra: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -16px rgba(0, 0, 0, .8);
    }
  }
  :root[data-theme="dark"] {
    --ground: #0b1317;
    --surface: #121d24;
    --ink: #e4edf2;
    --muted: #8fa5b1;
    --line: #22333d;
    --accent: #78b0cd;
    --ok: #5cb98b;
    --crit: #e8756a;
    --barra: #3d6274;
    --sombra: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -16px rgba(0, 0, 0, .8);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font: 400 16px/1.55 "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .envoltura {
    max-width: 1120px;
    margin: 0 auto;
    padding: clamp(24px, 5vw, 56px) clamp(16px, 4vw, 40px) 72px;
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  header { display: flex; flex-direction: column; gap: 10px; }
  .eyebrow {
    font: 500 12px/1 "IBM Plex Mono", ui-monospace, monospace;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h1 {
    margin: 0;
    font: 600 clamp(30px, 4.6vw, 44px)/1.1 "IBM Plex Serif", Georgia, serif;
    letter-spacing: -.01em;
    text-wrap: balance;
  }
  .sub { margin: 0; color: var(--muted); max-width: 62ch; }
  .comando {
    font: 400 13px/1.6 "IBM Plex Mono", ui-monospace, monospace;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 14px;
    overflow-x: auto;
    white-space: nowrap;
  }

  h2 {
    margin: 0 0 14px;
    font: 600 13px/1 "IBM Plex Mono", ui-monospace, monospace;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .tiras { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .tira { background: var(--surface); padding: 18px 20px; display: flex; flex-direction: column; gap: 4px; }
  .tira .valor {
    font: 500 30px/1 "IBM Plex Mono", ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
  }
  .tira .rotulo { font-size: 12.5px; color: var(--muted); }
  .tira.estado .valor { color: var(--ok); }
  .tira.estado.falla .valor { color: var(--crit); }

  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 22px 24px; box-shadow: var(--sombra); }
  .dos { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; align-items: start; }

  .hist { display: flex; flex-direction: column; gap: 10px; }
  .hist-fila { display: grid; grid-template-columns: 92px 1fr 62px; gap: 12px; align-items: center; }
  .hist-fila .et { font: 400 12.5px/1 "IBM Plex Mono", ui-monospace, monospace; color: var(--muted); text-align: right; }
  .hist-fila .pista { height: 22px; background: color-mix(in srgb, var(--barra) 22%, transparent); border-radius: 3px; overflow: hidden; }
  .hist-fila .relleno { display: block; height: 100%; width: var(--w); background: var(--barra); border-radius: 3px; }
  .hist-fila .n { font: 500 13px/1 "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--ink); }

  ol.lentas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; counter-reset: p; }
  ol.lentas li { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: baseline; padding-bottom: 9px; border-bottom: 1px solid var(--line); }
  ol.lentas li:last-child { border-bottom: 0; padding-bottom: 0; }
  ol.lentas .n { font-size: 14px; }
  ol.lentas .t { font: 500 13px/1 "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--accent); }

  .tabla-envoltura { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: var(--sombra); }
  table { width: 100%; border-collapse: collapse; min-width: 640px; }
  thead th {
    text-align: left;
    font: 500 12px/1 "IBM Plex Mono", ui-monospace, monospace;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  thead th.ord { cursor: pointer; user-select: none; }
  thead th.ord:hover { color: var(--ink); }
  thead th.ord::after { content: " \\2195"; opacity: .35; }
  thead th.ord[aria-sort="descending"]::after { content: " \\2193"; opacity: 1; }
  thead th.ord[aria-sort="ascending"]::after { content: " \\2191"; opacity: 1; }
  tbody.suite + tbody.suite tr.fila th, tbody.suite + tbody.suite tr.fila td { border-top: 1px solid var(--line); }
  tr.fila { cursor: pointer; }
  tr.fila:hover th, tr.fila:hover td { background: color-mix(in srgb, var(--accent) 5%, transparent); }
  tr.fila:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  th[scope="row"] { text-align: left; font-weight: 400; padding: 11px 16px; display: flex; align-items: center; gap: 9px; }
  th[scope="row"] code { font: 400 13.5px/1.4 "IBM Plex Mono", ui-monospace, monospace; }
  td { padding: 11px 16px; }
  td.num { font: 400 14px/1 "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; text-align: right; width: 1%; white-space: nowrap; }
  td.tiempo { color: var(--muted); }
  td.num.malo { color: var(--crit); font-weight: 500; }
  .barra-celda { width: 26%; min-width: 90px; }
  .barra { display: block; height: 8px; width: var(--w); min-width: 2px; background: var(--barra); border-radius: 2px; }
  .chevron { width: 7px; height: 7px; border-right: 1.5px solid var(--muted); border-bottom: 1.5px solid var(--muted); transform: rotate(-45deg); transition: transform .16s ease; flex: none; }
  tr.fila[aria-expanded="true"] .chevron { transform: rotate(45deg); }
  .etiqueta { font: 500 10.5px/1 "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .07em; text-transform: uppercase; padding: 4px 7px; border-radius: 4px; white-space: nowrap; }
  .etiqueta.int { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  ol.casos { list-style: none; margin: 0; padding: 4px 16px 14px 42px; display: flex; flex-direction: column; gap: 6px; }
  ol.casos li { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: baseline; font-size: 14px; }
  .caso-nombre { color: var(--muted); }
  .caso-tiempo { font: 400 12.5px/1 "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--muted); }
  .detalle td { background: color-mix(in srgb, var(--accent) 4%, transparent); padding: 0; }

  footer { color: var(--muted); font-size: 13.5px; border-top: 1px solid var(--line); padding-top: 18px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="envoltura">
  <header>
    <p class="eyebrow">codebymike.tech · informe de ejecución</p>
    <h1>Ejecución de pruebas</h1>
    <p class="sub">Suite completa de Vitest: ${total.pruebas} pruebas en ${suites.length} archivos,
      con el tiempo medido de cada caso. Generado desde el XML JUnit de la corrida del ${fecha}.</p>
  </header>

  <div class="comando">npx vitest run --reporter=junit --outputFile=informes/tests-junit.xml &amp;&amp; node scripts/report-tests.mjs</div>

  <section>
    <h2>Resumen</h2>
    <div class="tiras">
      <div class="tira"><span class="valor">${total.pruebas}</span><span class="rotulo">pruebas</span></div>
      <div class="tira estado${total.fallos + total.errores ? ' falla' : ''}">
        <span class="valor">${total.fallos + total.errores}</span>
        <span class="rotulo">${total.fallos + total.errores ? 'fallos' : 'fallos · todo en verde'}</span>
      </div>
      <div class="tira"><span class="valor">${suites.length}</span><span class="rotulo">archivos</span></div>
      <div class="tira"><span class="valor">${total.segundos.toFixed(1)}<span style="font-size:16px"> s</span></span><span class="rotulo">duración total</span></div>
      <div class="tira"><span class="valor">${ms(suma(todos, (c) => c.segundos) / todos.length)}</span><span class="rotulo">promedio por prueba</span></div>
    </div>
  </section>

  <section class="dos">
    <div class="panel">
      <h2>Distribución de tiempos</h2>
      <div class="hist">
        ${cubos
          .map(
            (n, i) => `<div class="hist-fila">
          <span class="et">${ETIQUETAS[i]}</span>
          <span class="pista"><span class="relleno" style="--w:${pct(n, cimaCubo)}%"></span></span>
          <span class="n">${n}</span>
        </div>`
          )
          .join('')}
      </div>
      <p class="sub" style="margin-top:16px;font-size:13.5px">Escala logarítmica: ${pct(cubos[0] + cubos[1], todos.length).toFixed(0)}% de las
        pruebas termina en menos de 10 ms porque son lógica pura, sin base de datos.</p>
    </div>

    <div class="panel">
      <h2>Las 12 más lentas</h2>
      <ol class="lentas">
        ${lentas
          .map(
            (c) => `<li><span class="n">${escapar(c.nombre)}</span><span class="t">${ms(c.segundos)}</span></li>`
          )
          .join('')}
      </ol>
    </div>
  </section>

  <section>
    <h2>Por nivel de prueba</h2>
    <div class="tiras">
      <div class="tira">
        <span class="valor">${suma(unitarias, (s) => s.pruebas)}</span>
        <span class="rotulo">unitarias · ${unitarias.length} archivos · ${suma(unitarias, (s) => s.segundos).toFixed(1)} s</span>
      </div>
      <div class="tira">
        <span class="valor">${suma(integracion, (s) => s.pruebas)}</span>
        <span class="rotulo">integración con libSQL · ${integracion.length} archivos · ${suma(integracion, (s) => s.segundos).toFixed(1)} s</span>
      </div>
      <div class="tira">
        <span class="valor">${(suma(integracion, (s) => s.segundos) / suma(integracion, (s) => s.pruebas) / (suma(unitarias, (s) => s.segundos) / suma(unitarias, (s) => s.pruebas))).toFixed(0)}×</span>
        <span class="rotulo">más lenta la de integración, por prueba</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Archivos</h2>
    <div class="tabla-envoltura">
      <table>
        <thead>
          <tr>
            <th class="ord" data-orden="archivo" aria-sort="none">Archivo</th>
            <th class="ord num-h" data-orden="pruebas" aria-sort="none">Pruebas</th>
            <th>Fallos</th>
            <th class="ord" data-orden="tiempo" aria-sort="descending">Tiempo</th>
            <th></th>
          </tr>
        </thead>
        ${[...suites].sort((a, b) => b.segundos - a.segundos).map(filaSuite).join('')}
      </table>
    </div>
  </section>

  <footer>
    Vitest 4.1.9 · Node 22 · las suites marcadas <em>integración</em> abren una base libSQL real en un
    archivo temporal; el resto es lógica pura. La cobertura se mide aparte con <code>npm run test:coverage</code>.
  </footer>
</div>

<script>
  // Desplegar los casos de una suite.
  for (const fila of document.querySelectorAll('tr.fila')) {
    const alternar = () => {
      const abierto = fila.getAttribute('aria-expanded') === 'true'
      fila.setAttribute('aria-expanded', String(!abierto))
      fila.parentElement.querySelector('.detalle').hidden = abierto
    }
    fila.addEventListener('click', alternar)
    fila.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar() }
    })
  }

  // Ordenar por columna. Reordena los <tbody>, así que el detalle viaja con su fila.
  const tabla = document.querySelector('table')
  for (const th of tabla.querySelectorAll('th.ord')) {
    th.addEventListener('click', () => {
      const clave = th.dataset.orden
      const asc = th.getAttribute('aria-sort') !== 'ascending'
      for (const otro of tabla.querySelectorAll('th.ord')) otro.setAttribute('aria-sort', 'none')
      th.setAttribute('aria-sort', asc ? 'ascending' : 'descending')
      const cuerpos = [...tabla.querySelectorAll('tbody.suite')]
      cuerpos.sort((a, b) => {
        const va = clave === 'archivo' ? a.dataset.archivo : Number(a.dataset[clave])
        const vb = clave === 'archivo' ? b.dataset.archivo : Number(b.dataset[clave])
        const cmp = clave === 'archivo' ? String(va).localeCompare(vb, 'es') : va - vb
        return asc ? cmp : -cmp
      })
      for (const c of cuerpos) tabla.appendChild(c)
    })
  }
</script>
`

mkdirSync(dirname(resolve(salida)), { recursive: true })
writeFileSync(salida, html)
console.log(
  `${salida}: ${total.pruebas} pruebas, ${total.fallos + total.errores} fallos, ${total.segundos.toFixed(2)}s`
)
