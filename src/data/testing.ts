// Contenido de /docs/testing: el inventario completo de pruebas del proyecto.
//
// Misma convención que documentacion.ts: la prosa curada vive aquí tipada y la
// página solo renderiza. Lo que NO vive aquí son las métricas (nº de tests,
// cobertura, mutation score): esas se leen en SSR de la tabla `ci_runs`, que
// las recibe del propio pipeline. Los valores de METRICAS_REFERENCIA son solo
// el fallback para cuando esa query no devuelve nada.
//
// OPSEC: /docs es público. Los niveles y decisiones que tocan el micro-SIEM se
// describen por la garantía que dan, nunca citando patrones de detección,
// rutas honeypot ni umbrales literales.

export type Cuando = 'push' | 'semanal' | 'manual' | 'continuo'
export type Acento = 'cyan' | 'violet' | 'lime' | 'ember'

export const CUANDO_LABEL: Record<Cuando, string> = {
  push: 'En cada push',
  semanal: 'Semanal',
  manual: 'Manual',
  continuo: 'Continuo (24/7)',
}

export type Nivel = {
  id: string
  n: number
  nombre: string
  herramienta: string
  /** La pregunta que este nivel responde y ningún otro puede responder. */
  pregunta: string
  volumen: string
  archivos: string
  cuando: Cuando
  /** ¿Un fallo aquí impide que el código llegue a producción? */
  bloquea: boolean
  puntoCiego: string
  acento: Acento
  /** true = no está implementado todavía. */
  pendiente?: boolean
}

