# 17 · Reglas y convenciones

Lo que cualquier persona o agente que edite este repo debe respetar. La fuente
primaria es [`CLAUDE.md`](../../CLAUDE.md); aquí se suman las preferencias de
trabajo que Mike ha fijado a lo largo del proyecto.

## Reglas no negociables

1. **Commits, push y deploys los hace solo el usuario.** No proponerlos, no
   ofrecerlos, no mencionarlos como siguiente paso, no revisar el estado de git
   al cerrar una tarea. Tampoco crear ramas ni PRs: los cambios se dejan en el
   working tree. Si el usuario lo pide explícitamente, sí se hace.
2. **Migraciones solo aditivas.** Nunca eliminar columnas o tablas sin pedirlo.
3. **Fail-open en seguridad y observabilidad**; **fail-closed** solo en
   autorización (revocación de sesiones admin, PIN de Cotiza). No "arreglar" la
   revocación a fail-open.
4. **El `clientId` del portal nunca viene del request**; siempre de la sesión y
   siempre en el `WHERE`.
5. **Idempotencia en todo lo que cobra dinero**, reutilizando `payments.ts`.
6. **El monto nunca viaja desde el navegador**: el servidor recalcula y firma.
7. **Ninguna IA inventa cifras ni ejecuta escrituras sin aprobación.**
8. **Coste de lectura**: nada de agregar tablas crudas en ventanas > 24 h en
   rutas públicas.
9. **Variables de entorno con `serverEnv()`**.
10. **Rutas privadas nuevas** van al matcher `isAdmin` del middleware (no un gate
    paralelo); si son públicas pero sensibles, `Cache-Control: no-store` y
    evaluar entrada en `src/lib/security/paths.ts`.
11. **Una categoría nueva de rastro de auditoría** se añade a `AUDIT_CATEGORIES`,
    o se publicará como ataque.

## OPSEC

En páginas públicas (y en esta wiki, porque el repo es público): solo
agregados. Nunca IPs completas, nombres exactos de reglas de detección, rutas
señuelo, umbrales de bloqueo, valores de variables de entorno ni nada que sirva
de manual de ataque.

## Código

- **Comentarios en español**, explicando el **porqué** de una decisión no
  obvia, nunca el qué. La densidad de comentarios del repo es alta: imitarla.
- **Lógica pura en `src/lib`**, testeada sin BD; la persistencia en un módulo
  hermano (`-db`, `-store`).
- Un módulo importado desde el navegador no puede importar `node:crypto`,
  `../db` ni nada con efectos: partir en isomorfo + solo-servidor.
- **Integraciones opcionales**: no-op silencioso (`{ skipped: true }`) si falta
  su variable; nunca lanzar.
- **Fechas en zona Colombia** (`fecha-co.ts`, `formatFechaCorta`); el servidor
  de Vercel está en UTC.
- **Escapar** todo lo que venga de la base o la API antes de `innerHTML`;
  `jsonEnScript` para JSON en `<script>`; `urlSegura` para `href`.
- **Datos, no cifras a mano**: `/docs` solo renderiza `src/data/*`. Precios solo
  del tarifario.
- **Sin frameworks de UI**: Astro + TypeScript + Tailwind. Dependencias de UI
  permitidas: `lenis`, `gsap`, `mermaid`.
- **Diagramas con motor propio** llevan test de geometría y de notación.
- **i18n**: traducir = diccionario + cascarón en `src/pages/en/` +
  `TRANSLATED_ROUTES`; enlaces con `localizedHref`.

## Al añadir un feature grande

1. Si toca dinero o datos personales, revisar primero `payments.ts`,
   `lib/security/*` y `lib/notify.ts`.
2. Migración aditiva si toca el esquema.
3. Tests: lógica pura primero; libSQL temporal si hay concurrencia o UNIQUE.
4. Requisito en `src/data/documentacion.ts` (`planeado` → `implementado`, con
   `origen` y `verificacion`).
5. Actualizar su `docs/plan-*.md` (fases ✅, decisiones nuevas).
6. Un artículo en `src/content/notes/{es,en}/` con `decision` en el frontmatter.
7. Al cerrar una iteración, entrada en `src/data/iteraciones-portfolio.ts`.
8. Si cambia algo estructural, actualizar esta wiki.

## Escritura (código, docs, UI y chat)

- **Nunca usar el guion largo (em dash) ni el guion medio como puntuación.**
  Alternativas: dos puntos, coma, punto, paréntesis o un guion simple con
  espacios.
- **Tuteo colombiano**, nunca voseo (ni "podés" ni "vos"), también en los
  prompts de las IA del sitio.
- Al pedir una decisión al usuario: corto, sin jerga, opciones numeradas; la
  evidencia técnica va al plan, no a la pregunta.
- Ortografía completa en español, con tildes.

## Diseño

- **Nunca el patrón `border-left`** (franja de color pegada al borde izquierdo)
  en tarjetas. Alternativas: un punto de color junto al título, tinte de fondo
  en hover/active, sombra sutil.
- **Motion de calidad, nada simplista**, y verificado con capturas reales antes
  de entregar.
- En páginas serias (p. ej. `/contact`), solo motion sobre lo que ya existe;
  preguntar antes de inventar piezas nuevas.
- No tocar hero, navbar ni footer para decoraciones de temporada.
- La cinta del pulso bajo el hero de la portada no se quita.

## Forma de trabajar con Mike

- **Avisar el plan y esperar un sí** antes de crear o editar archivos o gastar
  API, salvo que el pedido ya diga "adelante".
- **Un plan no es una entrega**: nunca decir "completo" si solo se escribió el
  plan; verificar en el sitio antes de decir "listo".
- **Verificar pendientes contra el código**: `pendientes.md` y las notas se
  quedan atrás; revisar planes y código antes de listar algo como pendiente.
- Reportar resultados con fidelidad: si un test falla, decirlo con su salida.
