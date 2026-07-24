// Contenido de /docs/verificacion-validacion.
//
// No duplica los 14 niveles de src/data/testing.ts: los reclasifica bajo el
// marco IEEE 1012 (verificación vs. validación) y añade la razón de por qué
// cada uno cae de un lado o del otro. La página importa NIVELES directamente
// para pregunta/herramienta/archivos; este archivo solo aporta la etiqueta y
// el porqué.

export type TipoVV = 'verificacion' | 'validacion'

export const DEFINICIONES: Record<TipoVV, { titulo: string; pregunta: string; enfoque: string }> = {
  verificacion: {
    titulo: 'Verificación',
    pregunta: '¿Estamos construyendo el producto correctamente?',
    enfoque:
      'Conformidad interna: el código hace lo que su propia especificación dice que debe hacer. No necesita a nadie fuera del equipo — un esquema, un contrato o una línea de código ya definen qué es «correcto».',
  },
  validacion: {
    titulo: 'Validación',
    pregunta: '¿Estamos construyendo el producto correcto?',
    enfoque:
      'Conformidad externa: el sistema sirve para lo que una persona real necesita hacer con él. La vara no es una especificación interna, es alguien —o algo que simula a alguien— tratando de cumplir un objetivo real.',
  },
}

export type ClasificacionNivel = {
  /** Debe coincidir con Nivel.id en src/data/testing.ts */
  id: string
  tipo: TipoVV
  porque: string
}

export const CLASIFICACION: ClasificacionNivel[] = [
  {
    id: 'unitario',
    tipo: 'verificacion',
    porque: 'Compara la salida de una función contra lo que su propia firma promete. La vara la puso quien escribió el código, no un usuario.',
  },
  {
    id: 'integracion',
    tipo: 'verificacion',
    porque: 'Comprueba que un UNIQUE o una transacción se comportan como dice el esquema. Sigue siendo una afirmación interna sobre el sistema, no sobre su uso.',
  },
  {
    id: 'contratos',
    tipo: 'verificacion',
    porque: 'Un esquema Zod es la especificación. Verificar contra tu propio esquema es el caso más puro de «¿lo construimos como dijimos que lo íbamos a construir?».',
  },
  {
    id: 'cobertura',
    tipo: 'verificacion',
    porque: 'Mide qué parte del código se ejecutó contra la propia suite. No dice nada sobre si ese código sirve para algo real.',
  },
  {
    id: 'mutation',
    tipo: 'verificacion',
    porque: 'Comprueba que los propios tests defienden lo que dicen defender. Es verificación de la verificación, no toca al usuario en ningún momento.',
  },
  {
    id: 'npm-audit',
    tipo: 'verificacion',
    porque: 'Compara versiones de dependencias contra una lista de advisories publicados. Conformidad contra una base de datos externa, no contra una necesidad de un usuario.',
  },
  {
    id: 'codeql',
    tipo: 'verificacion',
    porque: 'Análisis estático de patrones de código contra reglas conocidas de vulnerabilidad. No ejecuta nada ni involucra a nadie usando el sistema.',
  },
  {
    id: 'verify-prod',
    tipo: 'verificacion',
    porque: 'Un health check confirma que el proceso desplegado es el que se esperaba desplegar. Es fidelidad al propio despliegue, no a una expectativa de usuario.',
  },
  {
    id: 'chaos',
    tipo: 'verificacion',
    porque: 'Confirma que el sistema se degrada como el diseño de resiliencia dice que debe degradarse. La especificación es interna: «esta ruta nunca debe romperse».',
  },
  {
    id: 'monitoreo',
    tipo: 'verificacion',
    porque: 'Sondea si el sistema sigue respondiendo lo que su contrato de servicio promete (disponibilidad). No mide si a alguien le sirve lo que responde.',
  },
  {
    id: 'carga',
    tipo: 'verificacion',
    porque: 'Comprueba que la latencia se mantiene dentro de un presupuesto definido por ingeniería, no por un usuario real observado.',
  },
  {
    id: 'dast',
    tipo: 'verificacion',
    porque: 'Compara el comportamiento del sitio en ejecución contra un catálogo externo de patrones de vulnerabilidad conocidos (OWASP), igual que SAST pero en caliente. El oráculo sigue siendo un estándar, no una persona usando el sistema.',
  },
  {
    id: 'e2e',
    tipo: 'validacion',
    porque:
      'No compara contra una especificación interna: simula a una persona con un navegador tratando de completar un objetivo real (pagar, ingresar, contratar). Si el flujo cambió de forma que ya no sirve, un e2e bien escrito lo nota aunque el código «cumpla su contrato».',
  },
  {
    id: 'a11y',
    tipo: 'validacion',
    porque:
      'La vara no es el propio código: es si una persona con lector de pantalla o sin ratón puede usar la página. axe-core es un proxy automatizado de esa pregunta —cubre ~30-40%— pero la pregunta que responde es externa al sistema, no interna.',
  },
  {
    id: 'usabilidad',
    tipo: 'validacion',
    porque:
      'El único nivel donde no hay ninguna especificación que verificar: el resultado es una observación de alguien que no construyó el sistema intentando usarlo. Es la validación en su forma más literal.',
  },
]

// ── Trazabilidad hacia atrás ────────────────────────────────────────────────
// La validación no puede quedarse solo en "usabilidad": el resto de /docs ya
// registra qué necesidad real originó cada requisito. Estos enlaces conectan
// el marco V&V con documentos que existían antes y que no hay que repetir.

export const TRAZABILIDAD = [
  {
    href: '/docs/casos-de-uso',
    titulo: 'Casos de uso',
    rol: 'La validación empieza aquí: cada caso de uso es una necesidad real de un actor, escrita antes que el código.',
  },
  {
    href: '/docs/historias-de-usuario',
    titulo: 'Historias de usuario',
    rol: 'Su Definition of Done es el criterio de validación en formato XP: cuándo una historia sirve de verdad, no solo cuándo compila.',
  },
  {
    href: '/docs/requerimientos-no-funcionales',
    titulo: 'Requerimientos no funcionales',
    rol: 'ISO/IEC 25010 es, en el fondo, un catálogo de propiedades verificables (rendimiento, seguridad, mantenibilidad) — el lado de verificación de este mismo mapa.',
  },
  {
    href: '/docs/testing',
    titulo: 'Testing — los 14 niveles',
    rol: 'El detalle técnico completo de cada nivel: herramienta, volumen, archivos, punto ciego. Esta página los reclasifica; esa los explica uno por uno.',
  },
  {
    href: '/docs/usability-testing',
    titulo: 'Usability testing',
    rol: 'La metodología de validación con usuarios en 6 pasos, aplicada a un flujo real del sitio.',
  },
]

export const GLOSARIO_VV = [
  { termino: 'IEEE 1012', def: 'El estándar que formaliza la distinción verificación/validación para software (Verification and Validation Plans). No define herramientas, solo el marco de preguntas.' },
  { termino: 'V-model', def: 'Representación clásica del ciclo de vida donde cada etapa de construcción tiene su etapa de verificación espejo. Aquí no se sigue el modelo en cascada, pero la pregunta de cada espejo sigue aplicando.' },
  { termino: 'Oráculo', def: 'La fuente de verdad contra la que se compara un resultado. En verificación el oráculo es interno (un esquema, un contrato); en validación el oráculo es una necesidad externa, a menudo humana.' },
  { termino: 'UAT', def: 'User Acceptance Testing: validación formal hecha por quien va a usar o pagar por el sistema, no por quien lo construyó. Este proyecto no tiene un UAT formal separado — el usability testing y los casos de uso cumplen ese rol.' },
]