export const NIVELES: Nivel[] = [
  {
    id: 'unitario',
    n: 1,
    nombre: 'Unitario / lógica pura',
    herramienta: 'Vitest',
    pregunta: '¿Esta función devuelve lo correcto para cada entrada, incluidas las raras?',
    volumen: '394 tests sobre funciones sin efectos',
    archivos: 'tests/*.test.ts (42 archivos)',
    cuando: 'push',
    bloquea: true,
    puntoCiego: 'No sabe nada de la base de datos, la red ni el navegador. Una función puede ser perfecta y el sistema estar roto.',
    acento: 'cyan',
  },
  {
    id: 'integracion',
    n: 2,
    nombre: 'Integración con BD real',
    herramienta: 'Vitest + libSQL en archivo temporal',
    pregunta: '¿El UNIQUE, la transacción y la concurrencia se comportan como creo?',
    volumen: '132 tests contra una base de verdad',
    archivos: 'payments, cobros-db, portal-*, security-blocklist-db',
    cuando: 'push',
    bloquea: true,
    puntoCiego: 'Es SQLite local, no Turso remoto: no ve latencia de red ni límites de cuota.',
    acento: 'cyan',
  },
  {
    id: 'contratos',
    n: 3,
    nombre: 'Contratos de API',
    herramienta: 'Vitest + Zod',
    pregunta: '¿La forma de la respuesta cambió sin que nadie se diera cuenta?',
    volumen: '5 tests sobre 4 endpoints clave',
    archivos: 'tests/contracts.test.ts + src/lib/contracts.ts',
    cuando: 'push',
    bloquea: true,
    puntoCiego: 'Valida la forma, no el significado. Un campo puede tener el tipo correcto y el valor equivocado.',
    acento: 'cyan',
  },
  {
    id: 'e2e',
    n: 4,
    nombre: 'End-to-end',
    herramienta: 'Playwright (Chromium)',
    pregunta: '¿Un humano con un navegador puede completar el flujo de principio a fin?',
    volumen: '45 tests en 6 specs',
    archivos: 'e2e/*.spec.ts',
    cuando: 'push',
    bloquea: true,
    puntoCiego: 'Lento y frágil por naturaleza. Por eso son 45 y no 450: cubren los flujos que perder duele, no cada botón.',
    acento: 'violet',
  },
  {
    id: 'cobertura',
    n: 5,
    nombre: 'Cobertura de código',
    herramienta: '@vitest/coverage-v8',
    pregunta: '¿Qué parte del código no ejecuta ni una sola prueba?',
    volumen: '1237 de 2258 líneas de src/lib/**',
    archivos: 'vitest.config.ts → coverage/',
    cuando: 'push',
    bloquea: false,
    puntoCiego: 'Enorme: dice que la línea se ejecutó, no que se haya comprobado nada sobre ella. De ahí el nivel 6.',
    acento: 'lime',
  },
  {
    id: 'mutation',
    n: 6,
    nombre: 'Mutation testing',
    herramienta: 'Stryker + runner de Vitest',
    pregunta: 'Si rompo esta línea a propósito, ¿algún test se entera?',
    volumen: 'umbrales 80 / 60 / 50 sobre src/lib/**',
    archivos: 'stryker.config.json',
    cuando: 'semanal',
    bloquea: false,
    puntoCiego: 'Carísimo en tiempo: son miles de ejecuciones de la suite. Por eso es semanal y nunca bloquea un PR.',
    acento: 'lime',
  },
  {
    id: 'npm-audit',
    n: 7,
    nombre: 'SAST de dependencias',
    herramienta: 'npm audit → panel LAB propio',
    pregunta: '¿Alguna librería que uso tiene una vulnerabilidad publicada?',
    volumen: 'hallazgos deduplicados por fingerprint',
    archivos: 'scripts/npm-audit-scan.mjs',
    cuando: 'push',
    bloquea: false,
    puntoCiego: 'Solo ve lo que ya está publicado como advisory. Un 0-day no aparece.',
    acento: 'ember',
  },
  {
    id: 'codeql',
    n: 8,
    nombre: 'SAST de código',
    herramienta: 'CodeQL (javascript-typescript)',
    pregunta: '¿Escribí yo algún patrón peligroso (inyección, XSS, secreto expuesto)?',
    volumen: 'pestaña Security del repo',
    archivos: '.github/workflows/security.yml',
    cuando: 'push',
    bloquea: false,
    puntoCiego: 'Análisis estático: no ejecuta nada. Genera falsos positivos y no ve fallos de lógica de negocio.',
    acento: 'ember',
  },
  {
    id: 'a11y',
    n: 9,
    nombre: 'Accesibilidad',
    herramienta: 'axe-core + Playwright',
    pregunta: '¿Puede usar esto alguien con lector de pantalla o sin ratón?',
    volumen: 'páginas públicas, violaciones WCAG reales',
    archivos: 'scripts/a11y-scan.mjs',
    cuando: 'push',
    bloquea: false,
    puntoCiego: 'Las herramientas automáticas detectan ~30-40% de los problemas de accesibilidad. El resto necesita a una persona.',
    acento: 'ember',
  },
  {
    id: 'verify-prod',
    n: 10,
    nombre: 'Verificación en producción',
    herramienta: 'curl + /api/health + vercel rollback',
    pregunta: 'Lo que acabo de desplegar, ¿está vivo de verdad?',
    volumen: '3 health checks, se exigen 2 sanos',
    archivos: 'job verify-production de ci.yml',
    cuando: 'push',
    bloquea: true,
    puntoCiego: 'Comprueba que el sistema responde, no que responda bien. Un deploy puede estar «sano» y devolver datos incorrectos.',
    acento: 'violet',
  },
  {
    id: 'chaos',
    n: 11,
    nombre: 'Chaos engineering',
    herramienta: 'Flags en BD + middleware propio',
    pregunta: 'Cuando algo falle de verdad, ¿el sistema falla bien o se lleva todo por delante?',
    volumen: '12 tests que prueban al propio motor de caos',
    archivos: 'src/lib/chaos.ts, /admin/lab/chaos',
    cuando: 'manual',
    bloquea: false,
    puntoCiego: 'Solo inyecta los fallos que se me ocurrieron. La realidad tiene más imaginación.',
    acento: 'violet',
  },
  {
    id: 'monitoreo',
    n: 12,
    nombre: 'Monitoreo sintético',
    herramienta: 'Monitores propios + cron externo',
    pregunta: '¿Sigue funcionando ahora mismo, a las 3 de la madrugada?',
    volumen: '10 monitores, sondeo cada ~5 min',
    archivos: '/admin/monitors → /status',
    cuando: 'continuo',
    bloquea: false,
    puntoCiego: 'Prueba desde fuera y sin sesión: no ve nada de lo que pasa detrás del login.',
    acento: 'violet',
  },
  {
    id: 'usabilidad',
    n: 13,
    nombre: 'Usabilidad con usuarios',
    herramienta: 'Metodología de 6 pasos',
    pregunta: 'Funciona, pero ¿alguien que no lo construyó consigue usarlo?',
    volumen: '1 flujo documentado (descarga de CV)',
    archivos: '/docs/usability-testing',
    cuando: 'manual',
    bloquea: false,
    puntoCiego: 'No se automatiza: hace falta gente real. Es el único nivel donde el resultado es una observación, no un booleano.',
    acento: 'ember',
  },
  {
    id: 'dast',
    n: 14,
    nombre: 'DAST (análisis dinámico)',
    herramienta: 'OWASP ZAP baseline',
    pregunta: '¿El sitio corriendo de verdad tiene una vulnerabilidad que el análisis estático no puede ver?',
    volumen: 'contra el preview de cada PR, nunca contra producción',
    archivos: '.github/workflows/dast.yml, scripts/zap-ingest.mjs',
    cuando: 'push',
    bloquea: false,
    puntoCiego: 'Es un "baseline" pasivo: no intenta explotar nada, solo detecta cabeceras/config ausentes. Un DAST activo encontraría más, y también rompería más cosas.',
    acento: 'ember',
  },
  {
    id: 'carga',
    n: 15,
    nombre: 'Pruebas de carga',
    herramienta: 'k6 (pendiente)',
    pregunta: '¿Qué pasa con la latencia cuando entran 1000 personas a la vez?',
    volumen: 'Fase 5 del plan del LAB, aún sin implementar',
    archivos: 'docs/plan-lab-fases-pendientes.md',
    cuando: 'manual',
    bloquea: false,
    puntoCiego: 'Nunca puede correr contra producción: Vercel factura por invocación y Turso tiene cuota. Va contra un preview desechable.',
    acento: 'ember',
    pendiente: true,
  },
]

