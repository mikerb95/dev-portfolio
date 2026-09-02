// Genera docs/planteamiento-del-problema.md desde src/data/planteamiento.ts.
//
// El documento en Markdown existe porque la entrega académica se arma en un
// procesador de texto, no en un navegador. Pero escribirlo a mano habría creado
// una segunda versión del mismo texto, que es exactamente lo que RNF-14 impide:
// el .md se regenera, nunca se edita. Un test comprueba que el archivo del
// repositorio coincide con lo que este script produce hoy.
//
// Uso:
//   npm run planteamiento:export
//   npm run planteamiento:export -- --check    # falla si el .md está desfasado

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const destino = join(root, 'docs', 'planteamiento-del-problema.md')

const {
  CAUSAS,
  JUSTIFICACION,
  OBJETIVOS_ESPECIFICOS,
  OBJETIVO_GENERAL,
  PROBLEMA,
  SINTOMAS,
} = await import(join(root, 'src', 'data', 'planteamiento.ts'))

export const render = () => {
  const l = []
  l.push('# Planteamiento del problema, justificación y objetivos')
  l.push('')
  l.push('> **Archivo generado.** No se edita a mano: sale de')
  l.push('> [`src/data/planteamiento.ts`](../src/data/planteamiento.ts) con')
  l.push('> `npm run planteamiento:export`, y se publica en')
  l.push('> [`/docs/planteamiento`](https://codebymike.tech/docs/planteamiento).')
  l.push('> Para cambiar el texto se cambia el dato tipado y se regenera.')
  l.push('')
  l.push('## 1. Planteamiento del problema')
  l.push('')
  l.push(PROBLEMA.contexto)
  l.push('')
  l.push(PROBLEMA.nucleo)
  l.push('')
  l.push(`**Pregunta que orienta el proyecto.** ${PROBLEMA.pregunta}`)
  l.push('')
  l.push('### 1.1 Síntomas observados')
  l.push('')
  l.push('| ID | Síntoma | Cómo se constató | Lo que cuesta |')
  l.push('|---|---|---|---|')
  for (const s of SINTOMAS) l.push(`| ${s.id} | ${s.enunciado} | ${s.evidencia} | ${s.consecuencia} |`)
  l.push('')
  l.push('### 1.2 Causas')
  l.push('')
  l.push('| ID | Causa | Síntomas que explica |')
  l.push('|---|---|---|')
  for (const c of CAUSAS) l.push(`| ${c.id} | ${c.enunciado} | ${c.explica.join(', ')} |`)
  l.push('')
  l.push('### 1.3 Delimitación')
  l.push('')
  for (const d of PROBLEMA.delimitacion) {
    l.push(`**${d.dimension}.** ${d.dentro}`)
    l.push('')
    l.push(`*Queda fuera:* ${d.fuera}`)
    l.push('')
  }
  l.push('## 2. Justificación')
  l.push('')
  for (const j of JUSTIFICACION) {
    l.push(`### ${j.eje}: ${j.titulo}`)
    l.push('')
    l.push(j.texto)
    l.push('')
  }
  l.push('## 3. Objetivos')
  l.push('')
  l.push('### 3.1 Objetivo general')
  l.push('')
  l.push(OBJETIVO_GENERAL.enunciado)
  l.push('')
  l.push('Condiciones que lo vuelven falsable:')
  l.push('')
  for (const c of OBJETIVO_GENERAL.condiciones) l.push(`- ${c}`)
  l.push('')
  l.push('### 3.2 Objetivos específicos')
  l.push('')
  l.push('| ID | Objetivo | Indicador | Meta | Estado |')
  l.push('|---|---|---|---|---|')
  for (const o of OBJETIVOS_ESPECIFICOS)
    l.push(`| ${o.id} | ${o.enunciado} | ${o.indicador} | ${o.meta} | ${o.estado} |`)
  l.push('')
  l.push('### 3.3 Trazabilidad de los objetivos')
  l.push('')
  l.push('| ID | Requisitos que lo realizan | Cómo se verifica |')
  l.push('|---|---|---|')
  for (const o of OBJETIVOS_ESPECIFICOS)
    l.push(`| ${o.id} | ${o.requisitos.join(', ')} | ${o.verificacion} |`)
  l.push('')
  return `${l.join('\n')}\n`
}

// El efecto solo corre cuando el script se invoca directamente: tests/planteamiento.test.ts
// importa `render` para comparar contra el archivo del repositorio, y una importación
// no puede sobrescribirlo por el camino.
const invocadoDirectamente = (process.argv[1] ?? '').endsWith('export-planteamiento.mjs')

if (invocadoDirectamente) {
  const md = render()
  if (process.argv.includes('--check')) {
    const actual = await readFile(destino, 'utf8').catch(() => '')
    if (actual !== md) {
      console.error('docs/planteamiento-del-problema.md está desfasado. Corré: npm run planteamiento:export')
      process.exit(1)
    }
    console.log('docs/planteamiento-del-problema.md al día.')
  } else {
    await writeFile(destino, md)
    console.log(`Escrito ${destino}`)
  }
}
