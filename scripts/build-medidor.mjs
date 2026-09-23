#!/usr/bin/env node
/**
 * Genera las versiones JavaScript del medidor de cómputo a partir de
 * `instrumentacion/medidor.ts`:
 *
 *   medidor.mjs → proyectos con `import` (ESM), p. ej. una API Express en Node 20.
 *   medidor.cjs → proyectos con `require` (CommonJS), p. ej. Express + EJS.
 *
 * Existen porque Node 20 no entiende TypeScript y un proyecto CommonJS no
 * puede importar un módulo ESM con `export`. Se generan y no se escriben a
 * mano: dos medidores mantenidos por separado terminan midiendo distinto, y
 * esa diferencia se vería como consumo de un cliente que no existe.
 *
 * Usa `ts.transpileModule` de la dependencia `typescript` que el repo ya
 * tiene: quita los tipos y conserva los comentarios, que son la documentación
 * que el proyecto del cliente recibe junto al código.
 *
 * `tests/medidor-js.test.ts` vuelve a generar en memoria y falla si los
 * archivos del repo no coinciden.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const FUENTE = join(raiz, 'instrumentacion', 'medidor.ts')

const cabecera = (formato) =>
  [
    `// GENERADO desde instrumentacion/medidor.ts (${formato}) por scripts/build-medidor.mjs.`,
    '// No editar a mano: cambia el .ts y corre `npm run medidor:build` en el portafolio.',
    // Código generado: el lint del proyecto que lo copia no tiene nada que
    // corregir aquí, y sus avisos de estilo solo serían ruido en su CI.
    '/* eslint-disable */',
    '',
  ].join('\n')

/** Devuelve el contenido de los dos archivos, sin escribir nada. */
export function generarMedidorJs(fuente = readFileSync(FUENTE, 'utf8')) {
  const transpilar = (module) =>
    ts.transpileModule(fuente, {
      compilerOptions: {
        module,
        // ES2022 lo corre Node 16 en adelante, y el medidor ya usa `??=`.
        target: ts.ScriptTarget.ES2022,
        removeComments: false,
        verbatimModuleSyntax: false,
      },
      fileName: 'medidor.ts',
    }).outputText
  return {
    mjs: cabecera('ESM') + transpilar(ts.ModuleKind.ESNext),
    cjs: cabecera('CommonJS') + transpilar(ts.ModuleKind.CommonJS),
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { mjs, cjs } = generarMedidorJs()
  writeFileSync(join(raiz, 'instrumentacion', 'medidor.mjs'), mjs)
  writeFileSync(join(raiz, 'instrumentacion', 'medidor.cjs'), cjs)
  console.log('✓ instrumentacion/medidor.mjs y medidor.cjs generados')
}