// ── Pirámide ────────────────────────────────────────────────────────────────
// Solo los 4 niveles que forman la pirámide clásica. Los otros 11 se muestran
// aparte a propósito: presentarlos como «más pruebas» mentiría sobre su
// naturaleza (no verifican comportamiento, verifican propiedades del sistema).

export type EstratoPiramide = {
  id: string
  nombre: string
  tests: number
  velocidad: string
  proposito: string
}

export const PIRAMIDE: EstratoPiramide[] = [
  {
    id: 'e2e',
    nombre: 'End-to-end',
    tests: 45,
    velocidad: 'minutos',
    proposito: 'Un navegador real recorre el flujo completo. Caros, lentos, pocos.',
  },
  {
    id: 'contratos',
    nombre: 'Contratos',
    tests: 5,
    velocidad: 'segundos',
    proposito: 'La forma de la respuesta de la API queda congelada por un esquema Zod.',
  },
  {
    id: 'integracion',
    nombre: 'Integración',
    tests: 132,
    velocidad: 'segundos',
    proposito: 'Base de datos real y desechable: transacciones, UNIQUE y concurrencia de verdad.',
  },
  {
    id: 'unitario',
    nombre: 'Unitarias',
    tests: 394,
    velocidad: 'milisegundos',
    proposito: 'Lógica pura, sin BD ni red. Baratas: por eso son la mayoría.',
  },
]

// ── Etapas del pipeline ─────────────────────────────────────────────────────

export type EtapaPipeline = {
  id: string
  nombre: string
  subtitulo: string
  dispara: string
  duracion: string
  pasos: string[]
  siFalla: string
  bloquea: boolean
  archivo: string
}

export const PIPELINE: EtapaPipeline[] = [
  {
    id: 'local',
    nombre: 'Local',
    subtitulo: 'Antes de que nadie más lo vea',
    dispara: 'A mano, mientras escribo código',
    duracion: '~4 s la suite completa',
    pasos: [
      'npm test — los 531 tests de Vitest',
      'npm run test:e2e:ui — Playwright en modo inspector, si toqué una página',
      'npx astro check — type-check de todo el proyecto',
    ],
    siFalla: 'No hay push. Es la única etapa donde el coste de un fallo es cero.',
    bloquea: true,
    archivo: 'package.json',
  },
  {
    id: 'push',
    nombre: 'Push',
    subtitulo: 'git push origin main',
    dispara: 'Un commit en main o la apertura de un PR',
    duracion: 'instantáneo',
    pasos: [
      'GitHub Actions arranca 4 workflows en paralelo: CI, Security, Accessibility y (los domingos) Mutation',
      'Vercel arranca su propio build por la integración git, sin esperar a los tests',
    ],
    siFalla: '—',
    bloquea: false,
    archivo: '.github/workflows/',
  },
  {
    id: 'ci',
    nombre: 'CI',
    subtitulo: 'Test + build + e2e',
    dispara: 'push y pull_request',
    duracion: '~3-6 min',
    pasos: [
      'Job quality: vitest run --coverage y luego npm run build',
      'Job e2e: instala Chromium, siembra dos bases libSQL desechables y corre los 45 tests de Playwright',
      'Extrae métricas (cobertura, tests pasados/fallidos) del reporte JSON para publicarlas',
      'En paralelo: npm audit, CodeQL y axe-core, todos con continue-on-error',
    ],
    siFalla: 'El job queda en rojo y el PR no se puede fusionar. Los scanners son la excepción: registran, no bloquean.',
    bloquea: true,
    archivo: '.github/workflows/ci.yml',
  },
  {
    id: 'deploy',
    nombre: 'Deploy',
    subtitulo: 'Vercel publica la versión nueva',
    dispara: 'Integración git de Vercel',
    duracion: '~1-3 min',
    pasos: [
      'Build de Astro con el adaptador de Vercel',
      'La versión nueva pasa a servir codebymike.tech',
      '/api/health empieza a devolver el SHA del commit recién desplegado',
    ],
    siFalla: 'El deploy anterior sigue sirviendo. Vercel no promueve un build que no compila.',
    bloquea: true,
    archivo: 'astro.config.mjs',
  },
  {
    id: 'verify',
    nombre: 'Verificación',
    subtitulo: 'La prueba que corre en producción',
    dispara: 'Solo en push a main',
    duracion: 'hasta 8 min de espera + ~15 s de checks',
    pasos: [
      'Sondea /api/health cada 10 s hasta que el SHA coincida con el del commit (máx 8 min)',
      'Tres health checks seguidos; se exigen al menos 2 con HTTP 200',
      'Si no pasa: npx vercel rollback revierte a la versión anterior',
      'Notifica el rollback a ntfy con prioridad 5 y reporta el run al panel LAB',
    ],
    siFalla: 'Rollback automático y push al teléfono. El job termina en rojo, pero el sitio ya volvió a estar sano.',
    bloquea: true,
    archivo: '.github/workflows/ci.yml',
  },
  {
    id: 'operacion',
    nombre: 'Operación',
    subtitulo: 'Las 24 horas siguientes',
    dispara: 'cron-job.org, cada ~5 min, para siempre',
    duracion: 'continuo',
    pasos: [
      '10 monitores sondean endpoints públicos y alimentan /status',
      'Rollups de seguridad y detección de anomalías del micro-SIEM',
      'Error budget de los SLO: cuánto margen de caída queda este mes',
      'Cualquier incidente dispara una notificación push',
    ],
    siFalla: 'Se abre un incidente, se registra en el histórico y sale una alerta. Nada de esto depende de que yo esté mirando.',
    bloquea: false,
    archivo: 'src/pages/api/cron/',
  },
]

