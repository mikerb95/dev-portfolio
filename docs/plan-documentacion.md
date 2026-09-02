# Plan - Módulo de Documentación del proyecto (`/admin/docs`)

> Estado: **Fase 1 implementada** (jul 2026), más las entregas posteriores de
> §5.b (21–24 jul) y §5.c (30 jul). El módulo vive hoy en `/docs` (público), no
> en `/admin/docs`. Este plan es el documento vivo: alcance, arquitectura,
> contenido de cada subpágina, fuentes de verdad y fases futuras.

## 1. Objetivo

Centralizar en el panel admin la documentación de ingeniería del portfolio
(codebymike.tech) con el mismo rigor que un proyecto formal: requerimientos,
casos de uso, diagramas UML y un tablero kanban XP del propio proyecto,
replicando el patrón ya probado en DobleYo (`IteracionesBoard`).

## 2. Alcance

Una sección **Documentación** en la sidebar del admin con estas subpáginas:

| Ruta | Contenido | Fuente de verdad |
|---|---|---|
| `/admin/docs` | Hub: visión del sistema, alcance, mapa de subpáginas, stack | `src/data/documentacion.ts` |
| `/admin/docs/requerimientos-funcionales` | RF por módulo, con prioridad y estado | `src/data/documentacion.ts` |
| `/admin/docs/requerimientos-no-funcionales` | RNF por categoría ISO/IEC 25010, con métrica verificable | `src/data/documentacion.ts` |
| `/admin/docs/casos-de-uso` | Actores + catálogo de CU + diagrama de casos de uso | `src/data/documentacion.ts` |
| `/admin/docs/casos-de-uso-extendidos` | CU en formato extendido (pre/post, flujos, excepciones) | `src/data/documentacion.ts` |
| `/admin/docs/historias-de-usuario` | Catálogo de historias XP ("Como... quiero... para..."), agrupadas por actor, con DoD | `src/data/iteraciones-portfolio.ts` (consolidado, no duplicado) |
| `/admin/docs/diagrama-secuencia` | Secuencias: login OAuth, check de monitor→alerta, middleware de seguridad, contacto | Mermaid inline |
| `/admin/docs/diagrama-componentes` | Componentes/despliegue: browser → Vercel (Astro SSR + middleware + APIs) → Turso/Blob/GitHub/ntfy/cron-job.org | Mermaid inline |
| `/admin/docs/diagrama-clases` | Clases/entidades derivadas de `src/db/schema.ts` (CRM, observabilidad, seguridad, lab) | Mermaid inline |
| `/admin/docs/diagrama-objetos` | Instantáneas concretas de instancias reales (proyecto+servicios, pago+eventos+IP bloqueada) | Mermaid inline |
| `/admin/docs/kanban` | Tablero XP del proyecto portfolio (iteraciones reales del historial git) | `src/data/iteraciones-portfolio.ts` |

## 3. Decisiones de arquitectura

- **Datos como código**: RF/RNF/CU viven en `src/data/documentacion.ts` tipados;
  las páginas solo renderizan. Un cambio de requerimiento = un commit revisable.
- **Kanban sin duplicación**: `IteracionesBoard.astro` se parametrizó con props
  (`pares`, `columnas`, `iteraciones`, `commitsPorMes`, `repo`, `subtitle`,
  `showBiblio`) manteniendo los datos de DobleYo como default, así
  `/projects/dobleyo` no cambia y `/admin/docs/kanban` reutiliza el mismo motor
  con `src/data/iteraciones-portfolio.ts`.
- **Iteraciones ancladas al historial real**: rangos y conteos de commits salen
  de `git log` de `mikerb95/dev-portfolio` (abr: 80, may: 21, jun: 104,
  jul 1–5: 126, jul 6–9: 107). Cada historia lleva DoD inferido de lo entregado.
- **Diagramas con Mermaid 11 (dependencia npm, no CDN)**: el CSP de `/admin` es
  `script-src 'self'`, así que `mermaid` se instaló como dependencia y se
  importa localmente (`import mermaid from 'mermaid'`) en cada página de
  diagrama; Vite lo bundlea con el resto del JS del sitio. Texto de los
  diagramas versionable en el repo, render en el cliente, sin costo en el
  sitio público (solo se carga en páginas admin).
