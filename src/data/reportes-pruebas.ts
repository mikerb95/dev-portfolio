// Contenido de /docs/reportes-pruebas: qué emite el runner de pruebas y en qué
// formato, con la salida REAL de cada reporter.
//
// Todos los bloques de `salida` se capturaron corriendo el reporter contra
// tests/phone.test.ts (14 casos, lógica pura) y están recortados, nunca
// inventados ni reescritos a mano: el valor de una página de referencia está en
// que lo que muestra sea lo que de verdad imprime el comando.
//
// Los conteos de la suite completa NO se escriben aquí: salen de
// ejecucion-pruebas.json, como en el resto de /docs.

export type Destino = 'consola' | 'archivo'

export type Reporter = {
  id: string
  nombre: string
  formato: string
  destino: Destino
  /** Si necesita instalar algo que no está en el repo. */
  dependencia?: string
  comando: string
  paraQue: string
  /** Salida real, recortada. */
  salida: string
  /** El punto de la comparación: qué gana y qué pierde frente a los demás. */
  fuerte: string
  debil: string
}

export const REPORTERS: Reporter[] = [
  {
    id: 'default',
    nombre: 'default',
    formato: 'Texto con color',
    destino: 'consola',
    comando: 'npm test',
    paraQue: 'El día a día. Una línea por archivo y el detalle solo de lo que falla.',
    salida: ` RUN  v4.1.9 /home/mike/dev/work/github.com/portfolio

 ✓ tests/phone.test.ts (14 tests) 12ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  19:54:56
   Duration  333ms (transform 75ms, setup 0ms, import 103ms, tests 12ms)`,
    fuerte: 'Silencioso cuando todo pasa: el ruido aparece solo si hay algo que mirar.',
    debil: 'No dice el tiempo de cada prueba, solo el del archivo.',
  },
  {
    id: 'verbose',
    nombre: 'verbose',
    formato: 'Texto con color, una línea por caso',
    destino: 'consola',
    comando: 'npx vitest run --reporter=verbose',
    paraQue: 'Ver el nombre y el tiempo de cada caso mientras se trabaja en un módulo.',
    salida: ` ✓ tests/phone.test.ts > normalizePhone > normaliza las formas en que se escribe un móvil colombiano 3ms
 ✓ tests/phone.test.ts > normalizePhone > acepta números extranjeros solo con + explícito 1ms
 ✓ tests/phone.test.ts > normalizePhone > rechaza lo que no es un teléfono 1ms
 ✓ tests/phone.test.ts > normalizePhone > rechaza un + en medio del número 0ms
 ✓ tests/phone.test.ts > normalizePhone > es idempotente: normalizar lo ya normalizado no lo cambia 0ms
 ✓ tests/phone.test.ts > isE164 > distingue el formato canónico 0ms
 ✓ tests/phone.test.ts > formatPhone > agrupa los colombianos 3-3-4 0ms`,
    fuerte: 'Es donde se ve que el nombre del caso hace de documentación ejecutable.',
    debil: 'Con 1181 pruebas son 1181 líneas: ilegible para la suite completa.',
  },
  {
    id: 'dot',
    nombre: 'dot',
    formato: 'Un carácter por prueba',
    destino: 'consola',
    comando: 'npx vitest run --reporter=dot',
    paraQue: 'Corridas largas donde solo interesa el avance y el recuento final.',
    salida: ` RUN  v4.1.9 /home/mike/dev/work/github.com/portfolio

··············

 Test Files  1 passed (1)
      Tests  14 passed (14)`,
    fuerte: 'Cabe entero en pantalla por muchas pruebas que haya.',
    debil: 'Un punto no dice qué se probó. Sirve de barra de progreso, no de informe.',
  },
  {
    id: 'tap-flat',
    nombre: 'tap-flat',
    formato: 'TAP 13 (texto estandarizado)',
    destino: 'consola',
    comando: 'npx vitest run --reporter=tap-flat > informes/tests.tap',
    paraQue: 'Entregar el resultado a otra herramienta que hable TAP, sin XML de por medio.',
    salida: `TAP version 13
1..14
ok 1 - tests/phone.test.ts > normalizePhone > normaliza las formas en que se escribe un móvil colombiano # time=5.14ms
ok 2 - tests/phone.test.ts > normalizePhone > acepta números extranjeros solo con + explícito # time=1.01ms
ok 3 - tests/phone.test.ts > normalizePhone > rechaza lo que no es un teléfono # time=1.47ms
ok 4 - tests/phone.test.ts > normalizePhone > rechaza un + en medio del número # time=0.77ms`,
    fuerte: 'Formato abierto y viejo (1987), legible por humanos y por máquinas a la vez.',
    debil: 'Ignora --outputFile: hay que redirigir la salida con >, como se ve en el comando.',
  },
  {
    id: 'junit',
    nombre: 'junit',
    formato: 'XML',
    destino: 'archivo',
    comando: 'npx vitest run --reporter=junit --outputFile=informes/tests-junit.xml',
    paraQue: 'El formato que este proyecto usa como fuente del informe y de /docs/ejecucion-pruebas.',
    salida: `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="14" failures="0" errors="0" time="0.013608159">
    <testsuite name="tests/phone.test.ts" timestamp="2026-08-24T00:57:18.679Z"
               tests="14" failures="0" errors="0" skipped="0" time="0.013608159">
        <testcase classname="tests/phone.test.ts"
                  name="normalizePhone &gt; normaliza las formas en que se escribe un móvil colombiano"
                  time="0.004271544">
        </testcase>`,
    fuerte:
      'Es el mismo formato que produce Maven Surefire en Java, así que cualquier CI y cualquier evaluador lo reconoce. Trae el tiempo de cada caso.',
    debil: 'Ilegible en crudo: hay que renderizarlo para poder presentarlo.',
  },
  {
    id: 'json',
    nombre: 'json',
    formato: 'JSON',
    destino: 'archivo',
    comando: 'npx vitest run --reporter=json --outputFile=informes/tests.json',
    paraQue: 'Procesar el resultado con un script propio sin parsear XML.',
    salida: `{
  "numTotalTests": 14,
  "numPassedTests": 14,
  "startTime": 1787533039636,
  "success": true,
  "testResults": [{
    "assertionResults": [{
      "fullName": "normalizePhone normaliza las formas en que se escribe un móvil colombiano",
      "status": "passed",
      "duration": 3.2443159999999978
    }]
  }]
}`,
    fuerte: 'Se consume con JSON.parse, sin dependencias ni regex.',
    debil: 'Aplana la jerarquía describe/it en un solo fullName con espacios.',
  },
  {
    id: 'html',
    nombre: 'html',
    formato: 'Aplicación web interactiva',
    destino: 'archivo',
    dependencia: '@vitest/ui',
    comando: 'npm i -D @vitest/ui && npx vitest run --reporter=html',
    paraQue: 'Explorar la suite en el navegador con filtros y código fuente.',
    salida: ` MISSING DEPENDENCY  Cannot find dependency '@vitest/ui'

Error: Failed to load custom Reporter from @vitest/ui/reporter
  [cause]: Error: Failed to load url @vitest/ui/reporter. Does the file exist?`,
    fuerte: 'Es el equivalente más directo al informe navegable de JaCoCo.',
    debil:
      'Exige una dependencia que este repo no tiene, y produce una SPA para desarrollar, no un dato procesable. Por eso el informe del proyecto se genera desde JUnit y no desde aquí.',
  },
]