// ── Escenarios de la simulación ─────────────────────────────────────────────

export type PasoSimulacion = {
  etapa: string
  estado: 'ok' | 'fail' | 'skip' | 'warn'
  texto: string
}

export type Escenario = {
  id: string
  nombre: string
  resumen: string
  pasos: PasoSimulacion[]
  desenlace: string
}

export const ESCENARIOS: Escenario[] = [
  {
    id: 'verde',
    nombre: 'Todo verde',
    resumen: 'El camino feliz: el código llega a producción y se queda.',
    pasos: [
      { etapa: 'local', estado: 'ok', texto: '531 tests en verde. Push.' },
      { etapa: 'push', estado: 'ok', texto: 'CI, Security y Accessibility arrancan en paralelo.' },
      { etapa: 'ci', estado: 'ok', texto: 'Vitest 531/531 · build OK · 45 e2e en verde.' },
      { etapa: 'deploy', estado: 'ok', texto: 'Vercel publica. /api/health ya devuelve el SHA nuevo.' },
      { etapa: 'verify', estado: 'ok', texto: '3 de 3 health checks con HTTP 200.' },
      { etapa: 'operacion', estado: 'ok', texto: 'Los monitores siguen en verde. Run reportado al panel LAB.' },
    ],
    desenlace: 'La versión nueva se queda. Tiempo total desde el push: unos 10 minutos, sin intervención humana.',
  },
  {
    id: 'test-rojo',
    nombre: 'Un test falla',
    resumen: 'El caso más común. Nada llega a producción.',
    pasos: [
      { etapa: 'local', estado: 'warn', texto: 'Con prisa, no corrí la suite antes del push.' },
      { etapa: 'push', estado: 'ok', texto: 'CI arranca.' },
      { etapa: 'ci', estado: 'fail', texto: 'payments.test.ts: «doble clic: requests concurrentes con la misma clave crean UN pago» — falla.' },
      { etapa: 'deploy', estado: 'skip', texto: 'El PR no se puede fusionar. En main, el build de Vercel puede publicar, pero el job queda en rojo y la verificación lo atrapa.' },
      { etapa: 'verify', estado: 'skip', texto: 'No se llega.' },
      { etapa: 'operacion', estado: 'skip', texto: 'Producción sigue sirviendo la versión anterior.' },
    ],
    desenlace: 'Coste del fallo: un job de CI de 4 minutos. Ningún usuario vio nada. Esto es exactamente para lo que existen los tests.',
  },
  {
    id: 'rollback',
    nombre: 'Deploy insano → rollback',
    resumen: 'Pasa todos los tests y aun así rompe producción. El escenario que nadie enseña.',
    pasos: [
      { etapa: 'local', estado: 'ok', texto: '531 tests en verde. Todo correcto.' },
      { etapa: 'push', estado: 'ok', texto: 'CI arranca.' },
      { etapa: 'ci', estado: 'ok', texto: 'Suite completa en verde, build OK, e2e en verde.' },
      { etapa: 'deploy', estado: 'ok', texto: 'Vercel publica la versión nueva en codebymike.tech.' },
      { etapa: 'verify', estado: 'fail', texto: 'Health check: 0 de 3 con HTTP 200. Falta una variable de entorno que en local sí existía.' },
      { etapa: 'operacion', estado: 'warn', texto: 'npx vercel rollback revierte · push a ntfy con prioridad 5 · run registrado como rolled_back.' },
    ],
    desenlace: 'El sitio vuelve solo a la versión anterior en menos de un minuto, y me entero por el teléfono. Ningún test unitario podía haber detectado esto: la diferencia estaba en el entorno, no en el código.',
  },
]