- **Navegación**: una sola entrada "Documentación" en la sidebar (grupo
  *Proyecto*); las subpáginas se navegan con `DocsNav.astro` (tabs horizontales
  con estado activo por ruta).
- **Protección**: las rutas cuelgan de `/admin/*`, cubiertas por el middleware
  existente (sesión GitHub + allowlist). No requieren cambios de auth.

## 4. Convenciones de IDs

- `RF-<módulo><nn>`: 0x público, 1x auth, 2x CRM, 3x finanzas, 4x observabilidad,
  5x LAB, 6x seguridad, 7x sistema.
- `RNF-<nn>` agrupados por categoría ISO 25010.
- `CU-<nn>` con trazabilidad a RF (`rf: []`).
- Historias del kanban: `PF-<iter>-<nn>`.

## 5. Checklist de la Fase 1 (esta entrega)

- [x] Grupo "Documentación" en `Sidebar.astro` con enlace a `/admin/docs`
- [x] `DocsNav.astro` compartido entre las 10 subpáginas
- [x] `documentacion.ts`: ~45 RF, ~18 RNF, 6 actores, 18 CU, 6 CU extendidos
- [x] Páginas de RF, RNF, CU y CU extendidos (render desde datos)
- [x] 4 diagramas de secuencia, 1 de componentes, 3 de clases, 2 de objetos (Mermaid)
- [x] `mermaid` instalado como dependencia npm (bundle local, respeta CSP `script-src 'self'`)
- [x] `iteraciones-portfolio.ts` con 5 iteraciones e historias con DoD
- [x] `IteracionesBoard` parametrizado (default DobleYo intacto)
- [x] Página kanban montando el board con datos del portfolio
- [x] Build de producción verificado (`npm run build`)

## 5.b Entregado después de la Fase 1 (jul 21-24 2026)

- [x] `/docs/historias-de-usuario` - catálogo consolidado desde las historias del
      kanban, agrupado por rol, sin duplicar datos.
- [x] `/docs/diagrama-paquetes` - el diagrama UML que faltaba, con su versión
      ilustrada.
- [x] `/docs/testing` - guía completa del testing del proyecto (plan propio en
      `plan-testing-docs.md`), con datos tipados en `src/data/testing.ts`.
- [x] `/docs/verificacion-validacion` - reclasificación de esos mismos niveles
      bajo el marco de V&V, con niveles de integridad y procesos del ciclo de
      vida; `src/data/vyv.ts` los referencia por id en vez de duplicarlos, y
      `tests/vyv.test.ts` verifica esa integridad referencial.
- [x] `/docs/usability-testing` - metodología de validación con usuarios reales
      sobre el flujo de descarga del CV.
- [x] `/docs/pipeline-en-vivo` - estado real de la última corrida del pipeline,
      etapa por etapa, en vez de un diagrama estático.
- [x] `/docs/presentacion` - deck de sustentación.
- [x] `/docs/diagrama-bpmn` - los 4 procesos de negocio en notación BPMN real
      (carriles por participante, compuertas con marcador, eventos de inicio /
      intermedio / fin, flujos de secuencia y de mensaje). **No usa Mermaid**:
      Mermaid no tiene tipo de diagrama BPMN y un flowchart disfrazado no dibuja
      la notación. Tampoco `bpmn-js`, que habría metido ~500 KB de dependencia
      de UI por cuatro diagramas. El SVG se genera en el servidor desde un
      modelo tipado (`src/data/bpmn.ts`) con un motor de layout propio
      (`src/lib/bpmn-layout.ts`): posiciones en grilla, ruteo ortogonal y corte
      de etiquetas, sin JavaScript en el cliente.

      La decisión que hizo viable el enfoque fue tratar la geometría como algo
      verificable: `tests/bpmn.test.ts` comprueba que ninguna flecha atraviese
      una figura ajena, que no haya nodos ni etiquetas encimados, que toda
      compuerta abra ramas etiquetadas y que todo camino llegue a un fin. Esa
      verificación encontró tres cruces reales, una etiqueta de compuerta
      pisada por la de su rama, dos ramas cuyos "sí"/"no" caían en el mismo
      punto (y por tanto se leían sobre el camino contrario) y una tarea sin
      salida en el modelo de seguridad.

      Ampliado después con lo que pidió la sustentación: la explicación de los
      **5 tipos de compuerta** (cada símbolo dibujado por el mismo componente
      que el diagrama, con qué hace al dividir y al juntar caminos), y la
      **especificidad temporal** - temporizadores de borde donde el código
      realmente corta por tiempo (12 s del sondeo HTTP, 72 h del token de
      invitación), anotaciones de duración sobre las figuras, y una tabla de
      tiempos por proceso donde cada valor cita la constante que lo fija. El
      único tiempo que no vive en el repositorio (la cadencia del cron, que se
      configura en cron-job.org) se declara explícitamente como externo en vez
      de inventarle un origen.