// ── Anatomía de un fallo ────────────────────────────────────────────────────
// El caso interesante de un log no es el verde: es qué información da cuando
// algo se rompe. Salida real de una aserción fallida provocada a propósito.

export const FALLO_CONSOLA = ` ❯ tests/zz-fallo-demo.test.ts (1 test | 1 failed) 20ms
     × normaliza un móvil colombiano a E.164 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/zz-fallo-demo.test.ts > normalizePhone > normaliza un móvil colombiano a E.164
AssertionError: expected '+573104641228' to be '+57310464122' // Object.is equality

Expected: "+57310464122"
Received: "+573104641228"

 ❯ tests/zz-fallo-demo.test.ts:6:44
      4| describe('normalizePhone', () => {
      5|   it('normaliza un móvil colombiano a E.164', () => {
      6|     expect(normalizePhone('310 464 1228')).toBe('+57310464122')
       |                                            ^
      7|   })
      8| })`

export const FALLO_XML = `<testcase classname="tests/zz-fallo-demo.test.ts"
          name="normalizePhone &gt; normaliza un móvil colombiano a E.164" time="0.008989228">
    <failure message="expected &apos;+573104641228&apos; to be &apos;+57310464122&apos;"
             type="AssertionError">
AssertionError: expected &apos;+573104641228&apos; to be &apos;+57310464122&apos;

Expected: &quot;+57310464122&quot;
Received: &quot;+573104641228&quot;

 ❯ tests/zz-fallo-demo.test.ts:6:44
    </failure>
</testcase>`