// ── Decisiones de ingeniería ────────────────────────────────────────────────

export type Decision = {
  id: string
  titulo: string
  sintoma: string
  causa: string
  decision: string
  donde: string
}

export const DECISIONES: Decision[] = [
  {
    id: 'archivo-no-memoria',
    titulo: 'Base en archivo, nunca `:memory:`',
    sintoma: 'Los tests de concurrencia fallaban con «no such table», pero solo los que abrían una transacción.',
    causa: 'Una transacción de libSQL abre otra conexión, y una base en memoria no comparte tablas entre conexiones.',
    decision: 'Toda base de prueba es un archivo en el directorio temporal del sistema, con nombre único por PID y timestamp.',
    donde: 'tests/payments.test.ts, tests/cobros-db.test.ts',
  },
  {
    id: 'migrador-real',
    titulo: 'Migrar con el migrador de producción',
    sintoma: 'Un test pasaba en verde contra un esquema que ya no existía en producción.',
    causa: 'El CREATE TABLE estaba escrito a mano en el test y se desincronizó cuando otro trabajo añadió columnas.',
    decision: 'Los tests nuevos migran con `drizzle-orm/libsql/migrator` apuntando a la carpeta drizzle/ real. Mismo esquema que producción, por construcción.',
    donde: 'tests/contracts.test.ts',
  },
  {
    id: 'seed-webserver',
    titulo: 'Sembrar en `webServer`, no en `globalSetup`',
    sintoma: 'El servidor de e2e arrancaba contra una base que no existía.',
    causa: 'Playwright levanta el webServer ANTES de ejecutar globalSetup. Sembrar allí llega tarde.',
    decision: 'La siembra es parte del propio comando del webServer: `node scripts/seed-e2e.mjs && npm run dev`.',
    donde: 'playwright.config.ts',
  },
  {
    id: 'dev-no-preview',
    titulo: '`astro dev` y no `astro preview` en e2e',
    sintoma: 'El build de producción no se podía servir localmente para probarlo.',
    causa: 'El adaptador de Vercel no soporta `astro preview`; haría falta `vercel dev`.',
    decision: 'Los e2e corren contra `astro dev`. El middleware —que es justo lo que verifican— se comporta igual en dev.',
    donde: 'playwright.config.ts',
  },
  {
    id: 'centinela',
    titulo: 'Un centinela para probar el aislamiento',
    sintoma: 'Necesitaba demostrar, no afirmar, que la demo pública jamás muestra datos reales.',
    causa: 'La demo usa una base Turso distinta seleccionada por AsyncLocalStorage. Un error de contexto filtraría datos de clientes.',
    decision: 'La base «principal» de e2e se siembra con el prefijo `CENTINELA-REAL `. Un test afirma que ese texto no aparece nunca en la demo. Si el aislamiento se rompe, el test lo grita.',
    donde: 'e2e/demo.spec.ts, playwright.config.ts',
  },
  {
    id: 'isomorfos',
    titulo: 'El testing condicionó la arquitectura',
    sintoma: 'Un módulo importado desde el navegador reventaba al arrastrar `node:crypto` y la conexión a BD.',
    causa: 'Las páginas .astro con <script> ejecutan ese código en el cliente, donde no existe Node.',
    decision: 'Se separó en un módulo puro isomorfo y otro solo-servidor: cobros.ts / cobros-crypto.ts, payments-state.ts / payments.ts. Como efecto secundario, la lógica pura quedó trivial de testear.',
    donde: 'src/lib/payments-state.ts, src/lib/cobros.ts',
  },
  {
    id: 'cobertura-no-basta',
    titulo: 'La cobertura miente, por eso hay mutación',
    sintoma: 'Un porcentaje de cobertura, sea alto o bajo, no me decía si los tests comprobaban algo.',
    causa: 'La cobertura mide ejecución, no verificación. Un test sin un solo `expect` cubre líneas igual.',
    decision: 'Stryker muta el código y vuelve a correr la suite contra cada mutante. Si un mutante sobrevive, hay una línea que ningún test defiende.',
    donde: 'stryker.config.json, src/lib/lab/mutation.ts',
  },
  {
    id: 'mutacion-semanal',
    titulo: 'La mutación NO corre en cada push, a propósito',
    sintoma: 'Un pipeline que tarda 40 minutos es un pipeline que la gente evita.',
    causa: 'Mutar cada línea y re-ejecutar la suite contra cada mutante son miles de ejecuciones. Es lento por diseño, no por estar mal configurado.',
    decision: 'Job aparte: `workflow_dispatch` o domingos a las 08:00 UTC. Nunca bloquea un PR.',
    donde: '.github/workflows/mutation.yml',
  },
  {
    id: 'scanners-no-bloquean',
    titulo: 'Los escáneres registran, no bloquean',
    sintoma: 'Un advisory nuevo sobre una dependencia transitiva tumbaría el pipeline sin que yo pueda arreglarlo.',
    causa: 'npm audit, CodeQL y axe reportan cosas que a veces no dependen de mi código.',
    decision: '`continue-on-error: true` en los tres. Los hallazgos se deduplican por fingerprint, persisten entre corridas y el semáforo real vive en el panel LAB.',
    donde: '.github/workflows/security.yml, a11y.yml',
  },
  {
    id: 'secrets-opcionales',
    titulo: 'Todos los secrets de CI son opcionales',
    sintoma: 'Un fork o un repo recién clonado no tiene mis tokens y el pipeline entero fallaría.',
    causa: 'VERCEL_TOKEN, LAB_INGEST_TOKEN y NTFY_TOPIC son míos, no del proyecto.',
    decision: 'Cada paso comprueba si el secret existe y, si no, emite un ::warning:: y sigue. Sin token no hay rollback ni reporte, pero el pipeline no se rompe. Es el mismo principio fail-open del middleware.',
    donde: '.github/workflows/ci.yml',
  },
  {
    id: 'test-en-prod',
    titulo: 'El último test corre en producción',
    sintoma: 'Un deploy verde en CI puede estar roto en producción por una variable de entorno que solo existe en local.',
    causa: 'CI prueba el código; producción ejecuta el código *más* su entorno. Son dos cosas distintas.',
    decision: 'Tras el deploy, el pipeline espera a ver su propio SHA en /api/health, hace 3 health checks y revierte solo si no pasan 2. La verificación no termina en el merge.',
    donde: 'job verify-production de ci.yml',
  },
  {
    id: 'chaos',
    titulo: 'Probar que el sistema falla bien',
    sintoma: 'Sabía qué pasaba cuando todo funcionaba; no tenía ni idea de qué pasaba cuando la BD tardaba 5 segundos.',
    causa: 'Ningún test convencional prueba el comportamiento degradado.',
    decision: 'Flags de caos en BD que el middleware aplica a rutas concretas: latencia o error 500, con TTL acotado y una lista de rutas que jamás se pueden romper. Y 12 tests que prueban al propio motor de caos.',
    donde: 'src/lib/chaos.ts, tests/chaos.test.ts',
  },
]