- [x] `/docs/bpmn-imprimible` - los mismos cuatro procesos **transpuestos** y
      sobre papel, para el documento de arquitectura, que es vertical. El motor
      de layout aprendió una orientación (`layout(proceso, 'vertical')`): los
      carriles pasan a ser columnas y el proceso baja. No es el diagrama girado
      (eso habría dejado el texto de lado), sino otro layout sobre el mismo
      modelo: la tarea se estrecha y se alarga porque al bajar el eje caro es el
      ancho, y la etiqueta de eventos y compuertas se va al costado porque
      debajo la parte en dos la flecha de salida. El ruteo sí se reutiliza tal
      cual, reflejando los nodos sobre la diagonal antes de enrutar y los puntos
      después: una segunda copia de los cuatro casos de trazo habría sido dos
      sitios donde corregir cada defecto.

      Dos hallazgos del camino, ambos del verificador de geometría:
      reservar el hueco lateral de la etiqueta en **todas** las filas ensanchaba
      el diagrama de monitoreo en 320 px que nadie ocupaba (una fila de puras
      tareas lleva su texto dentro de la caja), y la comprobación de "etiqueta
      de rama sobre una figura" eximía al nodo de origen - con lo que un bucle
      de reintento escribía su condición encima de su propia tarea sin que nadie
      protestara. Las etiquetas de rama ahora se colocan resolviendo choques:
      avanzan sobre su propio trazo hasta encontrar hueco.

      Salidas: `/docs/bpmn-imprimible` (fondo blanco, `@page` A4, un proceso por
      hoja con su tabla de tiempos) y `npm run bpmn:export`, que escribe
      `docs/diagramas-bpmn/<proceso>-vertical.{svg,png}` para insertarlos en el
      DEA. El SVG lleva dentro los estilos y las tipografías, y el PNG se
      rasteriza desde ese mismo SVG: la imagen y el vector no pueden divergir.

El menú (`DocsNav.astro`) pasó de 10 a 18 pestañas.

## 5.c Entregado después (30 jul 2026) - las notaciones que Mermaid no dibuja

Cuatro diagramas UML más, con el mismo enfoque que el BPMN: modelo tipado en
`src/data/`, motor de layout propio en `src/lib/`, SVG generado en el servidor y
geometría verificada por tests. Registrado como **RF-707** en
`documentacion.ts`.

| Ruta | Modelo | Motor | Tests |
|---|---|---|---|
| `/docs/diagrama-despliegue` | `src/data/despliegue.ts` | `src/lib/uml-deployment.ts` | `tests/uml-deployment.test.ts` |
| `/docs/diagrama-comunicacion` | `src/data/comunicacion.ts` | `src/lib/uml-communication.ts` | `tests/uml-communication.test.ts` |
| `/docs/diagrama-actividades` | `src/data/actividades.ts` | `src/lib/uml-activity.ts` | `tests/uml-activity.test.ts` |
| `/docs/diagrama-componentes` | `src/data/componentes.ts` | `src/lib/uml-component.ts` | `tests/uml-component.test.ts` |

- **Por qué no Mermaid**: no tiene diagrama de comunicación ni de despliegue, y
  su flowchart no es notación de actividad (sin barra de bifurcación, sin
  particiones, sin distinguir final de flujo de final de actividad). El
  descarte fue por incapacidad de la herramienta, no por gusto. Con esto, las
  páginas que siguen siendo Mermaid inline son las de secuencia, clases y
  objetos, donde sí tiene la notación.