export type PiezaFallo = {
  pieza: string
  que: string
}

export const ANATOMIA_FALLO: PiezaFallo[] = [
  {
    pieza: 'Ruta completa del caso',
    que: 'Archivo, describe e it concatenados. Es lo que permite volver a correr solo ese caso con -t.',
  },
  {
    pieza: 'Tipo de error',
    que: 'AssertionError distingue "la prueba comprobó y no cuadró" de un TypeError, que es la prueba rota.',
  },
  {
    pieza: 'Expected / Received',
    que: 'Los dos valores enfrentados. En el ejemplo sobra un dígito: el error estaba en la prueba, no en la función.',
  },
  {
    pieza: 'Archivo:línea:columna',
    que: 'La posición exacta de la aserción que falló, no la del inicio del test.',
  },
  {
    pieza: 'Fragmento de código con el cursor',
    que: 'El contexto alrededor con un ^ bajo la expresión culpable. Es lo que ahorra abrir el editor.',
  },
]

// ── Cómo se relaciona con las herramientas de Java ──────────────────────────
// Buena parte de la bibliografía y de los evaluadores viene del mundo Maven, y
// la equivalencia no es obvia porque los nombres coinciden a medias.

export type Equivalencia = {
  java: string
  aqui: string
  nota: string
}

export const EQUIVALENCIAS: Equivalencia[] = [
  {
    java: 'JUnit 5 (@Test)',
    aqui: 'Vitest (it / test)',
    nota: 'El framework de pruebas. El nombre legible es el string de it(), no una anotación @DisplayName aparte.',
  },
  {
    java: 'Maven Surefire',
    aqui: 'vitest run',
    nota: 'El que ejecuta la suite y produce el reporte. Surefire escribe XML por defecto; Vitest hay que pedírselo.',
  },
  {
    java: 'target/surefire-reports/*.xml',
    aqui: 'informes/tests-junit.xml',
    nota: 'Mismo esquema XML: testsuite, testcase, atributo time en segundos, hijo failure.',
  },
  {
    java: 'JaCoCo',
    aqui: 'coverage v8 (npm run test:coverage)',
    nota: 'Cobertura. JaCoCo instrumenta bytecode y cuenta instrucciones; v8 mide sobre el motor y cuenta sentencias. Los porcentajes no son comparables entre sí.',
  },
  {
    java: 'PIT (pitest)',
    aqui: 'Stryker (npm run test:mutation)',
    nota: 'Mutación: mide si las pruebas detectan un cambio en el código, que es lo que la cobertura no responde.',
  },
]