// ── Anatomía de un test ─────────────────────────────────────────────────────
// Se disecciona UN test real: la idempotencia de pagos. Cada capa resalta unas
// líneas del bloque de código de abajo.

export const ANATOMIA_META = {
  archivo: 'tests/payments.test.ts',
  test: 'doble clic: requests concurrentes con la misma clave crean UN pago',
  porQue:
    'Cobrarle dos veces a un cliente porque hizo doble clic en «Pagar» no es un bug de interfaz: es un problema con consecuencias contables y legales. Este es el test que más me importa de todo el repositorio.',
}

export const ANATOMIA_CODIGO = [
  { n: 1, capa: 'arrange', txt: "// BD libsql en archivo temporal: las transacciones abren otra" },
  { n: 2, capa: 'arrange', txt: "// conexión y ':memory:' no comparte tablas entre ellas." },
  { n: 3, capa: 'arrange', txt: "vi.mock('../src/db', async () => {" },
  { n: 4, capa: 'arrange', txt: "  const file = join(tmpdir(), `payments-test-${process.pid}.db`)" },
  { n: 5, capa: 'arrange', txt: "  const client = createClient({ url: `file:${file}` })" },
  { n: 6, capa: 'arrange', txt: '  return { db: drizzle(client, { schema }), __client: client }' },
  { n: 7, capa: 'arrange', txt: '})' },
  { n: 8, capa: null, txt: '' },
  { n: 9, capa: 'act', txt: "it('doble clic: requests concurrentes con la misma clave crean UN pago', async () => {" },
  { n: 10, capa: 'act', txt: '  const key = `race-${crypto.randomUUID()}`' },
  { n: 11, capa: 'act', txt: '  const [a, b] = await Promise.all([' },
  { n: 12, capa: 'act', txt: '    createPaymentIdempotent(checkoutInput(key)),' },
  { n: 13, capa: 'act', txt: '    createPaymentIdempotent(checkoutInput(key)),' },
  { n: 14, capa: 'act', txt: '  ])' },
  { n: 15, capa: 'assert', txt: '  expect(a.payment.id).toBe(b.payment.id)' },
  { n: 16, capa: 'act', txt: '})' },
] as const