- **`/docs/diagrama-componentes` era un diagrama equivocado**: un flowchart de
  despliegue sin una sola interfaz declarada, es decir, la vista de despliegue
  duplicada. Se rehízo como diagrama de componentes real, con interfaces
  provistas/requeridas y conectores de ensamblaje. Un test falla si algún
  componente vuelve a nombrar un proveedor de infraestructura, que es la
  recaída concreta que lo tenía duplicando la otra vista.
- **Reutilización, no copia**: los tres motores nuevos toman del motor BPMN la
  geometría genérica (corte de texto, polilíneas redondeadas, punto sobre la
  traza, detección de cruces) y aportan solo lo propio de cada notación.
- **Los tests verifican notación, no solo geometría** - que es lo que un repaso
  visual no atrapa: toda decisión con dos salidas o más y todas con guarda,
  toda unión con una sola salida, ningún nodo final con transiciones salientes,
  ningún nodo inalcanzable, numeración decimal sin repeticiones ni niveles
  huérfanos, todo camino de comunicación con su protocolo, y una bola por
  interfaz provista en vez de una por consumidor.
- **Comunicación y secuencia son las mismas cuatro interacciones**, enlazadas en
  ambos sentidos: en UML son equivalentes, y tenerlas enfrentadas hace visible
  que una de las dos se quedó atrás.

El menú pasó de 18 a 20 pestañas (`Comunicación`, `Actividades`, `Despliegue`;
`bpmn-imprimible` y `presentacion` no van en el menú).

## 5.d Entregado después (6 ago 2026) - roles, niveles de autoridad y RACI

Dos páginas sobre un solo modelo tipado (`src/data/gobernanza.ts`):
`/docs/roles` (la pirámide estratégico / táctico / operativo, con lo que cada
nivel decide y lo que no puede hacer) y `/docs/raci` (la matriz de las 12
actividades críticas). Reglas verificadas en `tests/gobernanza.test.ts`.
Registrado como **RNF-24** en `documentacion.ts`.

- **Empezó como una sola página** y se separó a pedido. Lo único que se comparte
  fuera del modelo son los tokens de color (`src/lib/gobernanza-estilos.ts`): si
  el nivel «estratégico» fuera violeta en la pirámide y ámbar en la matriz,
  nadie relacionaría una columna con su nivel. Cada página enlaza a la otra al
  cierre, que es lo que sostiene el argumento cuando ya no comparten pantalla.

- **La tesis que sostiene la página**: en un proyecto de una sola persona los
  tres niveles no separan personas, separan tipos de decisión. Publicar es una
  decisión reservada (regla de deploys en `CLAUDE.md`), revertir es automática
  (job «Verificar deploy + rollback» de `ci.yml`) y ejecutar no incluye ni
  publicar ni destruir (migraciones aditivas, secretos solo por endpoint bajo
  sesión). Cada fila de la matriz lleva su `evidencia`: el archivo o mecanismo
  donde esa frontera existe de verdad. Sin ese campo la tabla sería una
  declaración de intenciones, que es en lo que suele quedar una matriz RACI.
- **Las reglas de la lámina son un test, no un pie de tabla**: un solo aprobador
  y al menos un responsable por actividad. Al escribirlas como prueba, cuatro
  de las doce filas iniciales resultaron incumplirlas (dos con aprobador pero
  sin ejecutor, dos sin aprobador). Una fila mal asignada se renderiza igual de
  bonita, así que nada visual lo habría delatado.
- **Una celda es un arreglo de roles, no una letra**: `['A', 'R']` es el caso
  normal aquí, no una excepción. Forzar una sola letra por celda habría obligado
  a mentir en la mitad de las filas.
- **Lo que la página declara que NO puede afirmar**: al ocupar una misma persona
  los tres niveles, la separación protege contra el error, la prisa y el olvido,
  no contra alguien que decida saltársela. Es la misma limitación estructural
  que ya reconoce el nivel de integridad 4 en `/docs/verificacion-validacion`.

## 5.e Entregado después (2 sep 2026) - planteamiento, justificación y objetivos