export type Capa = 'arrange' | 'act' | 'assert' | 'porque'

export const ANATOMIA_CAPAS: { id: Capa; nombre: string; titulo: string; texto: string }[] = [
  {
    id: 'arrange',
    nombre: 'Arrange',
    titulo: 'Preparar un mundo desechable',
    texto:
      'Se sustituye el módulo de base de datos por uno que apunta a un archivo temporal único por proceso. Nunca se toca Turso: los tests escriben, y escribir en la base real gastaría cuota y contaminaría datos de clientes. El nombre lleva el PID para que dos corridas en paralelo no se pisen.',
  },
  {
    id: 'act',
    nombre: 'Act',
    titulo: 'Reproducir el doble clic',
    texto:
      '`Promise.all` con dos llamadas idénticas y la misma clave de idempotencia. No es una simulación de concurrencia: son dos operaciones realmente simultáneas contra la misma base, compitiendo por el mismo índice UNIQUE. Es la única forma de ejercer la condición de carrera de verdad.',
  },
  {
    id: 'assert',
    nombre: 'Assert',
    titulo: 'Una sola afirmación, la que importa',
    texto:
      'Los dos resultados apuntan al mismo pago. Una sola línea, pero cubre todo lo que puede salir mal: si el UNIQUE no estuviera, si la captura del conflicto fallara, o si el segundo request devolviera un pago nuevo en vez del existente, este `expect` lo detecta.',
  },
  {
    id: 'porque',
    nombre: '¿Por qué importa?',
    titulo: 'El coste de que este test no exista',
    texto:
      'Sin él, el bug no aparece en desarrollo (nadie hace doble clic probando) y aparece en producción con un cliente real cobrado dos veces. Es un fallo que se detecta tarde, cuesta dinero y erosiona la confianza. Cuatro líneas de test contra eso es la mejor relación coste/beneficio del repositorio.',
  },
]

// ── Cobertura vs mutación ───────────────────────────────────────────────────

export const MUTANTES_ESTADO = [
  { estado: 'Killed', significado: 'Se mutó la línea y algún test falló. Bien: esa línea está defendida.', tono: 'ok' as const },
  { estado: 'Survived', significado: 'Se mutó la línea y toda la suite siguió en verde. Hay un agujero.', tono: 'bad' as const },
  { estado: 'NoCoverage', significado: 'Ningún test ejecuta siquiera esa línea. Ni se intentó matar al mutante.', tono: 'bad' as const },
  { estado: 'Timeout', significado: 'La mutación provocó un bucle infinito. Cuenta como detectada.', tono: 'ok' as const },
]

// ── Lo que falta ────────────────────────────────────────────────────────────

export const PENDIENTES = [
  {
    titulo: 'Pruebas de carga con k6',
    detalle:
      'Fase 5 del plan del LAB. Los scripts y la tabla están diseñados; falta el VERCEL_TOKEN que permite crear el preview desechable contra el que se dispara la carga. Nunca irá contra producción: Vercel factura por invocación y Turso tiene cuota de filas.',
  },
  {
    titulo: 'Evidencia de usabilidad',
    detalle:
      'La metodología de 6 pasos está documentada y aplicada a un flujo real, pero la columna «Evidencia» sigue vacía: falta ejecutar la prueba con participantes de verdad. Un guion sin participantes no es una prueba de usabilidad.',
  },
  {
    titulo: 'Regresión visual',
    detalle:
      'No hay comparación de capturas entre versiones. Un cambio de CSS que rompa el layout en móvil pasaría los 543 tests sin despeinarse. Es el hueco más grande que tiene hoy la suite.',
  },
  {
    titulo: 'Tests de rendimiento del cliente',
    detalle:
      'Se recogen Web Vitals reales de visitantes (RUM), pero nada falla si una página empeora. Falta un presupuesto de rendimiento que bloquee un PR que degrade el LCP.',
  },
]

// ── Comandos ────────────────────────────────────────────────────────────────

export const COMANDOS = [
  { cmd: 'npm test', desc: 'Los 531 tests de Vitest. ~4 segundos.' },
  { cmd: 'npm run test:watch', desc: 'Modo interactivo: re-ejecuta solo lo que toca el archivo que estás editando.' },
  { cmd: 'npm run test:coverage', desc: 'Genera el reporte HTML en coverage/ para ver qué líneas no toca nadie.' },
  { cmd: 'npm run test:e2e', desc: 'Playwright. Siembra dos bases desechables y levanta el servidor solo.' },
  { cmd: 'npm run test:e2e:ui', desc: 'El inspector de Playwright: ver el navegador paso a paso y depurar un test.' },
  { cmd: 'npm run test:contracts', desc: 'Solo los contratos de API, contra una BD migrada con el migrador real.' },
  { cmd: 'npm run test:mutation', desc: 'Stryker sobre src/lib. Tarda mucho, avisado quedas.' },
  { cmd: 'npx astro check', desc: 'Type-check completo. No es un test, pero atrapa lo mismo que muchos.' },
]

export const ARTICULOS = [
  {
    slug: 'e2e-que-prueban-lo-que-de-verdad-importa',
    titulo: 'E2E que prueban lo que de verdad importa',
    desc: 'Por qué 45 tests e2e y no 450, y cómo se eligen los flujos que sí merecen uno.',
  },
  {
    slug: 'mutar-el-codigo-para-saber-si-mis-tests-sirven',
    titulo: 'Mutar el código para saber si mis tests sirven',
    desc: 'Mutation testing en la práctica: qué mutantes sobrevivieron y qué dijeron de mi suite.',
  },
  {
    slug: 'no-solo-un-scan-verde',
    titulo: 'No solo un scan verde',
    desc: 'SAST y accesibilidad con hallazgos reales, deduplicados y con ciclo de vida propio.',
  },
  {
    slug: 'chaos-engineering-que-no-puede-hacerte-dano',
    titulo: 'Chaos engineering que no puede hacerte daño',
    desc: 'Inyectar fallos en producción con TTL acotado y rutas que nunca se pueden romper.',
  },
]

// ── Glosario ────────────────────────────────────────────────────────────────

export const GLOSARIO = [
  { termino: 'Assert', def: 'La afirmación que hace que un test sea un test. Sin al menos un assert, el test solo ejecuta código.' },
  { termino: 'Fixture', def: 'Datos de ejemplo preparados para un test. Aquí, por ejemplo, un recorte real de un reporte de Stryker.' },
  { termino: 'Seed', def: 'Poblar una base vacía con datos conocidos antes de probar. Los e2e siembran dos bases en cada corrida.' },
  { termino: 'Flaky', def: 'Test que a veces pasa y a veces no sin que cambie el código. Es peor que un test que falla siempre: enseña a ignorar el rojo.' },
  { termino: 'Mutante', def: 'Una copia del código con un cambio deliberado (un > por un >=). Si la suite sigue verde, el mutante «sobrevive».' },
  { termino: 'Mutation score', def: 'Porcentaje de mutantes que los tests detectan. Mide la calidad de los tests, no la del código.' },
  { termino: 'Cobertura', def: 'Porcentaje de líneas que se ejecutan durante los tests. Dice qué se tocó, no qué se comprobó.' },
  { termino: 'E2E', def: 'End-to-end: un navegador real recorriendo un flujo completo, como lo haría una persona.' },
  { termino: 'Contrato', def: 'Un esquema que congela la forma de la respuesta de una API. Cambiarla obliga a actualizar el esquema a propósito.' },
  { termino: 'Idempotencia', def: 'Que repetir la misma operación no produzca un efecto nuevo. Sin ella, un doble clic cobra dos veces.' },
  { termino: 'SAST', def: 'Static Application Security Testing: buscar vulnerabilidades leyendo el código, sin ejecutarlo.' },
  { termino: 'Fail-open', def: 'Ante un fallo del propio sistema de defensa, dejar pasar la petición. Una defensa que tumba el sitio que protege es una vulnerabilidad nueva.' },
  { termino: 'Health check', def: 'Un endpoint que responde «estoy vivo». Aquí además devuelve el SHA del commit desplegado, que es lo que permite verificar el deploy.' },
  { termino: 'Rollback', def: 'Volver a la versión anterior. Aquí es automático: si el health check falla, nadie tiene que intervenir.' },
  { termino: 'Error budget', def: 'El margen de caída que permite un objetivo de disponibilidad. Con 99.5% mensual son ~3.6 horas.' },
  { termino: 'Chaos engineering', def: 'Provocar fallos a propósito y de forma controlada para descubrir cómo se degrada el sistema antes de que pase de verdad.' },
]

// Fallback de las métricas cuando la query a ci_runs no devuelve nada.
// Medición real del 24 jul 2026 (npx vitest run --coverage), idéntica a la que
// reporta el pipeline: 1237/2258 líneas de src/lib/**.
export const METRICAS_REFERENCIA = {
  fecha: '24 jul 2026',
  tests: 542,
  suites: 208,
  archivos: 42,
  e2e: 45,
  e2eSpecs: 6,
  coberturaLineas: 54.78,
  coberturaRamas: 55.71,
  coberturaFunciones: 54.27,
  niveles: NIVELES.length,
}

export const TOTAL_AUTOMATIZADOS = METRICAS_REFERENCIA.tests + METRICAS_REFERENCIA.e2e