El hueco de fondo de toda la sección: `/docs` describía **qué** hace el sistema
y con qué evidencia, pero el **porqué** no estaba escrito en ninguna parte.
Existía repartido en dos párrafos de alcance del índice y en el gancho retórico
del deck de sustentación, y los únicos objetivos redactados (plan de
implantación y plan de capacitación) son de otra cosa. Entregado como
`src/data/planteamiento.ts` + `/docs/planteamiento`, registrado como **RF-716**.

- **Tres conjuntos de objetivos que no se pueden mezclar**: los del sistema
  (esta página), los de la puesta en producción (`plan_de_implementacion.md`,
  OE-01 a OE-08) y los de la transferencia a quien lo opera
  (`plan-de-capacitacion.md`). Por eso los de aquí se numeran `OBJ-xx` y no
  `OE-xx`, y la página lo dice explícitamente al cierre: confundirlos es la
  forma más rápida de declarar cumplido lo que nadie midió.
- **La prueba que de verdad sostiene el documento es la inversa**: no que los
  objetivos citen requisitos que existen (eso también se comprueba), sino que
  **ningún módulo de requisitos exista sin un objetivo que lo reclame**. Un
  módulo huérfano es alcance que se coló sin que nadie lo pidiera. La regla
  hermana impide que dos objetivos se repartan el mismo módulo, que es como se
  disimula un objetivo que en realidad no tiene contenido propio.
- **El árbol de problemas cierra por sus dos mitades**: ningún síntoma sin causa
  que lo explique, ninguna causa que no explique ningún síntoma. Cada síntoma
  lleva cómo se constató y qué cuesta dejarlo estar, porque un síntoma sin
  evidencia es una hipótesis y uno sin consecuencia no justifica gastar tiempo.
- **El .md de la entrega académica es una salida, no una copia**:
  `docs/planteamiento-del-problema.md` se genera con
  `npm run planteamiento:export` y un test compara el archivo del repositorio
  contra lo que el exportador produce hoy. Escribirlo a mano habría creado la
  segunda versión del mismo texto que RNF-14 existe para impedir.

## 6. Fases futuras

- **Fase 2 - Vivo**: derivar el estado de RF desde los tests (cada RF apunta a
  su spec en `tests/`); commits por iteración vía API de GitHub en runtime.
- **Fase 3 - Trazabilidad completa**: matriz RF ↔ CU ↔ historias ↔ tests en el hub.
- **Fase 4 - Export**: exportar la documentación como PDF/HTML estático para
  entregas académicas (SENA) o comerciales, reutilizando el patrón `export/` de DobleYo.
- **Fase 5 - Demo pública**: versión read-only de `/admin/docs` en la vitrina
  pública (`/tools`), alineada con el pendiente "demo read-only del admin".

## 7. Mantenimiento

- Nuevo requerimiento → añadirlo a `documentacion.ts` (estado `planeado`),
  promoverlo a `parcial`/`implementado` al entregarlo. Si además abre un frente
  que ningún objetivo del proyecto reclamaba, el objetivo va en
  `planteamiento.ts` **antes** que el requisito: `tests/planteamiento.test.ts`
  falla si un módulo funcional se queda sin objetivo que lo justifique.
- Cambio del planteamiento, la justificación o los objetivos → editar
  `src/data/planteamiento.ts` y correr `npm run planteamiento:export`; el `.md`
  de `docs/` nunca se edita a mano.
- Cierre de iteración → nueva entrada en `iteraciones-portfolio.ts` con
  `git rev-list --count --since --until` para el conteo de commits.
- Cambio de schema → actualizar el diagrama de clases en la misma PR.
- Diagrama nuevo con motor propio → modelo tipado en `src/data/`, motor en
  `src/lib/` reutilizando la geometría del de BPMN, y test de geometría **y**
  notación en `tests/`. Un diagrama cuya corrección solo se comprueba mirándolo
  vuelve a estar mal a la tercera edición.
- Cambio de arquitectura (nodo, servicio externo, interfaz entre componentes) →
  tocar `src/data/{despliegue,componentes}.ts` en la misma PR: los tests de UML
  no detectan que el modelo esté desactualizado, solo que sea consistente.
